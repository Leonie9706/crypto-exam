# -*- coding: utf-8 -*-
"""密码竞赛刷题 —— 本地静态服务（供 启动刷题系统.bat 调用）

相比 `python -m http.server`：
  * 访问 http://127.0.0.1:PORT/ 直接返回 index.html
  * 端口被占用时自动往后找一个可用端口
  * 关窗口 / Ctrl+C 时干净退出
"""
import http.server
import socket
import socketserver
import sys
import os
import threading
import time
import webbrowser

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8848
LOG_PATH = os.path.join(APP_DIR, "server-404.log")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def do_GET(self):
        if self.path in ("/", ""):
            self.path = "/index.html"
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        return super().do_GET()

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            try:
                with open(LOG_PATH, "a", encoding="utf-8") as f:
                    f.write("%s 404 %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), self.path))
            except Exception:
                pass
        return super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        pass  # 保持窗口干净

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def pick_port(start):
    for p in range(start, start + 40):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return start


def main():
    port = pick_port(DEFAULT_PORT)
    url = f"http://127.0.0.1:{port}/index.html"
    with Server(("127.0.0.1", port), Handler) as httpd:
        print("=" * 60)
        print("  密码竞赛刷题 已启动")
        print("=" * 60)
        print(f"  地址： {url}")
        if port != DEFAULT_PORT:
            print(f"  （默认端口 {DEFAULT_PORT} 被占用，已自动改用 {port}）")
        print()
        print("  浏览器会自动打开。这个窗口不要关，关掉就等于退出程序。")
        print("  停止服务：在本窗口按 Ctrl + C")
        print("=" * 60)
        try:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止服务。")


if __name__ == "__main__":
    main()
