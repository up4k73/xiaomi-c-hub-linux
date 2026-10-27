#!/usr/bin/env python3
"""Build ready-to-run Linux x86-64 packages from pinned inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]


def digest(path):
    result=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()


def acquire(name, specification, cache):
    target=cache/name
    if target.exists() and digest(target)==specification['sha256']:return target
    part=target.with_suffix(target.suffix+'.part')
    print('Downloading build input: '+name,flush=True)
    with urllib.request.urlopen(specification['url'],timeout=120) as response,part.open('wb') as output:
        shutil.copyfileobj(response,output)
    if digest(part)!=specification['sha256']:
        part.unlink(missing_ok=True)
        raise RuntimeError('Build input checksum mismatch: '+name)
    part.replace(target)
    return target


def write(path,text,mode=0o644):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text)
    path.chmod(mode)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--electron-zip',type=Path,help='Reuse an archive matching the pinned Electron SHA256')
    parser.add_argument('--formats',default='deb,tar,appimage')
    args=parser.parse_args()
    if platform.system()!='Linux' or platform.machine().lower() not in {'x86_64','amd64'}:
        parser.error('Build on Linux x86-64')
    formats=set(args.formats.split(','))
    if not formats or not formats <= {'deb','tar','appimage'}:parser.error('Unknown package format')
    os.chdir(ROOT)
    package=json.loads((ROOT/'package.json').read_text())
    toolchain=json.loads((ROOT/'packaging/toolchain.json').read_text())
    version=package['version']
    cache=ROOT/'.cache';cache.mkdir(exist_ok=True)
    dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    work=cache/'package-build'
    if work.exists():shutil.rmtree(work)
    work.mkdir()
    archive=args.electron_zip or acquire('electron-linux-x64.zip',toolchain['electron'],cache)
    if digest(archive)!=toolchain['electron']['sha256']:raise RuntimeError('Unexpected Electron archive')
    appdir=work/'Xiaomi-C-HUB-Linux.AppDir';appdir.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            parts=Path(entry.filename).parts
            if Path(entry.filename).is_absolute() or '..' in parts:raise RuntimeError('Unsafe Electron archive')
            bundle.extract(entry,appdir)
            target=appdir/entry.filename
            mode=entry.external_attr>>16
            if mode and target.exists():target.chmod(mode&0o777)
    (appdir/'electron').rename(appdir/'xiaomi-c-hub-linux')
    (appdir/'xiaomi-c-hub-linux').chmod(0o755)
    (appdir/'chrome-sandbox').chmod(0o755)
    (appdir/'resources/default_app.asar').unlink(missing_ok=True)
    app=appdir/'resources/app';app.mkdir(parents=True)
    for name in ['src','package.json','vendor-source.json','LICENSE','NOTICE.md']:
        source=ROOT/name
        if source.is_dir():shutil.copytree(source,app/name)
        else:shutil.copy2(source,app/name)
    (app/'test').mkdir();shutil.copy2(ROOT/'test/gui-smoke.cjs',app/'test/gui-smoke.cjs')
    (app/'packaging').mkdir()
    shutil.copytree(ROOT/'packaging/certificates',app/'packaging/certificates')
    shutil.copytree(ROOT/'packaging/licenses',app/'packaging/licenses')
    shutil.copy2(ROOT/'packaging/install-usb-access.sh',app/'packaging/install-usb-access.sh')
    modules=subprocess.check_output(['npm','ls','--omit=dev','--all','--parseable'],text=True).splitlines()[1:]
    for module in modules:
        source=Path(module)
        relative=source.relative_to(ROOT/'node_modules')
        if not source.resolve().is_relative_to((ROOT/'node_modules').resolve()):raise RuntimeError('External module symlink')
        shutil.copytree(source,app/'node_modules'/relative,dirs_exist_ok=True)
    shutil.copy2(ROOT/'packaging/xiaomi-c-hub-linux.desktop',appdir/'xiaomi-c-hub-linux.desktop')
    shutil.copy2(ROOT/'packaging/xiaomi-c-hub-linux.svg',appdir/'xiaomi-c-hub-linux.svg')
    (appdir/'.DirIcon').symlink_to('xiaomi-c-hub-linux.svg')
    write(appdir/'usr/share/metainfo/io.github.up4k73.xiaomi-c-hub-linux.metainfo.xml',
          (ROOT/'packaging/io.github.up4k73.xiaomi-c-hub-linux.metainfo.xml').read_text())
    write(appdir/'AppRun','#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$HERE/xiaomi-c-hub-linux" "$@"\n',0o755)
    epoch=int(os.environ.get('SOURCE_DATE_EPOCH','1793044800'))
    environment=dict(os.environ,SOURCE_DATE_EPOCH=str(epoch),ARCH='x86_64')
    outputs=[]
    if 'tar' in formats:
        target=dist/'xiaomi-c-hub-linux-x86_64.tar.gz'
        def normalize(entry):
            entry.uid=entry.gid=0;entry.uname=entry.gname='';entry.mtime=epoch
            return entry
        with tarfile.open(target,'w:gz',compresslevel=6) as archive:
            archive.add(appdir,arcname='xiaomi-c-hub-linux',filter=normalize)
        outputs.append(target)
    if 'deb' in formats:
        deb=work/'deb';application=deb/'opt/xiaomi-c-hub-linux'
        shutil.copytree(appdir,application,symlinks=True)
        (application/'chrome-sandbox').chmod(0o4755)
        installed_size=sum(p.stat().st_size for p in application.rglob('*') if p.is_file())//1024
        write(deb/'DEBIAN/control',f'''Package: xiaomi-c-hub-linux
Version: {version}
Architecture: amd64
Maintainer: a. p. <60435727+up4k73@users.noreply.github.com>
Section: sound
Priority: optional
Installed-Size: {installed_size}
Depends: libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2 | libasound2t64, libgbm1, libxss1, libnotify4, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libdrm2, libx11-xcb1, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, ca-certificates, udev, pkexec | policykit-1
Homepage: https://github.com/up4k73/xiaomi-c-hub-linux
Description: Linux controls for Xiaomi Desktop Speaker Pro Set
 Native Electron application with automatic first-launch interface setup.
''')
        write(deb/'DEBIAN/postinst','#!/bin/sh\nset -e\nif [ "$1" = configure ]; then\n /bin/sh /opt/xiaomi-c-hub-linux/resources/app/packaging/install-usb-access.sh\nfi\n',0o755)
        write(deb/'DEBIAN/postrm','#!/bin/sh\nif [ "$1" = purge ]; then udevadm control --reload-rules || true; fi\n',0o755)
        rule='/etc/udev/rules.d/71-xiaomi-c-hub-linux.rules'
        write(deb/rule.lstrip('/'),(ROOT/'packaging/71-xiaomi-c-hub.rules').read_text())
        write(deb/'DEBIAN/conffiles',rule+'\n')
        (deb/'usr/bin').mkdir(parents=True)
        (deb/'usr/bin/xiaomi-c-hub-linux').symlink_to('/opt/xiaomi-c-hub-linux/xiaomi-c-hub-linux')
        write(deb/'usr/share/applications/xiaomi-c-hub-linux.desktop',(ROOT/'packaging/xiaomi-c-hub-linux.desktop').read_text())
        write(deb/'usr/share/icons/hicolor/scalable/apps/xiaomi-c-hub-linux.svg',(ROOT/'packaging/xiaomi-c-hub-linux.svg').read_text())
        target=dist/'xiaomi-c-hub-linux_amd64.deb'
        subprocess.run(['dpkg-deb','--root-owner-group','-Zgzip','-z6','--build',str(deb),str(target)],env=environment,check=True)
        outputs.append(target)
    if 'appimage' in formats:
        tool=acquire('appimagetool-x86_64.AppImage',toolchain['appimagetool'],cache);tool.chmod(0o755)
        runtime=acquire('runtime-x86_64',toolchain['appimage_runtime'],cache)
        target=dist/'Xiaomi-C-HUB-Linux-x86_64.AppImage'
        staging_image=work/'complete.AppImage'
        subprocess.run([str(tool),'--appimage-extract-and-run','--runtime-file',str(runtime),
                        '--comp','zstd',str(appdir),str(staging_image)],env=environment,check=True)
        staging_image.replace(target)
        outputs.append(target)
    (dist/'SHA256SUMS').write_text(''.join(digest(p)+'  '+p.name+'\n' for p in outputs))
    print(json.dumps([{'file':p.name,'bytes':p.stat().st_size} for p in outputs],indent=2))


if __name__=='__main__':main()
