# -*- coding: utf-8 -*-
"""模拟 GitHub Pages 环境：验证仓库根目录站点是否开箱可用

用法：先在仓库根目录起静态服务（python -m http.server 8851），再运行本脚本。
"""
import os
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa

PORT = int(os.environ.get("PAGES_PORT", "8851"))
URL = "http://127.0.0.1:%d/index.html" % PORT
p = f = 0
errors = []


def ok(name, cond, extra=""):
    global p, f
    if cond:
        p += 1
        print("  [PASS]", name)
    else:
        f += 1
        print("  [FAIL]", name, extra)


def drain(ws):
    for ev in ws.drain(0.4):
        m = ev.get("method")
        if m == "Runtime.exceptionThrown":
            d = ev["params"]["exceptionDetails"]
            errors.append(((d.get("exception") or {}).get("description") or d.get("text", ""))[:160])
        elif m == "Log.entryAdded" and ev["params"]["entry"].get("level") == "error":
            errors.append(ev["params"]["entry"].get("text", "")[:160])


def main():
    br = Browser(port=9350)
    try:
        ws = br.new_page()
        ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        ws.call("Page.navigate", {"url": URL + "?t=%d" % int(time.time() * 1000)})
        time.sleep(3.0)
        drain(ws)

        print("=== 模拟 GitHub Pages（站点在仓库根目录）===")
        ok("题库加载 1049 题", ws.evaluate("window.BANK.length") == 1049)
        ok("实操题 12 道", ws.evaluate("window.PRACTICAL.length") == 12)
        ok("首页渲染", ws.evaluate("document.querySelector('#view').innerHTML.length") > 1000)
        ok("资源路径全为相对路径", ws.evaluate(
            "Array.prototype.every.call(document.querySelectorAll('script[src],link[href]'), function(e){"
            " var u = e.getAttribute('src') || e.getAttribute('href');"
            " return u.indexOf('http') !== 0 && u.indexOf('/') !== 0; })"))
        ok("favicon 已声明", ws.evaluate("!!document.querySelector('link[rel=icon]')"))

        print("=== 刷题 / 考试 / 刷新 ===")
        ws.evaluate("Practice.buildList({force:true, filter:{part:'第一部分基础题',cat:'一、密码法律法规',type:'判断题'}}); App.go('practice');")
        time.sleep(0.5)
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.4)
        ok("答题判分正常", ws.evaluate("document.querySelectorAll('.result').length") == 1)
        drain(ws)
        ws.evaluate("App.go('exam')")
        time.sleep(0.5)
        ok("考试页正常", ws.evaluate("document.querySelector('#view').innerHTML.length") > 800)
        ws.evaluate("(function(){Core.state.examSession=null; Exam.start({single:5,multi:3,judge:2,minutes:10});})()")
        time.sleep(0.9)
        ok("组卷 10 题", ws.evaluate("Core.state.examSession.ids.length") == 10)
        ws.evaluate("(function(){var s=Core.state.examSession; s.ids.forEach(function(id){ s.answers[id]=Core.byId[id].answer; });})()")
        ws.evaluate("Exam.submitPaper(true)")
        time.sleep(0.9)
        ok("满分交卷 100", ws.evaluate("Core.state.history[0].score") == 100)
        drain(ws)
        ws.call("Page.navigate", {"url": URL + "?t=%d" % int(time.time() * 1000)})
        time.sleep(2.5)
        ok("刷新后记录保留", ws.evaluate("Core.state.history.length") >= 1)
        drain(ws)

        print("=== 仓库内其它可下载内容 ===")
        base = "http://127.0.0.1:%d" % PORT
        for path, name in (("/密码竞赛刷题-单文件版.html", "离线单文件版"),
                           ("/data/favicon.svg", "站点图标"),
                           ("/server.py", "本地服务脚本")):
            try:
                code = urllib.request.urlopen(base + urllib.parse.quote(path), timeout=10).status
            except Exception as e:
                code = "ERR " + str(e)[:40]
            ok("%s 可访问" % name, code == 200, code)

        print("\n=== JS 报错 ===")
        for e in errors:
            print("   [ERR]", e)
        ok("无 JS 报错", len(errors) == 0, "%d 条" % len(errors))
    finally:
        br.kill()

    print("\n===== Pages 模拟结果：pass %d，fail %d =====" % (p, f))
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
