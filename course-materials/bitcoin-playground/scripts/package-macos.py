#!/usr/bin/env python3
"""Build a portable universal macOS app using installed Apple command-line tools."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess
import tempfile
import zipfile
from build import ROOT, build

APP_NAME = 'Bitcoin Playground.app'

def run(*args):
    subprocess.run(args, check=True)

def package():
    content = build()
    (ROOT / 'bitcoin-playground.html').write_text(content)
    output = ROOT / 'output'
    output.mkdir(exist_ok=True)
    app = output / APP_NAME
    if app.exists():
        shutil.rmtree(app)
    macos = app / 'Contents/MacOS'
    resources = app / 'Contents/Resources'
    macos.mkdir(parents=True)
    resources.mkdir()
    module_cache = output / 'swift-module-cache'
    module_cache.mkdir(exist_ok=True)
    (resources / 'bitcoin-playground.html').write_text(content)
    shutil.copyfile(ROOT / 'LICENSE', resources / 'LICENSE')
    info = {'CFBundleName':'Bitcoin Playground', 'CFBundleDisplayName':'Bitcoin Playground',
            'CFBundleIdentifier':'it.bitct.bitcoin-playground', 'CFBundleVersion':'1',
            'CFBundleShortVersionString':'1.0.0', 'CFBundleExecutable':'bitcoin-playground',
            'CFBundlePackageType':'APPL', 'LSMinimumSystemVersion':'13.0',
            'NSHighResolutionCapable':True,
            'NSHumanReadableCopyright':'Copyright © 2026 Davide Patti. MIT License.'}
    with (app / 'Contents/Info.plist').open('wb') as f:
        plistlib.dump(info, f)
    with tempfile.TemporaryDirectory(prefix='bitcoin-playground-build-') as temp:
        binaries = []
        for arch in ['arm64', 'x86_64']:
            binary = str(Path(temp) / arch)
            run('xcrun', 'swiftc', '-O', '-module-cache-path', str(module_cache),
                '-target', arch + '-apple-macosx13.0', '-framework', 'Cocoa', '-framework', 'WebKit',
                str(ROOT / 'desktop/main.swift'), '-o', binary)
            binaries.append(binary)
        run('xcrun', 'lipo', '-create', *binaries, '-output', str(macos / 'bitcoin-playground'))
    run('codesign', '--force', '--sign', '-', str(app))
    run('codesign', '--verify', '--deep', '--strict', str(app))
    archive = ROOT / 'bitcoin-playground-macos.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(app.rglob('*')):
            if file.is_file():
                z.write(file, file.relative_to(output))
    print(f'Built {archive.name} ({archive.stat().st_size:,} bytes), universal arm64 + x86_64.')
    print('Local app:', app)

if __name__ == '__main__':
    package()
