"""Validate shipped model contracts without opening a window or rebuilding assets."""
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np

from catalog import AVAILABLE_DOGS, CUSTOM_DOGS, DOGS, ROOT, TYPES
from model_assets import GLB, SOURCE, read_document


class AssetTests(unittest.TestCase):
    def test_all_models_are_portable_animated_assets(self):
        self.assertEqual(len(DOGS), len(TYPES) * 7)
        self.assertEqual(len({d['id'] for d in AVAILABLE_DOGS}), len(AVAILABLE_DOGS))
        for dog in AVAILABLE_DOGS:
            with self.subTest(model=dog['id']):
                path = ROOT / dog['asset']
                self.assertFalse(Path(dog['asset']).is_absolute())
                self.assertTrue(path.resolve().is_relative_to(ROOT))
                self.assertGreater(dog['height'], 0)
                self.assertIn(dog['type_id'], {t['id'] for t in TYPES})
                doc = read_document(path)
                self.assertEqual(len(doc['skins'][0]['joints']), 80)
                clips = {clip['name'] for clip in doc['animations']}
                self.assertTrue({'Idle', 'Walk', 'Trot', 'Gallop'} <= clips)
                for mesh in doc['meshes']:
                    for part in mesh['primitives']:
                        positions = doc['accessors'][part['attributes']['POSITION']]
                        self.assertGreater(positions['count'], 0)
                        self.assertTrue(np.isfinite(positions['min'] + positions['max']).all())

    def test_saved_models_keep_runtime_metadata_without_sessions(self):
        self.assertEqual(len(CUSTOM_DOGS), 23)
        for dog in CUSTOM_DOGS:
            self.assertTrue(dog['asset'].startswith('assets/custom/'))
            self.assertGreater(dog['normalization_height'], 0)
            self.assertIsInstance(dog['profile'], dict)
            self.assertFalse({'image', 'landmarks', 'camera', 'pose'} & dog.keys())

    def test_catalog_import_does_not_load_rendering_or_fitting_libraries(self):
        result = subprocess.run(
            [sys.executable, '-B', '-c',
             "import catalog,sys; print(','.join(sorted(sys.modules)))"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        modules = set(result.stdout.strip().split(','))
        self.assertFalse({'panda3d', 'numpy', 'scipy', 'PIL'} & modules)

    def test_invalid_glb_headers_fail_clearly(self):
        for payload in (b'', b'glTF', struct.pack('<4sIII4s', b'glTF', 2, 28, 8, b'JSON')):
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'bad.glb'
                path.write_bytes(payload)
                with self.assertRaises(ValueError):
                    read_document(path)

    def test_mesh_writer_preserves_binary_and_world_transforms(self):
        original = GLB(SOURCE)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'roundtrip.glb'
            original.write(path)
            copy = GLB(path)
        self.assertEqual(copy.doc, original.doc)
        self.assertEqual(copy.binary, original.binary)
        for index in original.world:
            np.testing.assert_allclose(copy.world[index], original.world[index])


if __name__ == '__main__':
    unittest.main()
