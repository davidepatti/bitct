# Windows fresh-machine test (teacher or volunteer, before the course)

**Goal:** go through the kit on a Windows PC exactly as a student will, once, before the course,
so that Windows-only problems are fixed in the kit instead of in class. Students later run only
DLAB 00 as their own setup check.

**Who and when:** a colleague, a TA or one or two student volunteers, two to three weeks before
session 1. About one hour, most of it waiting for downloads.

**The PC:** Windows 10 (22H2) or Windows 11, 64-bit, ideally an ordinary Intel/AMD student laptop
where Docker has **never** been installed. At least 8 GB of RAM, 15 GB of free disk space, administrator
rights for the installation, and the network students will use (home Wi-Fi, or the university
network if the labs run there). A Windows virtual machine on an Apple-silicon Mac does **not** work:
Docker Desktop needs nested virtualization, which those VMs lack.

Keep a note of the time each part takes and of every message, prompt or doubt, even small ones.
Screenshots help: press **Win + Shift + S**.

## A · Install Docker Desktop (as a student would)

1. Download Docker Desktop for Windows from <https://docs.docker.com/desktop/setup/install/windows-install/>
   and run the installer with the default options (**Use WSL 2** ticked). Restart when asked.
2. Start Docker Desktop, accept the terms, skip sign-in. Wait for **Engine running** (bottom left).
3. Open **PowerShell** and type:

   ```powershell
   docker version
   docker compose version
   ```

   Both must answer without errors. Screenshot: Docker Desktop showing *Engine running*, and
   the PowerShell window.

Typical problems to note: "Virtualization support not detected" (virtualization is off in the
BIOS/UEFI), a request to update WSL (`wsl --update`), antivirus or firewall prompts, a second restart.

## B · Get the kit

Download <https://github.com/davidepatti/bitct/archive/refs/heads/main.zip>, right-click it → *Extract All*,
and inside the extracted folder open `course-materials\bitct-lab`. In that folder, click the
address bar, type `powershell` and press Enter: PowerShell opens there.

## C · Automatic test (about 15 minutes)

```powershell
powershell -ExecutionPolicy Bypass -File tests\windows_selftest.ps1
```

It downloads the course images, runs every lab's student procedure, checks the dashboard
(http://localhost:8080) and JupyterLab (http://localhost:8888) as a browser sees them, and leaves
nothing running. The last lines must read `13 of 13 checks passed`. If not, the lines just above
name the lab that failed. The log is `tests\out\selftest-windows.log`.

## D · By hand: what a script cannot judge (about 20 minutes)

1. **DLAB 00** – open `labs\dlab00-setup\README.md` (any text editor or GitHub) and follow
   *Start*, *Steps* and *Finish* exactly as written. Were the instructions clear? Did any command
   behave differently in PowerShell? Screenshots: PowerShell inside the lab shell, and the
   dashboard at <http://localhost:8080> in the browser.
2. **DLAB 10** – in `labs\dlab10-graph` run `docker compose up -d --wait`, open
   <http://localhost:8888>, open the notebook and run the first three cells (Shift + Enter).
   Screenshot of JupyterLab. Then `docker compose down`.
3. **DLAB 11** (optional, needs a free Wokwi account) – edit `labs\dlab11-esp32\.env` with Notepad
   (set `GROUP=` to a code of your choice), then follow the README up to step E5: the readings must
   appear as ACCEPTED at <http://localhost:8080/iot>. Then `docker compose down`.

## E · Send back

- the folder `tests\out` (right-click → *Send to* → *Compressed (zipped) folder*);
- the screenshots;
- this table, filled in:

| Part | Minutes | OK? | Problems, messages, doubts |
|---|---|---|---|
| A · Install Docker Desktop | | | |
| B · Get the kit | | | |
| C · Automatic test | | | |
| D1 · DLAB 00 by hand | | | |
| D2 · DLAB 10 JupyterLab | | | |
| D3 · DLAB 11 Wokwi (optional) | | | |

Also note the PC model, Windows edition (Settings → System → About) and the network used.
