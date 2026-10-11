# -*- coding: utf-8 -*-
"""极简 CDP 客户端：用无头 Edge 打开页面，点击答题并收集 JS 报错

不依赖第三方库：自己实现 WebSocket 握手与帧编解码。
"""
import base64
import hashlib
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


class WS:
    def __init__(self, url, timeout=20):
        assert url.startswith("ws://")
        rest = url[5:]
        hostport, path = rest.split("/", 1)
        path = "/" + path
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket 握手失败")
            buf += chunk
        if b"101" not in buf.split(b"\r\n")[0]:
            raise RuntimeError("WebSocket 握手被拒绝: " + buf.split(b"\r\n")[0].decode(errors="replace"))
        self._buf = buf.split(b"\r\n\r\n", 1)[1]
        self._id = 0

    def _send_frame(self, payload: bytes, opcode=0x1):
        header = bytearray([0x80 | opcode])
        mask = os.urandom(4)
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def _recv_exact(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("WebSocket 连接已关闭")
            self._buf += chunk
        out, self._buf = self._buf[:n], self._buf[n:]
        return out

    def _recv_frame(self):
        b1, b2 = self._recv_exact(2)
        opcode = b1 & 0x0F
        masked = b2 & 0x80
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._recv_exact(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._recv_exact(8))[0]
        mask = self._recv_exact(4) if masked else None
        data = self._recv_exact(n) if n else b""
        if mask:
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        return opcode, data

    def call(self, method, params=None, timeout=30):
        self._id += 1
        mid = self._id
        self._send_frame(json.dumps({"id": mid, "method": method, "params": params or {}}).encode())
        deadline = time.time() + timeout
        while time.time() < deadline:
            opcode, data = self._recv_frame()
            if opcode == 0x1:
                msg = json.loads(data.decode("utf-8", "replace"))
                if msg.get("id") == mid:
                    if "error" in msg:
                        raise RuntimeError(f"{method} 失败: {msg['error']}")
                    return msg.get("result", {})
        raise TimeoutError(method)

    def drain(self, seconds=0.4):
        """读取一段时间内所有事件"""
        events = []
        end = time.time() + seconds
        self.sock.settimeout(0.2)
        while time.time() < end:
            try:
                opcode, data = self._recv_frame()
            except socket.timeout:
                continue
            except Exception:
                break
            if opcode == 0x1:
                try:
                    events.append(json.loads(data.decode("utf-8", "replace")))
                except Exception:
                    pass
        self.sock.settimeout(20)
        return events

    def evaluate(self, expr, timeout=30):
        r = self.call("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": True,
        }, timeout=timeout)
        if r.get("exceptionDetails"):
            d = r["exceptionDetails"]
            desc = (d.get("exception") or {}).get("description") or d.get("text", "")
            raise RuntimeError("页面 JS 异常 @line %s:%s  %s\n表达式: %s" % (
                d.get("lineNumber"), d.get("columnNumber"), desc.split("\n")[0], expr[:120].replace("\n", " ")))
        return r.get("result", {}).get("value")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def find_browser():
    for p in EDGE_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


class Browser:
    def __init__(self, port=9222, headless=True):
        self.port = port
        exe = find_browser()
        if not exe:
            raise RuntimeError("没有找到 Edge/Chrome")
        self.profile = os.path.join(os.environ.get("TEMP", "."), "cdp_profile_%d" % port)
        args = [exe, f"--remote-debugging-port={port}", f"--user-data-dir={self.profile}",
                "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                "--disable-popup-blocking", "--window-size=1400,900", "about:blank"]
        if headless:
            args.insert(1, "--headless=new")
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ws = None
        for _ in range(60):
            time.sleep(0.4)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2) as r:
                    info = json.loads(r.read().decode())
                self.ws_url = info["webSocketDebuggerUrl"]
                break
            except Exception:
                continue
        else:
            raise RuntimeError("浏览器调试端口未就绪")

    def new_page(self, url="about:blank"):
        # 直接用已有的 about:blank 标签页（/json/new 需要 PUT，不同版本行为不一致）
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/json/list", timeout=5) as r:
            tabs = json.loads(r.read().decode())
        target = None
        for t in tabs:
            if t.get("type") == "page":
                target = t
                break
        if target is None:
            raise RuntimeError("没有可用的浏览器标签页")
        ws = WS(target["webSocketDebuggerUrl"])
        self.ws = ws
        ws.call("Runtime.enable")
        ws.call("Log.enable")
        ws.call("Page.enable")
        return ws

    def kill(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=8)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
