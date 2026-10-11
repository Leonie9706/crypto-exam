# -*- coding: utf-8 -*-
"""异常与边界场景测试：脏数据、禁用存储、空范围、超小试卷、重复判分"""
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Browser  # noqa

PORT = 9337
URL = "http://127.0.0.1:8848/index.html"
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


def fresh(ws, extra_js=""):
    ws.call("Page.navigate", {"url": URL + "?t=%d" % int(time.time() * 1000)})
    time.sleep(2.2)
    if extra_js:
        ws.evaluate(extra_js)
        time.sleep(0.3)


def main():
    br = Browser(port=PORT)
    try:
        ws = br.new_page()
        ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})

        print("=== 1. 脏数据：localStorage 被写坏 ===")
        fresh(ws)
        bad_cases = [
            ("JSON 语法错误", "'{not json'"),
            ("不是对象", "'hello'"),
            ("数组", "[1,2,3]"),
            ("字段类型全错", "JSON.stringify({prefs:'x',stats:[],wrong:'y',fav:5,history:'z',session:1,examSession:'q'})"),
            ("history 里混入脏记录", "JSON.stringify({history:[null,{},{at:'x'},{at:1,paper:null,score:'a'}]})"),
        ]
        for name, expr in bad_cases:
            ws.evaluate("localStorage.setItem('mmsj.v1', %s)" % expr)
            fresh(ws)
            drain(ws, name)
            size = ws.evaluate("document.querySelector('#view').innerHTML.length")
            state_ok = ws.evaluate("!!Core.state && typeof Core.state.stats === 'object' && Array.isArray(Core.state.history)")
            ok(f"脏数据「{name}」仍能正常打开", size > 500 and state_ok, size)

        print("=== 2. 脏历史记录：考试页不再崩 ===")
        ws.evaluate("""localStorage.setItem('mmsj.v1', JSON.stringify({
            history:[{at:Date.now(),usedSec:10,paper:null,score:50,right:1,wrong:1,empty:0,total:2,auto:false},
                     {at:Date.now(),score:0}],
            stats:{},wrong:{},fav:{}}))""")
        fresh(ws)
        r = ws.call("Runtime.evaluate", {"expression": "App.go('exam')", "returnByValue": True})
        crashed = bool(r.get("exceptionDetails"))
        ok("考试页渲染脏历史不报错", not crashed,
           ((r.get("exceptionDetails") or {}).get("exception") or {}).get("description", "")[:120])
        drain(ws, "脏历史")
        ok("考试页有内容", ws.evaluate("document.querySelector('#view').innerHTML.length") > 500)

        print("=== 3. 禁用 localStorage（隐私模式）===")
        fresh(ws)
        ws.evaluate("""
          (function(){
            var orig = window.localStorage.setItem;
            window.localStorage.setItem = function(){ throw new Error('QuotaExceededError'); };
          })()
        """)
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题',cat:'一、密码法律法规',type:'判断题'}});
          App.go('practice');
        """)
        time.sleep(0.4)
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.4)
        drain(ws, "写入失败")
        ok("存储写入失败不崩溃", ws.evaluate("document.querySelectorAll('.result').length") == 1)
        ok("存储失败被标记", ws.evaluate("Core.storageAvailable()") is False)

        print("=== 4. 空范围刷题 ===")
        fresh(ws)
        ws.evaluate("localStorage.setItem('mmsj.v1', JSON.stringify({wrong:{},fav:{},stats:{},history:[]}))")
        fresh(ws)
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'不存在的章节'}});
          App.go('practice');
        """)
        time.sleep(0.4)
        drain(ws, "空范围")
        ok("空范围提示友好", "没有题目" in (ws.evaluate("document.querySelector('#view').textContent") or ""))
        ws.evaluate("App.go('wrong')")
        time.sleep(0.3)
        ok("空错题本提示友好", "错题本是空的" in (ws.evaluate("document.querySelector('#view').textContent") or ""))
        ws.evaluate("App.go('fav')")
        time.sleep(0.3)
        ok("空收藏提示友好", "还没有收藏" in (ws.evaluate("document.querySelector('#view').textContent") or ""))
        drain(ws, "空列表")

        print("=== 5. 超小试卷（1 单选 + 1 判断）===")
        fresh(ws)
        ws.evaluate("(function(){Core.state.examSession=null; Exam.start({single:1,multi:1,judge:1,minutes:5});})()")
        time.sleep(0.8)
        ok("小试卷题量 3", ws.evaluate("Core.state.examSession.ids.length") == 3)
        ws.evaluate("Exam.submitPaper(true)")
        time.sleep(0.8)
        drain(ws, "小试卷")
        ok("小试卷可交卷", ws.evaluate("Core.state.history.length") >= 1)
        ok("小试卷得分合理", 0 <= ws.evaluate("Core.state.history[0].score") <= 100)

        print("=== 6. 空试卷不该留下脏记录 ===")
        fresh(ws)
        before = ws.evaluate("Core.state.history.length")
        ws.evaluate("(function(){ try{ Exam.submitPaper(true); }catch(e){} })()")
        time.sleep(0.3)
        after = ws.evaluate("Core.state.history.length")
        ok("空试卷不产生考试记录", before == after, f"{before} -> {after}")
        drain(ws, "空试卷")

        print("=== 7. 重复判分防护 ===")
        fresh(ws)
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题',cat:'一、密码法律法规',type:'单选题'}});
          App.go('practice');
        """)
        time.sleep(0.4)
        qid = ws.evaluate("Practice.list[0].id")
        ws.evaluate("document.querySelectorAll('.opt')[0].click()")
        time.sleep(0.4)
        r1 = ws.evaluate("Core.state.stats['%s'].r" % qid)
        # 反复点、反复提交
        ws.evaluate("""
          for (var i=0;i<5;i++){
            var btns = document.querySelectorAll('.opt');
            if (btns[2]) btns[2].click();
            var sb = document.querySelector('#btnSubmit');
            if (sb) sb.click();
          }
        """)
        time.sleep(0.4)
        r2 = ws.evaluate("Core.state.stats['%s'].r" % qid)
        ok("同一题重复点击不重复计分", r1 == r2, f"{r1} -> {r2}")

        print("=== 8. 错题本与统计一致性 ===")
        ws.evaluate("""
          Practice.buildList({force:true, filter:{part:'第一部分基础题',cat:'一、密码法律法规',type:'判断题'}});
          App.renderCurrent();
        """)
        time.sleep(0.3)
        # 故意答错：取与正确答案相反的选项
        ws.evaluate("""
          (function(){
            var q = Practice.list[Practice.idx];
            var wrongKey = q.answer === '对' ? '错' : '对';
            var opt = Array.prototype.find.call(document.querySelectorAll('.opt'), function(o){ return o.dataset.key === wrongKey; });
            if (opt) opt.click();
          })()
        """)
        time.sleep(0.4)
        drain(ws, "答错")
        ok("答错进入错题本", ws.evaluate("Object.keys(Core.state.wrong).length") >= 1)
        wcount = ws.evaluate("Object.values(Core.state.wrong)[0].n")
        scount = ws.evaluate("Object.values(Core.state.stats)[0].w")
        ok("错次与统计一致（不重复计数）", wcount == scount, f"wrong.n={wcount} stats.w={scount}")

        print("=== 9. 导入非法文件 ===")
        for name, payload in (("非 JSON", "这不是json"), ("缺字段", '{"foo":1}'), ("history 为字符串", '{"history":"x"}')):
            ws.evaluate("window.__importErr = null")
            ws.evaluate("""
              (function(){
                try { Core.importData(%s); window.__importErr = 'none'; }
                catch(e){ window.__importErr = e.message; }
              })()
            """ % json.dumps(payload))
            ok(f"导入「{name}」被安全处理", ws.evaluate("window.__importErr") is not None)
        drain(ws, "导入")
        ok("导入异常后页面仍可用", ws.evaluate("document.querySelector('#view').innerHTML.length") > 300)

        print()
        print("=== JS 报错汇总 ===")
        for e in errors or []:
            print("   [ERR]", e)
        ok("全程无未捕获 JS 报错", len(errors) == 0, f"{len(errors)} 条")
    finally:
        br.kill()

    print(f"\n===== 边界测试：pass {p}，fail {f} =====")
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
