# -*- coding: utf-8 -*-
"""一键把仓库推送到 GitHub（Git Credential Manager 会弹出浏览器登录）

用法：
    python deploy.py                  # 交互式输入用户名/仓库名
    python deploy.py 用户名 仓库名      # 直接指定
"""
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPO = "crypto-quiz-js-2026"


def run(args, timeout=600, check=False):
    return subprocess.run(args, cwd=REPO_DIR, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def main():
    user = sys.argv[1] if len(sys.argv) > 1 else input("GitHub 用户名: ").strip()
    repo = sys.argv[2] if len(sys.argv) > 2 else (input("仓库名 [%s]: " % DEFAULT_REPO).strip() or DEFAULT_REPO)
    if not user:
        print("用户名不能为空"); return 1
    if not re.fullmatch(r"[A-Za-z0-9._-]+", user) or not re.fullmatch(r"[A-Za-z0-9._-]+", repo):
        print("用户名/仓库名只能包含字母、数字、点、下划线、连字符"); return 1

    url = "https://github.com/%s/%s.git" % (user, repo)
    pages = "https://%s.github.io/%s/" % (user, repo)

    print("=" * 60)
    print("  推送目标: %s" % url)
    print("  在线地址: %s  （开启 Pages 后生效）" % pages)
    print("=" * 60)

    r = run(["git", "remote", "get-url", "origin"])
    if r.returncode == 0:
        run(["git", "remote", "set-url", "origin", url])
    else:
        run(["git", "remote", "add", "origin", url])
    print("[1/3] 远程地址已设置")

    r = run(["git", "remote", "-v"])
    print("      " + r.stdout.strip().replace("\n", "\n      "))

    print("[2/3] 检查远程仓库是否存在…")
    r = run(["git", "ls-remote", "--exit-code", "origin"], timeout=120)
    if r.returncode != 0:
        print()
        print("  ⚠ 读不到远程仓库。可能原因：")
        print("    1) 你还没在 GitHub 上创建这个仓库 —— 请打开 https://github.com/new")
        print("       仓库名填：%s   可见性选 Public（Pages 免费版需要公开仓库）" % repo)
        print("       不要勾选 Add README / .gitignore / license（保持空仓库）")
        print("    2) 需要登录：下一步推送时会自动弹出浏览器登录窗口")
        print()

    print("[3/3] 推送到 GitHub（若弹出登录窗口，请用浏览器登录/授权）…")
    r = run(["git", "push", "-u", "origin", "main"], timeout=1800)
    out = (r.stdout or "") + (r.stderr or "")
    print(out.strip()[-2000:] if out.strip() else "(无输出)")
    if r.returncode != 0:
        print()
        print("  推送失败（退出码 %d）。请检查：" % r.returncode)
        print("   · 仓库是否已在 GitHub 创建：https://github.com/new")
        print("   · 用户名/仓库名是否拼写正确：%s" % url)
        print("   · 网络是否可访问 GitHub")
        return 1

    print()
    print("=" * 60)
    print("  推送成功！")
    print("=" * 60)
    print("  仓库地址: https://github.com/%s/%s" % (user, repo))
    print()
    print("  最后一步（开启在线刷题）：")
    print("   1) 打开 https://github.com/%s/%s/settings/pages" % (user, repo))
    print("   2) Source 选 “Deploy from a branch”")
    print("   3) Branch 选 main，目录选 /(root)，点 Save")
    print("   4) 等 1~2 分钟，在线地址生效：%s" % pages)
    print()
    print("  或者用命令开启（需要 GitHub CLI，可选）：")
    print("   gh api -X POST repos/%s/%s/pages -f source[branch]=main -f source[path]=/" % (user, repo))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n已取消")
        sys.exit(1)
