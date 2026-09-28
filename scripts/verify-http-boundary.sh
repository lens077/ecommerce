#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_HTTP_BOUNDARY_PROBE:-}" != "1" ]]; then
  echo "refusing probe: set ALLOW_HTTP_BOUNDARY_PROBE=1 for an approved non-production target" >&2
  exit 2
fi

if [[ $# -ne 2 ]]; then
  echo "usage: ALLOW_HTTP_BOUNDARY_PROBE=1 $0 <http[s]://host[:port]> <host-header>" >&2
  exit 2
fi

python3 - "$1" "$2" <<'PY'
import socket
import ssl
import sys
from urllib.parse import urlparse

url = urlparse(sys.argv[1])
host_header = sys.argv[2]
if url.scheme not in ("http", "https") or not url.hostname:
    raise SystemExit("target must be an absolute http:// or https:// URL")

port = url.port or (443 if url.scheme == "https" else 80)
address = (url.hostname, port)

cases = {
    "cl-te": (
        "Content-Length: 0\r\n"
        "Transfer-Encoding: chunked\r\n"
    ),
    "te-cl": (
        "Transfer-Encoding: chunked\r\n"
        "Content-Length: 0\r\n"
    ),
    "duplicate-cl": (
        "Content-Length: 0\r\n"
        "Content-Length: 0\r\n"
    ),
}

for name, headers in cases.items():
    request = (
        f"POST /__http_boundary_probe__ HTTP/1.1\r\n"
        f"Host: {host_header}\r\n"
        f"Connection: close\r\n"
        f"{headers}\r\n"
    ).encode()
    sock = socket.create_connection(address, timeout=8)
    if url.scheme == "https":
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        sock = context.wrap_socket(sock, server_hostname=url.hostname)
    try:
        sock.sendall(request)
        response = sock.recv(4096)
    finally:
        sock.close()
    if not response.startswith(b"HTTP/"):
        raise SystemExit(f"{name}: no HTTP response")
    status = int(response.split(b" ", 2)[1])
    print(f"{name}: HTTP {status}")
    if status < 400:
        raise SystemExit(f"{name}: target accepted an ambiguous boundary")
PY
