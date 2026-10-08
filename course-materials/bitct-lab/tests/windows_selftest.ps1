# Windows self-test of the bitct-lab kit: run every lab's student procedure on this PC.
# For the teacher or a volunteer, on a Windows 10/11 PC with Docker Desktop (see tests/WINDOWS-TEST.md).
#
# Start it from PowerShell, inside the bitct-lab folder:
#     powershell -ExecutionPolicy Bypass -File tests\windows_selftest.ps1
#
# Needs only Docker Desktop: the test runner itself runs in a small helper container.
# Writes tests\out\selftest-windows.log and one transcript per lab. Takes 10-20 minutes,
# most of it downloading the images the first time. Leaves no lab running.
# (This file is plain ASCII on purpose: Windows PowerShell 5.1 misreads other characters.)

$ErrorActionPreference = 'Continue'
$Kit = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Kit 'tests\out'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Log = Join-Path $Out 'selftest-windows.log'
Set-Content -Path $Log -Value "bitct-lab Windows self-test" -Encoding UTF8
$Img = 'ghcr.io/davidepatti/bitct-lab:2026.10'
$Helper = 'docker:29-cli'
$RuntimeLabs = @('dlab00-setup', 'dlab01-auth', 'dlab02-transaction', 'dlab03-structures', 'dlab04-consensus',
                 'dlab05-wallet', 'dlab06-attest', 'dlab07-anchor', 'dlab08-channel', 'dlab09-routing', 'dlab11-esp32')

function Say([string]$Line) { Write-Host $Line; Add-Content -Path $Log -Value $Line -Encoding UTF8 }
function Step([string]$Title) { Say ''; Say ('=================== {0} ({1})' -f $Title, (Get-Date -Format 'HH:mm:ss')) }

# Run a program, show and log every output line (stdout and stderr), return its exit code.
function Invoke-Logged {
    param([Parameter(Mandatory = $true)][string]$Exe, [string[]]$CmdArgs = @())
    & $Exe @CmdArgs 2>&1 | ForEach-Object { Say ([string]$_) }
    return $LASTEXITCODE
}

# Large image layers are sometimes cut by the network: retry before giving up.
function Get-Image([string]$Ref) {
    for ($i = 1; $i -le 3; $i++) {
        if ((Invoke-Logged docker @('pull', $Ref)) -eq 0) { return $true }
        Say "pull of $Ref failed (attempt $i of 3); retrying in 10 s"
        Start-Sleep -Seconds 10
    }
    return $false
}

# Ask a page the way the student's browser does (localhost, published port).
function Test-Page([string]$Url, [string]$Expect) {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
        $ok = $r.Content -match [regex]::Escape($Expect)
        Say ("{0} -> HTTP {1}, '{2}' {3}" -f $Url, $r.StatusCode, $Expect, $(if ($ok) { 'found' } else { 'NOT found' }))
        return $ok
    } catch {
        Say ("{0} -> FAILED: {1}" -f $Url, $_.Exception.Message)
        return $false
    }
}

Step 'system'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
Say ('{0} {1} (build {2}), {3}' -f $os.Caption, $os.Version, $os.BuildNumber, $env:PROCESSOR_ARCHITECTURE)
Say ('{0} logical CPUs, {1:N1} GB RAM, PowerShell {2}' -f $cs.NumberOfLogicalProcessors, ($cs.TotalPhysicalMemory / 1GB), $PSVersionTable.PSVersion)
$env:WSL_UTF8 = '1'
Invoke-Logged wsl @('--version') | Out-Null
if ((Invoke-Logged docker @('version', '--format', 'Docker client {{.Client.Version}}, engine {{.Server.Version}} ({{.Server.Os}}/{{.Server.Arch}})')) -ne 0) {
    Say 'Docker is not answering. Start Docker Desktop, wait until it shows "Engine running", then run this script again.'
    exit 1
}
Invoke-Logged docker @('compose', 'version') | Out-Null
Invoke-Logged docker @('info', '--format', 'Docker VM: {{.NCPU}} CPUs, {{.MemTotal}} bytes of memory') | Out-Null
Say "kit folder: $Kit"

Step 'stop labs that are still running (all labs use port 8080)'
Push-Location $Out
foreach ($p in (& docker compose ls -q 2>$null)) {
    if ($p -like 'bitct-*') {
        Say "stopping $p"
        Invoke-Logged docker @('compose', '-p', $p, 'down', '--remove-orphans') | Out-Null
    }
}
Pop-Location

Step 'pull the published images (what students download)'
if (-not (Get-Image $Img)) {
    Say "Could not download $Img. Check the network (Wi-Fi, VPN, proxy, firewall) and run the script again."
    exit 1
}
$HaveMl = Get-Image "$Img-ml"
if (-not $HaveMl) { Say "Could not download $Img-ml: the DLAB 10 notebook test will be skipped." }
foreach ($i in @($Img, "$Img-ml")) {
    Invoke-Logged docker @('image', 'inspect', $i, '--format', "$i : {{.Os}}/{{.Architecture}}, {{.Size}} bytes, {{len .RootFS.Layers}} layers") | Out-Null
}

Step 'image contents'
Invoke-Logged docker @('run', '--rm', $Img, 'bash', '-c',
    'cat /etc/bitct/version; bitcoind -version | head -1; lnd --version; python3 --version') | Out-Null

Step 'helper container for the test runner'
if (-not (Get-Image $Helper)) { Say "Could not download $Helper (Docker Hub)."; exit 1 }

Step 'run every lab procedure (runner inside the helper container)'
$labList = $RuntimeLabs -join ' '
# No double quotes inside $inner: Windows PowerShell 5.1 does not escape them for native programs.
$inner = "apk add --no-cache python3 bash >/dev/null && for lab in $labList; do " +
         "echo; echo =================== lab `$lab `$(date +%H:%M:%S); " +
         "python3 tests/run_lab.py `$lab; echo result `$lab: `$?; done"
Invoke-Logged docker @('run', '--rm', '-e', 'RUNNER_IN_CONTAINER=1',
    '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', "${Kit}:/kit", '-w', '/kit',
    $Helper, 'sh', '-c', $inner) | Out-Null

Step 'dashboard as the browser sees it (DLAB 00 on http://localhost:8080)'
Push-Location (Join-Path $Kit 'labs\dlab00-setup')
Invoke-Logged docker @('compose', 'down', '--volumes') | Out-Null
$portOk = $false
if ((Invoke-Logged docker @('compose', 'up', '-d', '--wait')) -eq 0) {
    $portOk = Test-Page 'http://localhost:8080/' 'block height'
}
Invoke-Logged docker @('compose', 'down', '--volumes') | Out-Null
Pop-Location
Say ('result dashboard-port: {0}' -f $(if ($portOk) { 0 } else { 1 }))

if ($HaveMl) {
    Step 'lab dlab10-graph (JupyterLab on http://localhost:8888)'
    Push-Location (Join-Path $Kit 'labs\dlab10-graph')
    Invoke-Logged docker @('compose', 'down', '--volumes') | Out-Null
    $nbRc = 1
    if ((Invoke-Logged docker @('compose', 'up', '-d', '--wait')) -eq 0) {
        Test-Page 'http://localhost:8888/lab' 'JupyterLab' | Out-Null
        Invoke-Logged docker @('compose', 'cp', '..\..\tests\run_notebook.py', 'notebook:/tmp/run_notebook.py') | Out-Null
        $nbOut = & docker compose exec -T notebook python3 /tmp/run_notebook.py /lab/dlab10-graph-learning.ipynb 2>&1
        $nbRc = $LASTEXITCODE
        $nbOut | Select-Object -Last 25 | ForEach-Object { Say ([string]$_) }
    }
    Invoke-Logged docker @('compose', 'down', '--volumes') | Out-Null
    Pop-Location
    Say "result dlab10-graph: $nbRc"
} else {
    Step 'lab dlab10-graph skipped (no -ml image)'
}

Step 'done - results (0 = passed; any other number = look at that lab above)'
$results = Select-String -Path $Log -Pattern '^(== .*steps passed|result )' | ForEach-Object { $_.Line }
$results | ForEach-Object { Write-Host $_ }
$failed = @($results | Where-Object { $_ -match '^result ' -and $_ -notmatch ': 0$' }).Count
$total = @($results | Where-Object { $_ -match '^result ' }).Count
Say ("{0} of {1} checks passed. Log: {2}" -f ($total - $failed), $total, $Log)
if ($failed -gt 0 -or $total -lt 12) { exit 1 } else { exit 0 }
