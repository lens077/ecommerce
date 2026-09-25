#!/usr/bin/env python3
"""从 backend 生成物同步前端所用协议及其相对导入依赖。"""
import argparse
from pathlib import Path
import re
import sys

# 2026-09-24：consumer 的 CreateAddressRequest 仍带已 reserved 的 user_id。
# 固定包清单而非扫描目标目录，避免文件丢失后检查器反而缩小检查范围。
APPS = {
    "consumer": ("address", "cart", "casdoor", "check", "order", "product", "search", "telemetry", "user"),
    "consumer-next": ("product", "search"),
}
IMPORT = re.compile(r'\bfrom\s+["\'](\.[^"\']+)["\']')


def expected_files(source, packages):
    pending = []
    for package in packages:
        files = list((source / "api" / package).rglob("*_pb.ts"))
        if not files:
            raise ValueError(f"missing generated package: api/{package}; run backend make api")
        pending.extend(files)
    expected = {}
    while pending:
        file = pending.pop().resolve()
        if not file.is_relative_to(source.resolve()) or not file.is_file():
            raise ValueError(f"missing or escaping generated dependency: {file}")
        relative = file.relative_to(source.resolve())
        if relative in expected:
            continue
        # 固定 EOF 为一个换行；protoc-gen-es 的消息/服务尾部空行不影响协议。
        data = file.read_bytes().rstrip(b"\r\n") + b"\n"
        if b"@generated" not in data:
            raise ValueError(f"not generated: {relative}")
        expected[relative] = data
        for name in IMPORT.findall(data.decode("utf-8")):
            dependency = file.parent / name
            if dependency.suffix == ".js":
                dependency = dependency.with_suffix(".ts")
            elif dependency.suffix != ".ts":
                dependency = Path(str(dependency) + ".ts")
            pending.append(dependency)
    return expected


def sync(root, check, apps=APPS):
    plans = []
    for app, packages in apps.items():
        destination = root / "frontend/apps" / app / "src/gen"
        expected = expected_files(root / "backend", packages)
        actual = set(path.relative_to(destination) for path in destination.rglob("*_pb.ts"))
        for relative in sorted(actual | set(expected)):
            file = destination / relative
            if file.is_symlink() or not file.resolve().is_relative_to(destination.resolve()):
                raise ValueError(f"refusing symlink or escaping destination: {file}")
            current = file.read_bytes() if file.exists() else None
            wanted = expected.get(relative)
            if current != wanted:
                if wanted is None and b"@generated" not in (current or b""):
                    raise ValueError(f"refusing removal of non-generated file: {file}")
                plans.append((file, wanted))
    for file, data in plans:
        print(f"{'drift' if check else 'sync'}: {file.relative_to(root)}")
        if not check:
            if data is None:
                file.unlink()
            else:
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
    return not check or not plans


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只检查，不写入")
    args = parser.parse_args()
    try:
        ok = sync(Path(__file__).resolve().parent.parent, args.check)
    except (ValueError, OSError) as error:
        print(f"sync-ts-gen: {error}", file=sys.stderr)
        return 1
    if ok:
        print("sync-ts-gen: OK")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
