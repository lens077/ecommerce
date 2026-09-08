#!/usr/bin/env python3
"""One advisory PreToolUse interruption after six distinct full-file reads."""

import fcntl
import hashlib
import json
import os
import stat
import sys
import tempfile


EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
READ_THRESHOLD = 6
MAX_INPUT_BYTES = 1024 * 1024
REMINDER = (
    "E3 reminder: you have requested full reads of six different files before "
    "editing. Re-estimate the task and prefer the smallest relevant reading and "
    "validation path. Required project instructions still apply. Research and "
    "subagent exploration may legitimately need more context; retry this Read "
    "to continue. This reminder interrupts only once per session."
)


def validate_state(value):
    """Reject corrupt state rather than inventing a successful previous check."""
    if not isinstance(value, dict) or value.get("version") != 1:
        raise ValueError("unsupported state")
    if type(value.get("warned")) is not bool or type(value.get("edited")) is not bool:
        raise ValueError("invalid state flags")
    reads = value.get("reads")
    if not isinstance(reads, list) or len(reads) > READ_THRESHOLD:
        raise ValueError("invalid read count")
    if any(not isinstance(item, str) for item in reads):
        raise ValueError("invalid read paths")
    return value


def handle(payload):
    """Return 2 for the first threshold crossing, otherwise allow the tool."""
    if not isinstance(payload, dict):
        raise ValueError("hook input must be an object")
    if payload.get("hook_event_name", "PreToolUse") != "PreToolUse":
        return 0
    tool = payload.get("tool_name")
    if tool != "Read" and tool not in EDIT_TOOLS:
        return 0
    session = payload.get("session_id")
    if not isinstance(session, str) or not session:
        raise ValueError("missing session_id")
    args = payload.get("tool_input")
    if not isinstance(args, dict):
        raise ValueError("tool_input must be an object")
    path = None
    if tool == "Read":
        # A bounded or non-first-page read is not a request for the whole file.
        if args.get("offset") not in (None, 1) or args.get("limit") is not None:
            return 0
        path = args.get("file_path")
        if not isinstance(path, str) or not path:
            raise ValueError("Read requires file_path")
        cwd = payload.get("cwd", os.getcwd())
        if not isinstance(cwd, str):
            raise ValueError("cwd must be a string")
        path = os.path.normpath(os.path.join(cwd, path))

    # Hash the untrusted session id; it must never become a filesystem path.
    digest = hashlib.sha256(session.encode("utf-8")).hexdigest()
    filename = os.path.join(tempfile.gettempdir(), "e3-guard-" + digest + ".json")
    fd = os.open(filename, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+", encoding="utf-8") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
            raise ValueError("unsafe state file")
        os.fchmod(stream.fileno(), 0o600)
        # Lock the same inode for read/modify/write across parallel hook calls.
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        raw = stream.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise ValueError("state file too large")
        state = validate_state(json.loads(raw)) if raw else {
            "version": 1, "reads": [], "warned": False, "edited": False,
        }
        if state["edited"] or state["warned"]:
            return 0
        blocked = False
        if tool in EDIT_TOOLS:
            # PreToolUse observes edit intent, not whether the edit later succeeds.
            state["edited"] = True
        elif path not in state["reads"]:
            state["reads"].append(path)
            if len(state["reads"]) >= READ_THRESHOLD:
                state["warned"] = True
                blocked = True
        stream.seek(0)
        json.dump(state, stream, ensure_ascii=True)
        stream.write("\n")
        stream.truncate()
        stream.flush()
    if blocked:
        print(REMINDER, file=sys.stderr)
        return 2
    return 0


def main():
    """Malformed input or unavailable state is diagnostic, never a permission gate."""
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise ValueError("hook input too large")
        return handle(json.loads(raw))
    except (OSError, ValueError, TypeError) as exc:
        print("e3-overread-guard: unavailable (%s); allowing tool" % exc, file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
