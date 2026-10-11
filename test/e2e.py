# -*- coding: utf-8 -*-
"""端到端测试：真实 Edge 无头浏览器打开应用，模拟点击答题，收集 JS 报错"""
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa

URL = "http://127.0.0.1:8848/index.html"
PORT = 9333

pass_n = 0
fail_n = 0
errors = []


def ok(name, cond, extra=""):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print("  [PASS]", name)
    else:
        fail_n += 1
        print("  [FAIL]", name, extra)


def collect_errors(ws, tag):
    for ev in ws.drain(0.5):
        m = ev.get("method")
        if m == "Runtime.exceptionThrown":
            d = ev["params"]["exceptionDetails"]
            errors.append(f"{tag}: {d.get('text','')} {d.get('exception',{}).get('description','')[:200]}")
        elif m == "Runtime.consoleAPICalled" and ev["params"].get("type") == "error":
            args = " ".join(str(a.get("value", a.get("description", ""))) for a in ev["params"].get("args", []))
            errors.append(f"{tag}: console.error {args[:200]}")
        elif m == "Log.entryAdded":
            e = ev["params"]["entry"]
            if e.get("level") == "error":
                errors.append(f"{tag}: log {e.get('text','')[:200]}")


def fresh_url():
    return URL + ("&" if "?" in URL else "?") + "t=" + str(int(time.time() * 1000))


def main():
    br = Browser(port=PORT)
    try:
        ws = br.new_page()
        ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        ws.call("Page.navigate", {"url": fresh_url()})
        time.sleep(2.5)
        collect_errors(ws, "加载首页")

        print("=== 1. 首页 ===")
        title = ws.evaluate("document.title")
        ok("标题正确", "密码竞赛刷题" in (title or ""), title)
        ok("首页渲染", ws.evaluate("document.querySelector('#view').innerHTML.length") > 1000)
        ok("题库已加载", ws.evaluate("window.BANK.length") == 1049)
        ok("弹窗默认隐藏", ws.evaluate("getComputedStyle(document.querySelector('#modalMask')).display") == "none")
        ok("提示默认隐藏", ws.evaluate("getComputedStyle(document.querySelector('#toast')).display") == "none")
        ok("首页无横向滚动", ws.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"),
           ws.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"))

        print("=== 2. 进刷题页（判断题：点选项即判分）===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题', cat:'一、密码法律法规', type:'判断题'}});
          App.go('practice');
        """)
        time.sleep(0.6)
        collect_errors(ws, "刷题页")
        ok("题卡渲染", ws.evaluate("document.querySelectorAll('.opt').length") == 2)
        ok("答题卡渲染", ws.evaluate("document.querySelectorAll('[data-jump]').length") == 12)
        # 点第一个选项
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.5)
        collect_errors(ws, "点击选项")
        ok("出现判分结果", ws.evaluate("document.querySelectorAll('.result').length") == 1)
        ok("结果显示正确答案", "正确答案" in (ws.evaluate("document.querySelector('.result').textContent") or ""))
        ok("解析可见", ws.evaluate("document.querySelectorAll('.exp-block').length") >= 1)
        ok("作答被记录", ws.evaluate("Object.keys(Core.state.stats).length") >= 1)
        ok("选项已锁定", ws.evaluate("document.querySelectorAll('.opt.locked').length") >= 1)
        # 锁定后再点不应重复计数
        before = ws.evaluate("Object.values(Core.state.stats)[0].r")
        ws.evaluate("document.querySelectorAll('.opt')[1].click()")
        time.sleep(0.3)
        after = ws.evaluate("Object.values(Core.state.stats)[0].r")
        ok("锁定后不重复计分", before == after, f"{before} -> {after}")

        print("=== 3. 下一题 / 上一题 ===")
        n0 = ws.evaluate("Practice.idx")
        ws.evaluate("document.querySelector('#btnNext').click()")
        time.sleep(0.4)
        ok("下一题生效", ws.evaluate("Practice.idx") == n0 + 1)
        ws.evaluate("document.querySelector('#btnPrev').click()")
        time.sleep(0.4)
        ok("上一题生效", ws.evaluate("Practice.idx") == n0)

        print("=== 4. 多选题（提交按钮）===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题', cat:'一、密码法律法规', type:'多选题'}});
          App.renderCurrent();
        """)
        time.sleep(0.5)
        ok("多选题渲染 4 个选项", ws.evaluate("document.querySelectorAll('.opt').length") == 4)
        ws.evaluate("document.querySelectorAll('.opt')[0].click(); document.querySelectorAll('.opt')[1].click();")
        time.sleep(0.3)
        ok("多选可多选", ws.evaluate("document.querySelectorAll('.opt.chosen').length") == 2)
        ok("多选未提交时不判分", ws.evaluate("document.querySelectorAll('.result').length") == 0)
        ws.evaluate("document.querySelector('#btnSubmit').click()")
        time.sleep(0.4)
        ok("提交后出现结果", ws.evaluate("document.querySelectorAll('.result').length") == 1)
        collect_errors(ws, "多选题")

        print("=== 5. 填空题 ===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第二部分专业题', cat:'一、密码学', type:'填空题'}});
          App.renderCurrent();
        """)
        time.sleep(0.5)
        ok("填空输入框存在", ws.evaluate("!!document.querySelector('#blankInput')"))
        ans = ws.evaluate("Core.byId[Practice.list[Practice.idx].id].answer")
        ws.evaluate("var i=document.querySelector('#blankInput'); i.value=%s; i.dispatchEvent(new Event('input'));" % json.dumps(str(ans)))
        time.sleep(0.2)
        ws.evaluate("document.querySelector('#btnSubmit').click()")
        time.sleep(0.4)
        ok("填空正确判对", "回答正确" in (ws.evaluate("document.querySelector('.result') ? document.querySelector('.result').textContent : ''") or ""))

        print("=== 6. 连线题（表格渲染）===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{type:'连线题'}});
          App.renderCurrent();
        """)
        time.sleep(0.5)
        ok("连线题显示配对表", ws.evaluate("document.querySelectorAll('.match-table tr').length") >= 4)
        ok("连线题有 4 个选项", ws.evaluate("document.querySelectorAll('.opt').length") == 4)
        collect_errors(ws, "连线题")

        print("=== 7. 考试页（80 题 60 分钟）===")
        ws.evaluate("App.go('exam')")
        time.sleep(0.6)
        collect_errors(ws, "考试页")
        ws.evaluate("""
          (function(){ var p=Core.state.prefs; Core.state.examSession=null;
            Exam.start({single:p.examSingle, multi:p.examMulti, judge:p.examJudge, minutes:p.examMinutes}); })()
        """)
        time.sleep (1.2)
        collect_errors(ws, "开始考试")
        ok("考试题量 80", ws.evaluate("Core.state.examSession.ids.length") == 80)
        ok("计时器显示", bool(ws.evaluate("(document.querySelector('#examTimer')||{}).textContent")))
        ok("答题卡按钮 80 个", ws.evaluate("document.querySelectorAll('[data-jump]').length") == 80)
        # 作答第一题
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.4)
        ok("考试中不显示对错", ws.evaluate("document.querySelectorAll('.result').length") == 0)
        ok("考试作答已保存", ws.evaluate("Object.keys(Core.state.examSession.answers).length") >= 1)
        # 交卷
        ws.evaluate("Exam.submitPaper(true)")
        time.sleep(1.0)
        collect_errors(ws, "交卷")
        ok("交卷后 session 清空", ws.evaluate("Core.state.examSession === null"))
        ok("结果页渲染", ws.evaluate("document.querySelector('#view').innerHTML.length") > 3000)
        ok("有考试记录", ws.evaluate("Core.state.history.length") >= 1)
        ok("结果页有逐题解析", ws.evaluate("document.querySelectorAll('.exp-block').length") >= 80)

        print("=== 8. 其它页面 ===")
        for view, icon in (("wrong", "错题本"), ("fav", "收藏"), ("practical", "实操题"), ("stats", "统计"), ("home", "首页")):
            ws.evaluate("App.go('%s')" % view)
            time.sleep(0.5)
            collect_errors(ws, icon)
            size = ws.evaluate("document.querySelector('#view').innerHTML.length")
            ok(f"{icon}页渲染", size > 300, size)
        # 实操题内容
        ws.evaluate("App.go('practical')")
        time.sleep(0.5)
        ok("实操题有 12 条", ws.evaluate("document.querySelectorAll('[data-prac]').length") == 12)
        ok("实操题默认展示第一题", ws.evaluate("document.querySelector('#pracDetail').innerHTML.length") > 500)
        ok("实操题含代码块", ws.evaluate("document.querySelectorAll('#pracDetail pre.code').length") >= 1)
        ws.evaluate("document.querySelectorAll('[data-prac]')[11].click()")
        time.sleep(0.4)
        ok("可切换实操题", "RSA" in (ws.evaluate("document.querySelector('#pracDetail').textContent") or ""))

        print("=== 9. 设置与帮助弹窗 ===")
        ws.evaluate("document.querySelector('#btnSettings').click()")
        time.sleep(0.4)
        ok("设置弹窗打开", ws.evaluate("getComputedStyle(document.querySelector('#modalMask')).display") != "none")
        ok("设置项齐全", ws.evaluate("document.querySelectorAll('.setting-row').length") >= 6)
        ws.evaluate("document.querySelector('#modalClose').click()")
        time.sleep(0.3)
        ok("弹窗可关闭", ws.evaluate("getComputedStyle(document.querySelector('#modalMask')).display") == "none")
        ws.evaluate("document.querySelector('#btnHelp').click()")
        time.sleep(0.4)
        ok("帮助弹窗打开", ws.evaluate("document.querySelector('#modalBody').innerHTML.length") > 500)
        ws.evaluate("document.querySelector('#modalClose').click()")
        time.sleep(0.3)

        print("=== 10. 刷新后记录是否保留 ===")
        ws.call("Page.navigate", {"url": fresh_url()})
        time.sleep(2.5)
        collect_errors(ws, "刷新")
        ok("刷新后统计仍在", ws.evaluate("Object.keys(Core.state.stats).length") >= 1)
        ok("刷新后考试记录仍在", ws.evaluate("Core.state.history.length") >= 1)
        ok("刷新后错题仍在", ws.evaluate("Object.keys(Core.state.wrong).length") >= 1)
        ok("刷新后首页进度不是 0", ws.evaluate("Core.progressOf(window.BANK).done") >= 1)

        print("=== 11. 快捷键 ===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题', cat:'一、密码法律法规', type:'判断题'}});
          App.go('practice');
        """)
        time.sleep(0.5)
        # 用 CDP 发真实按键
        ws.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "1", "code": "Digit1", "windowsVirtualKeyCode": 49, "text": "1"})
        ws.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "1", "code": "Digit1", "windowsVirtualKeyCode": 49})
        time.sleep(0.5)
        ok("数字键答题（对）", ws.evaluate("document.querySelectorAll('.result').length") == 1)

        print()
        print("=== JS 报错汇总 ===")
        if errors:
            for e in errors:
                print("   [ERR]", e)
        else:
            print("   无 JS 报错")
        ok("全程无 JS 报错", len(errors) == 0, f"{len(errors)} 条")

    finally:
        br.kill()

    print(f"\n===== 端到端结果：pass {pass_n}，fail {fail_n} =====")
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(main())
