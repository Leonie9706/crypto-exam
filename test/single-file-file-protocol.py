# -*- coding: utf-8 -*-
"""验证单文件版：① 以 file:// 直接双击打开是否可用 ② 内联脚本是否完整"""
import json
import os
import sys
import time
import urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(APP, "密码竞赛刷题-单文件版.html")
PORT = 9338
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


def drain(ws, tag):
    for ev in ws.drain(0.4):
        m = ev.get("method")
        if m == "Runtime.exceptionThrown":
            d = ev["params"]["exceptionDetails"]
            errors.append(f"{tag}: {((d.get('exception') or {}).get('description') or d.get('text',''))[:160]}")
        elif m == "Log.entryAdded" and ev["params"]["entry"].get("level") == "error":
            errors.append(f"{tag}: {ev['params']['entry'].get('text','')[:160]}")


def main():
    if not os.path.exists(FILE):
        print("单文件版不存在:", FILE)
        return 1
    print("单文件版大小: %.1f MB" % (os.path.getsize(FILE) / 1024 / 1024))

    br = Browser(port=PORT)
    try:
        ws = br.new_page()
        ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        url = "file:///" + urllib.parse.quote(FILE.replace("\\", "/"))
        print("打开:", url)
        ws.call("Page.navigate", {"url": url})
        time.sleep(3.5)
        drain(ws, "file打开")

        print("=== file:// 场景 ===")
        ok("页面标题正确", "密码竞赛刷题" in (ws.evaluate("document.title") or ""))
        ok("题库已内联加载", ws.evaluate("(window.BANK||[]).length") == 1049)
        ok("实操题已内联", ws.evaluate("(window.PRACTICAL||[]).length") == 12)
        ok("首页渲染", ws.evaluate("document.querySelector('#view').innerHTML.length") > 1000)
        ok("无外链资源", ws.evaluate(
            "document.querySelectorAll('script[src],link[rel=stylesheet]').length") == 0)

        print("=== 在 file:// 下答题 ===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题',cat:'一、密码法律法规',type:'判断题'}});
          App.go('practice');
        """)
        time.sleep(0.6)
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.5)
        drain(ws, "答题")
        ok("能作答并判分", ws.evaluate("document.querySelectorAll('.result').length") == 1)
        ok("解析正常显示", ws.evaluate("document.querySelectorAll('.exp-block').length") >= 1)

        print("=== 在 file:// 下考试 ===")
        ws.evaluate("(function(){Core.state.examSession=null; Exam.start({single:5,multi:3,judge:2,minutes:10});})()")
        time.sleep(1.0)
        ok("能组卷 10 题", ws.evaluate("Core.state.examSession.ids.length") == 10)
        drain(ws, "组卷")
        ans = ws.evaluate("""(function(){
            var s = Core.state.examSession;
            s.ids.forEach(function(id){ s.answers[id] = Core.byId[id].answer; });
            return Object.keys(s.answers).length;
        })()""")
        ok("能填写答案", ans == 10, ans)
        ws.evaluate("Exam.submitPaper(true)")
        time.sleep(1.0)
        drain(ws, "交卷")
        ok("满分交卷 100 分", ws.evaluate("Core.state.history[0].score") == 100)
        ok("结果页渲染", ws.evaluate("document.querySelector('#view').innerHTML.length") > 3000)

        print("=== file:// 下刷新（localStorage 是否持久）===")
        ws.call("Page.navigate", {"url": url})
        time.sleep(3.0)
        drain(ws, "刷新")
        ok("刷新后记录仍在", ws.evaluate("Core.state.history.length") >= 1)
        ok("localStorage 可写", ws.evaluate("Core.storageAvailable()") is True)

        print()
        print("=== 报错汇总 ===")
        for e in errors or []:
            print("   [ERR]", e)
        # file:// 下浏览器可能报无关的资源错误，只统计 JS 异常
        js_errors = [e for e in errors if "file://" not in e or "Uncaught" in e]
        ok("无 JS 未捕获异常", len([e for e in errors if "Uncaught" in e or "TypeError" in e or "ReferenceError" in e]) == 0)
    finally:
        br.kill()

    print(f"\n===== 单文件版(file://)结果：pass {p}，fail {f} =====")
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
