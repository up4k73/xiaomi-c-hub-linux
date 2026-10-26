import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('import_renderer', Path(__file__).resolve().parents[1] / 'scripts/import_renderer.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_asar(path, version='2.4.3', unsafe=False):
    contents = [('package.json', json.dumps({'name': 'xiaomi-c-hub', 'version': version}).encode()),
                ('out/renderer/index.html', b'<html>fixture</html>'),
                ('out/main/index.js', b'PRIVATE MAIN'),
                ('out/renderer/assets/style.css', b'body { color: white; }')]
    header, data = {'files': {}}, bytearray()
    for name, payload in contents:
        node = header
        parts = name.split('/')
        for part in parts[:-1]:
            node = node['files'].setdefault(part, {'files': {}})
        node['files'][parts[-1]] = {'offset': str(len(data)), 'size': len(payload)}
        data.extend(payload)
    if unsafe:
        header['files']['out']['files']['renderer']['files']['..'] = {'files': {'escape': {'offset': '0', 'size': 1}}}
    raw = json.dumps(header).encode()
    padded = (len(raw) + 3) // 4 * 4
    path.write_bytes(struct.pack('<IIII', 4, padded + 8, padded + 4, len(raw)) + raw + b'\0' * (padded - len(raw)) + data)


class ImportTests(unittest.TestCase):
    def test_asar_copies_only_renderer_and_records_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_asar(root / 'app.asar')
            self.assertEqual(module.import_renderer(root / 'app.asar', root / 'vendor'), 2)
            self.assertFalse((root / 'vendor/out/main').exists())
            self.assertFalse((root / 'vendor/package.json').exists())
            manifest = json.loads((root / 'vendor/manifest.json').read_text())
            self.assertEqual(set(manifest['files']), {'index.html', 'assets/style.css'})
            with self.assertRaisesRegex(ValueError, 'already exists'):
                module.import_renderer(root / 'app.asar', root / 'vendor')

    def test_msix_imports_embedded_asar_without_extracting_other_members(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_asar(root / 'app.asar')
            with zipfile.ZipFile(root / 'official.msix', 'w') as archive:
                archive.write(root / 'app.asar', 'VFS/UserProgramFiles/Xiaomi%20C-HUB/resources/app.asar')
                archive.writestr('../outside', 'ignored')
            module.import_renderer(root / 'official.msix', root / 'vendor')
            self.assertFalse((root / 'outside').exists())
            self.assertTrue((root / 'vendor/out/renderer/index.html').is_file())

    def test_rejects_unknown_version_and_traversal_without_partial_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for version, unsafe in [('9.9.9', False), ('2.4.3', True)]:
                make_asar(root / 'app.asar', version, unsafe)
                with self.assertRaises(ValueError):
                    module.import_renderer(root / 'app.asar', root / 'vendor')
                self.assertFalse((root / 'vendor').exists())

    def test_rejects_truncated_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_asar(root / 'app.asar')
            (root / 'app.asar').write_bytes((root / 'app.asar').read_bytes()[:-10])
            with self.assertRaisesRegex(ValueError, 'extent'):
                module.import_renderer(root / 'app.asar', root / 'vendor')
            self.assertFalse((root / 'vendor').exists())
