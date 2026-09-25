#!/usr/bin/env python3
"""协议快照漂移回归：在隔离副本中验证同步，不修改真实生成物。"""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import os
import shutil
import subprocess

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

    def test_unlisted_api_package_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "backend/api/example/v1/example_pb.ts"
            source.parent.mkdir(parents=True)
            source.write_text('// @generated\n')
            unknown = root / "frontend/apps/example/src/gen/api/another/v1/client_pb.ts"
            unknown.parent.mkdir(parents=True)
            unknown.write_text('// @generated\nexport const activeClient = true;\n')
            before = unknown.read_bytes()
            for check in (True, False):
                with self.assertRaisesRegex(ValueError, "unlisted API package"):
                    module.sync(root, check, {"example": ("example",)})
                self.assertEqual(unknown.read_bytes(), before)
                self.assertFalse((unknown.parents[2] / "example").exists(), "must fail before writes")

    def test_entrypoint_ignores_hook_git_worktree_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scripts = root / "scripts"
            scripts.mkdir()
            shutil.copyfile(Path(__file__).with_name("sync-ts-gen.sh"), scripts / "sync-ts-gen.sh")
            (scripts / "sync-ts-gen.py").write_text('print("entrypoint reached")\n')
            # 不运行 git init：pre-push 的 GIT_COMMON_DIR 会使它误写真实仓库配置。
            # 新入口只依赖脚本位置，应在没有 .git 的隔离副本里照常工作。
            result = subprocess.run(["bash", str(scripts / "sync-ts-gen.sh"), "--check"], cwd=root,
                                    env={**os.environ, "GIT_DIR": str(root / ".git"), "GIT_WORK_TREE": "."},
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "entrypoint reached")

    def test_missing_source_is_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                module.sync(Path(tmp), True, {"example": ("missing",)})


if __name__ == "__main__":
    unittest.main()
