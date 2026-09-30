"""Offline installer regression tests; only synthetic tiles in temporary folders."""
import contextlib
import importlib.util
import io
from pathlib import Path
import struct
import json
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

spec = importlib.util.spec_from_file_location('terrain_installer', Path(__file__).with_name('install-china-terrain.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='mumu-terrain-test-')
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.path = self.folder / 'cache/nature-maps/china-terrain.v1.pack'
        buffer = io.BytesIO()
        Image.new('RGB', (256, 256), (129, 0, 0)).save(buffer, format='PNG')
        self.png = buffer.getvalue()
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(installer, 'PASSES', [('test', '测试关口', 105.56, 32.21, 'Q6191827')]))
        self.stack.enter_context(patch.object(installer, 'bounds_tiles', return_value={(9, 406, 207)}))
        self.stack.enter_context(patch.object(installer.time, 'sleep'))
        self.network = self.stack.enter_context(patch.object(installer.urllib.request, 'urlopen', side_effect=lambda *a, **k: io.BytesIO(self.png)))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def test_complete_pack_roundtrip_and_offline_reuse(self):
        installer.install(self.folder)
        raw = self.path.read_bytes()
        size = struct.unpack('<I', raw[8:12])[0]
        manifest = json.loads(raw[12:12+size])
        self.assertEqual(manifest['minZoom'], 0)
        self.assertEqual(manifest['passes'][0]['elevation'], 260)
        self.assertIn('0/0/0', manifest['tiles'])
        self.network.side_effect = AssertionError('Existing tiles should be reused')
        installer.install(self.folder)
        self.assertFalse(self.path.with_suffix('.pack.tmp').exists())

    def test_download_and_publish_failures_preserve_existing_file(self):
        installer.install(self.folder)
        before = self.path.read_bytes()
        with patch.object(installer, 'PASSES', [('other', '测试关口二', 115, 40, 'Q1330063')]):
            self.network.side_effect = OSError('offline')
            with self.assertRaises(OSError):
                installer.install(self.folder)
        self.assertEqual(self.path.read_bytes(), before)
        with patch.object(installer.os, 'replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):
                installer.install(self.folder)
        self.assertEqual(self.path.read_bytes(), before)

    def test_invalid_image_and_future_pack_are_not_published(self):
        self.network.side_effect = lambda *a, **k: io.BytesIO(b'bad image')
        with self.assertRaises(Exception):
            installer.install(self.folder)
        self.assertFalse(self.path.exists())
        self.path.parent.mkdir(parents=True)
        manifest = b'{"schemaVersion":2}'
        original = b'MUMUDEM1' + struct.pack('<I', len(manifest)) + manifest
        self.path.write_bytes(original)
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            installer.install(self.folder)
        self.assertEqual(self.path.read_bytes(), original)

if __name__ == '__main__':
    unittest.main()
