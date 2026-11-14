#!/usr/bin/env python3
"""Mints a pod token exactly like api/runpod.php (for tests).

  TOKEN_SECRET=... python3 make-token.py <pod id> [ttl seconds]
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


pod_id = sys.argv[1]
ttl = int(sys.argv[2]) if len(sys.argv) > 2 else 1200
payload = b64url(json.dumps({"pod": pod_id, "exp": int(time.time()) + ttl}, separators=(",", ":")).encode())
signature = hmac.new(os.environ["TOKEN_SECRET"].encode(), f"v1.{payload}".encode(), hashlib.sha256).digest()
print(f"v1.{payload}.{b64url(signature)}")
