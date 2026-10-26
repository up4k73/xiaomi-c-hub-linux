#!/usr/bin/env python3
"""Import only renderer assets from a user-supplied Xiaomi C-HUB package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import zipfile

MAX_ARCHIVE = 256 * 1024 * 1024
MAX_HEADER = 16 * 1024 * 1024
MAX_RENDERER = 128 * 1024 * 1024


class Asar:
    def __init__(self, source):
        self.stream = source.open('rb')
        self.size = source.stat().st_size
        try:
            prefix = self.stream.read(16)
            if len(prefix) != 16:
                raise ValueError('Truncated ASAR header')
            header_size = struct.unpack_from('<I', prefix, 4)[0]
            json_size = struct.unpack_from('<I', prefix, 12)[0]
            self.offset = 8 + header_size
            if not 0 < json_size <= MAX_HEADER or not 16 + json_size <= self.offset <= self.size:
                raise ValueError('Invalid ASAR header size')
            self.header = json.loads(self.stream.read(json_size))
        except Exception:
            self.stream.close()
            raise

    def entry(self, parts):
        node = self.header
        for part in parts:
            node = node['files'][part]
        return node

    def read(self, entry):
        if 'link' in entry or entry.get('unpacked') or 'files' in entry:
            raise ValueError('Linked or unpacked renderer files are not supported')
        offset, size = int(entry['offset']), int(entry['size'])
        if offset < 0 or not 0 <= size <= MAX_RENDERER or self.offset + offset + size > self.size:
            raise ValueError('Invalid ASAR file extent')
        self.stream.seek(self.offset + offset)
        data = self.stream.read(size)
        if len(data) != size:
            raise ValueError('Truncated ASAR file')
        return data

    def close(self):
        self.stream.close()


def walk(node, prefix=()):
    for name, item in node['files'].items():
        if not name or name in ('.', '..') or any(c in name for c in ('/', '\\', '\0', ':')):
            raise ValueError('Unsafe renderer path')
        parts = prefix + (name,)
        if 'link' in item:
            raise ValueError('Linked renderer files are not supported')
        if 'files' in item:
            yield from walk(item, parts)
        else:
            yield parts, item


def import_asar(source, destination):
    archive = Asar(source)
    try:
        package = json.loads(archive.read(archive.entry(('package.json',))))
        if package.get('name') != 'xiaomi-c-hub' or package.get('version') != '2.4.3':
            raise ValueError('Supported package: xiaomi-c-hub 2.4.3')
        manifest, total = {}, 0
        for parts, entry in walk(archive.entry(('out', 'renderer'))):
            total += int(entry['size'])
            if total > MAX_RENDERER or len(manifest) >= 5000:
                raise ValueError('Renderer exceeds import limits')
            data = archive.read(entry)
            target = destination.joinpath('out', 'renderer', *parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            manifest['/'.join(parts)] = hashlib.sha256(data).hexdigest()
        if 'index.html' not in manifest:
            raise ValueError('Renderer index.html is missing')
        (destination / 'manifest.json').write_text(json.dumps({
            'package': package['name'], 'version': package['version'],
            'files': manifest,
        }, indent=2) + '\n')
        return len(manifest)
    finally:
        archive.close()


def import_renderer(source, destination):
    source, destination = Path(source), Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('Destination already exists; move it aside before importing again')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.chub-import-', dir=destination.parent) as temp:
        temp = Path(temp)
        asar = source
        if source.suffix.lower() in ('.msix', '.appx'):
            with zipfile.ZipFile(source) as package:
                matches = [entry for entry in package.infolist()
                           if entry.filename.endswith('/resources/app.asar')]
                if len(matches) != 1 or matches[0].file_size > MAX_ARCHIVE:
                    raise ValueError('Expected one bounded resources/app.asar in the package')
                asar = temp / 'app.asar'
                with package.open(matches[0]) as src, asar.open('wb') as dst:
                    shutil.copyfileobj(src, dst)
        elif source.suffix.lower() != '.asar':
            raise ValueError('Supply the official .msix, .appx or app.asar file')
        output = temp / 'vendor'
        output.mkdir()
        count = import_asar(asar, output)
        output.rename(destination)
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Official Xiaomi C-HUB 2.4.3 MSIX or app.asar')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'vendor')
    args = parser.parse_args()
    try:
        count = import_renderer(args.source, args.output)
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        parser.exit(1, f'Import failed: {error}\n')
    print(f'Imported {count} renderer files into {args.output}')


if __name__ == '__main__':
    main()
