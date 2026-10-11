/* ============ 首页 / 错题本 / 收藏 / 实操题 / 统计 ============ */
(function () {
  "use strict";
  const { $, esc, state, save, fmtTime, fmtDate, filterQuestions, grade } = window.Core;

  function kindsOf(list) {
    const c = { single: 0, multi: 0, judge: 0, blank: 0 };
    list.forEach((q) => { c[q.kind] = (c[q.kind] || 0) + 1; });
    return c;
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    const pr = window.Core.progressOf(window.BANK);
    const wrongN = Object.keys(state.wrong).length;
    const favN = Object.keys(state.fav).length;
    const k = kindsOf(window.BANK);
    const last = state.history[0];
    const acc = pr.done ? Math.round(window.BANK.filter((q) => state.stats[q.id] && state.stats[q.id].lastOk).length / pr.done * 100) : 0;

    $("#view").innerHTML = `
      <div class="hero">
        <h1>2026 年江苏省密码行业职业技能竞赛 · 刷题系统</h1>
        <p>题库共 <b>${window.BANK_META.total}</b> 道理论题（单选 ${k.single} · 多选 ${k.multi} · 判断 ${k.judge} · 填空 ${k.blank}）＋ <b>${window.BANK_META.practicalTotal}</b> 道实操题，每题都配「为什么错」的解析与依据。</p>
        <div class="hero-stats">
          <div><b class="num">${pr.done}</b><span>已做题目</span></div>
          <div><b class="num">${(pr.rate * 100).toFixed(1)}%</b><span>题库进度</span></div>
          <div><b class="num">${pr.done ? acc + "%" : "—"}</b><span>最近一次正确率</span></div>
          <div><b class="num">${wrongN}</b><span>错题本</span></div>
          <div><b class="num">${favN}</b><span>收藏</span></div>
          <div><b class="num">${state.history.length}</b><span>考试次数</span></div>
        </div>
      </div>

      <div class="grid c4">
        <div class="mode-card" data-go="practice">
          <div class="big">📘</div>
          <h3>顺序刷题</h3>
          <p>按章节/题型练习，答完立刻看解析。当前进度 ${(pr.rate * 100).toFixed(1)}%</p>
        </div>
        <div class="mode-card" data-go="exam">
          <div class="big">⏱️</div>
          <h3>模拟考试</h3>
          <p>80 题 / 60 分钟自动组卷，交卷出分并逐题解析${last ? `。上次 ${last.score} 分` : ""}</p>
        </div>
        <div class="mode-card" data-go="wrong">
          <div class="big">📕</div>
          <h3>错题本</h3>
          <p>${wrongN} 道错题，支持只看某章节、重做并移除</p>
        </div>
        <div class="mode-card" data-go="practical">
          <div class="big">🧩</div>
          <h3>实操题</h3>
          <p>${window.BANK_META.practicalTotal} 道密码算法/逆向/流量分析题的思路、脚本与 flag</p>
        </div>
      </div>

      <div class="row" style="margin-top:16px">
        <div class="card" style="flex:1 1 56%">
          <h2>按章节开始刷题</h2>
          <table class="tbl">
            <thead><tr><th>章节</th><th>题量</th><th>进度</th><th></th></tr></thead>
            <tbody>
            ${Object.keys(window.BANK_META.tree).map((part) => Object.keys(window.BANK_META.tree[part]).map((cat) => {
              const list = window.BANK.filter((q) => q.part === part && q.cat === cat);
              const p = window.Core.progressOf(list);
              return `<tr>
                <td>${esc(cat)}<div class="muted">${esc(part)}</div></td>
                <td class="num">${list.length}</td>
                <td style="min-width:140px">
                  <div class="progress-bar"><i style="width:${(p.rate * 100).toFixed(1)}%"></i></div>
                  <div class="muted num">${p.done}/${p.total}</div>
                </td>
                <td><button class="btn small" data-cat-go="${esc(part)}|${esc(cat)}">开始</button></td>
              </tr>`;
            }).join("")).join("")}
            </tbody>
          </table>
        </div>
        <div class="card" style="flex:1 1 40%">
          <h2>最近考试</h2>
          ${state.history.length ? state.history.slice(0, 6).map((h) => `
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed var(--line);padding:8px 0">
              <span class="muted">${fmtDate(h.at)}</span>
              <span><b style="color:${h.score >= 80 ? "var(--ok)" : h.score >= 60 ? "var(--warn)" : "var(--bad)"}">${h.score}</b> 分
              <span class="muted num">（对${h.right}/错${h.wrong}/空${h.empty}）</span></span>
            </div>`).join("") : `<div class="empty">还没有考试记录</div>`}
          <div class="card" style="margin-top:14px;background:#f7f9fd;box-shadow:none">
            <h2 style="font-size:15px">温馨提示</h2>
            <div class="muted">
              · 本程序完全离线运行，作答记录保存在本机浏览器里，换浏览器/清缓存会丢失，可到「统计」页导出备份。<br>
              · 多选题默认「少选按比例给分、错选不得分」，可在「设置」里改为严格判分。<br>
              · 题库部分题目在原卷中存在题型与答案不一致的情况，程序会照原卷保留并加提示标记。
            </div>
          </div>
        </div>
      </div>`;

    document.querySelectorAll("[data-go]").forEach((el) => {
      el.onclick = () => window.App.go(el.dataset.go);
    });
    document.querySelectorAll("[data-cat-go]").forEach((el) => {
      el.onclick = () => {
        const [part, cat] = el.dataset.catGo.split("|");
        window.Practice.buildList({ force: true, filter: { part, cat } });
        window.App.go("practice");
      };
    });
  }

  /* ---------------- 错题本 ---------------- */
  function renderWrong() {
    const list = window.BANK.filter((q) => state.wrong[q.id]);
    const groups = {};
    list.forEach((q) => { const k = q.cat; (groups[k] = groups[k] || []).push(q); });
    $("#view").innerHTML = `
      <div class="card">
        <div class="q-head">
          <h2 style="margin:0">错题本（${list.length} 题）</h2>
          <span class="spacer"></span>
          <button class="btn primary" id="btnDoWrong" ${list.length ? "" : "disabled"}>开始重做全部错题</button>
          <button class="btn" id="btnRevealSheet" ${list.length ? "" : "disabled"}>导出错题清单</button>
        </div>
        ${list.length ? Object.keys(groups).map((cat) => `
          <h3 style="font-size:15px;margin:16px 0 8px">${esc(cat)}（${groups[cat].length}）</h3>
          <table class="tbl">
            <thead><tr><th style="width:60px">题号</th><th>题目</th><th style="width:70px">答案</th><th style="width:70px">错次</th><th style="width:150px">操作</th></tr></thead>
            <tbody>
            ${groups[cat].map((q) => `<tr>
              <td class="num">${q.no}</td>
              <td>${esc(q.stem.slice(0, 56))}${q.stem.length > 56 ? "…" : ""}
                ${q.conflict ? `<span class="pill warn">原卷存疑</span>` : ""}</td>
              <td class="num">${esc(q.answer)}</td>
              <td class="num">${state.wrong[q.id].n || 1}</td>
              <td>
                <button class="btn small" data-open="${esc(q.id)}">看解析</button>
                <button class="btn small danger" data-drop="${esc(q.id)}">移除</button>
              </td></tr>`).join("")}
            </tbody>
          </table>`).join("") : `<div class="empty">错题本是空的 —— 做错的题会自动收进来</div>`}
      </div>`;

    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnDoWrong", () => {
      window.Practice.buildList({ force: true, filter: { onlyWrong: true } });
      window.App.go("practice");
    });
    on("btnRevealSheet", () => {
      const text = list.map((q) => `${q.part} / ${q.cat} / ${q.type} 第${q.no}题\n${q.stem}\n正确答案：${q.answer}\n解析：${q.correctReason || q.analysis}\n依据：${q.source || ""}\n`).join("\n----------------\n");
      window.App.downloadText(text, "错题清单.txt");
    });
    document.querySelectorAll("[data-open]").forEach((b) => {
      b.onclick = () => window.App.showQuestionModal(window.Core.byId[b.dataset.open]);
    });
    document.querySelectorAll("[data-drop]").forEach((b) => {
      b.onclick = () => { window.Core.removeWrong(b.dataset.drop); renderWrong(); window.Core.toast("已移除"); };
    });
  }

  /* ---------------- 收藏 ---------------- */
  function renderFav() {
    const list = window.BANK.filter((q) => state.fav[q.id]);
    $("#view").innerHTML = `
      <div class="card">
        <div class="q-head">
          <h2 style="margin:0">收藏夹（${list.length} 题）</h2>
          <span class="spacer"></span>
          <button class="btn primary" id="btnDoFav" ${list.length ? "" : "disabled"}>练习收藏题目</button>
        </div>
        ${list.length ? `<table class="tbl">
          <thead><tr><th style="width:60px">题号</th><th>题目</th><th style="width:160px">章节</th><th style="width:150px">操作</th></tr></thead>
          <tbody>${list.map((q) => `<tr>
            <td class="num">${q.no}</td>
            <td>${esc(q.stem.slice(0, 60))}${q.stem.length > 60 ? "…" : ""}</td>
            <td class="muted">${esc(q.cat)} / ${esc(q.type)}</td>
            <td><button class="btn small" data-open="${esc(q.id)}">看解析</button>
                <button class="btn small danger" data-unfav="${esc(q.id)}">取消收藏</button></td>
          </tr>`).join("")}</tbody></table>` : `<div class="empty">还没有收藏题目 —— 刷题时点「☆ 收藏」即可加入</div>`}
      </div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnDoFav", () => { window.Practice.buildList({ force: true, filter: { onlyFav: true } }); window.App.go("practice"); });
    document.querySelectorAll("[data-open]").forEach((b) => { b.onclick = () => window.App.showQuestionModal(window.Core.byId[b.dataset.open]); });
    document.querySelectorAll("[data-unfav]").forEach((b) => {
      b.onclick = () => { window.Core.toggleFav(b.dataset.unfav); renderFav(); };
    });
  }

  /* ---------------- 实操题 ---------------- */
  function renderPractical() {
    const list = window.PRACTICAL || [];
    const cats = [];
    list.forEach((p) => { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    $("#view").innerHTML = `
      <div class="card">
        <h2>第三部分 实操题（${list.length} 道）</h2>
        <p class="muted">这部分是 CTF 风格的实操题：题干描述、解题思路、参考脚本与 flag。带 <span class="pill ok">已复算</span> 标记的题目，脚本与参数已在本机实际运行验证过。</p>
        <div class="row" style="margin-top:12px;align-items:flex-start">
          <div style="flex:0 0 300px">
            <ul class="prac-list" id="pracList">
              ${cats.map((c) => `<li><div class="cat-head">${esc(c)}</div>
                ${list.filter((p) => p.cat === c).map((p) => `<button data-prac="${esc(p.id || p.no)}">${p.no}. ${esc(p.title)}</button>`).join("")}
              </li>`).join("")}
            </ul>
          </div>
          <div style="flex:1;min-width:0" id="pracDetail"></div>
        </div>
      </div>`;
    const show = (p) => {
      $("#pracDetail").innerHTML = `
        <h2>${p.no}. ${esc(p.title)}</h2>
        <div style="margin:8px 0">
          <span class="pill gray">${esc(p.cat)}</span>
          ${p.difficulty ? `<span class="pill">难度 ${esc(p.difficulty)}</span>` : ""}
          ${p.verified && p.verified.indexOf("本机") >= 0 ? `<span class="pill ok">已复算</span>` : ""}
        </div>
        <h4 style="margin:14px 0 4px">题干描述</h4>
        <div style="white-space:pre-wrap">${esc(p.desc)}</div>
        <h4 style="margin:16px 0 4px">解题思路</h4>
        <ol style="margin:0;padding-left:22px">${(p.idea || []).map((x) => `<li style="margin-bottom:6px">${esc(x)}</li>`).join("")}</ol>
        ${p.code ? `<h4 style="margin:16px 0 4px">参考脚本</h4><pre class="code">${esc(p.code)}</pre>` : ""}
        <h4 style="margin:16px 0 4px">Flag</h4>
        ${p.flag ? `<div class="flag-box">${esc(p.flag)}</div>` : `<div class="muted">原卷未给出 flag</div>`}
        ${p.flagNote ? `<p class="muted" style="margin-top:8px">※ ${esc(p.flagNote)}</p>` : ""}
        ${p.verified ? `<p class="muted" style="margin-top:6px">验证情况：${esc(p.verified)}</p>` : ""}`;
    };
    document.querySelectorAll("[data-prac]").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll("[data-prac]").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        show(list.find((p) => String(p.id || p.no) === b.dataset.prac));
      };
    });
    const first = document.querySelector("[data-prac]");
    if (first) first.click();
  }

  /* ---------------- 统计 ---------------- */
  function renderStats() {
    const pr = window.Core.progressOf(window.BANK);
    const rows = [];
    Object.keys(window.BANK_META.tree).forEach((part) => {
      Object.keys(window.BANK_META.tree[part]).forEach((cat) => {
        const list = window.BANK.filter((q) => q.part === part && q.cat === cat);
        const p = window.Core.progressOf(list);
        const types = {};
        list.forEach((q) => {
          const t = q.type;
          types[t] = types[t] || { n: 0, done: 0, ok: 0 };
          types[t].n++;
          const s = state.stats[q.id];
          if (s && s.r) { types[t].done++; if (s.lastOk) types[t].ok++; }
        });
        rows.push({ part, cat, p, types });
      });
    });
    const totalRight = window.BANK.filter((q) => state.stats[q.id] && state.stats[q.id].lastOk).length;
    const totalWrongFlag = window.BANK.filter((q) => state.stats[q.id] && state.stats[q.id].r && !state.stats[q.id].lastOk).length;

    $("#view").innerHTML = `
      <div class="grid c4">
        <div class="card" style="margin:0"><div class="muted">已做题数</div><div style="font-size:26px;font-weight:700">${pr.done} <span class="muted" style="font-size:14px">/ ${pr.total}</span></div></div>
        <div class="card" style="margin:0"><div class="muted">最近做对</div><div style="font-size:26px;font-weight:700;color:var(--ok)">${totalRight}</div></div>
        <div class="card" style="margin:0"><div class="muted">最近做错</div><div style="font-size:26px;font-weight:700;color:var(--bad)">${totalWrongFlag}</div></div>
        <div class="card" style="margin:0"><div class="muted">考试次数 / 最高分</div><div style="font-size:26px;font-weight:700">${state.history.length}${state.history.length ? ` <span class="muted" style="font-size:14px">最高 ${Math.max.apply(null, state.history.map((h) => h.score))} 分</span>` : ""}</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h2>分章节掌握情况</h2>
        <table class="tbl">
          <thead><tr><th>章节</th><th>题型构成</th><th style="width:180px">进度</th><th style="width:90px">正确率</th></tr></thead>
          <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.cat)}<div class="muted">${esc(r.part)}</div></td>
            <td class="muted">${Object.keys(r.types).map((t) => `${esc(t)} ${r.types[t].ok}/${r.types[t].done}·共${r.types[t].n}`).join("　")}</td>
            <td>
              <div class="progress-bar"><i style="width:${(r.p.rate * 100).toFixed(1)}%"></i></div>
              <div class="muted num">${r.p.done}/${r.p.total}</div>
            </td>
            <td class="num">${r.p.done ? Math.round(r.p.right / r.p.done * 100) + "%" : "—"}</td>
          </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2>数据管理</h2>
        <p class="muted">作答记录保存在本机浏览器（localStorage）。换电脑、换浏览器或清理浏览器数据前，建议先导出备份。</p>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn primary" id="btnExport">导出学习记录</button>
          <button class="btn" id="btnImport">导入学习记录</button>
          <button class="btn danger" id="btnReset">清空全部记录</button>
        </div>
      </div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnExport", () => window.App.downloadText(window.Core.exportData(), `密码竞赛刷题-学习记录-${new Date().toISOString().slice(0, 10)}.json`));
    on("btnImport", () => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json,application/json";
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          try { window.Core.importData(fr.result); window.Core.toast("导入成功"); renderStats(); }
          catch (e) { window.Core.toast("导入失败：" + e.message); }
        };
        fr.readAsText(f, "utf-8");
      };
      inp.click();
    });
    on("btnReset", () => {
      window.Core.modal({
        title: "清空全部记录",
        body: "<p>将清空所有作答记录、错题本、收藏与考试历史（题库本身不受影响）。此操作不可撤销。</p>",
        buttons: [{ text: "取消" }, { text: "确认清空", cls: "danger", onClick: () => { window.Core.resetAll(); window.Core.toast("已清空"); renderStats(); } }],
      });
    });
  }

  window.Pages = { renderHome, renderWrong, renderFav, renderPractical, renderStats };
})();
