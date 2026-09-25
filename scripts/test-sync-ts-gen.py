#!/usr/bin/env python3
"""协议快照漂移回归：在隔离副本中验证同步，不修改真实生成物。"""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sync_ts_gen", Path(__file__).with_name("sync-ts-gen.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SyncTest(unittest.TestCase):
    def test_dependency_drift_missing_and_stale_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "backend"
            destination = root / "frontend/apps/example/src/gen"
            api = source / "api/example/v1/example_pb.ts"
            dependency = source / "third_party/example_pb.ts"
            api.parent.mkdir(parents=True)
            dependency.parent.mkdir(parents=True)
            api.write_text('// @generated\nimport { x } from "../../../third_party/example_pb";\n')
            dependency.write_text('// @generated\nexport const x = 1;\n')
            apps = {"example": ("example",)}
            self.assertFalse(module.sync(root, True, apps))
            self.assertTrue(module.sync(root, False, apps))
            self.assertTrue(module.sync(root, True, apps))
            copied = destination / "third_party/example_pb.ts"
            copied.write_text('// @generated\nexport const x = 2;\n')
            before = copied.read_bytes()
            self.assertFalse(module.sync(root, True, apps))
            self.assertEqual(before, copied.read_bytes(), "--check must not write")
            copied.unlink()
            stale = destination / "api/example/v1/old_pb.ts"
            stale.write_text('// @generated\n')
            manual = destination / "api/index.ts"
            manual.write_text('export {};\n')
            self.assertFalse(module.sync(root, True, apps))
            self.assertTrue(module.sync(root, False, apps))
            self.assertFalse(stale.exists())
            self.assertEqual(manual.read_text(), 'export {};\n')
            self.assertTrue(module.sync(root, True, apps))

    def test_missing_source_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                module.sync(Path(tmp), True, {"example": ("missing",)})


if __name__ == "__main__":
    unittest.main()
