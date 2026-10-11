/* ============ 刷题模式 ============ */
(function () {
  "use strict";
  const { $, esc, state, save, grade, record, toggleFav, fmtTime, filterQuestions } = window.Core;

  const P = {
    list: [],
    idx: 0,
    chosen: {},        // qid -> 用户答案（当前题已提交时保留展示）
    revealed: {},      // qid -> 是否已看答案
    filter: { part: "", cat: "", type: "" },
    backStack: [],
  };

  function buildList(opts) {
    P.filter = Object.assign({ part: "", cat: "", type: "" }, opts.filter || {});
    let list = filterQuestions(P.filter);
    if (state.prefs.shuffle) list = window.Core.shuffle(list);
    P.list = list;
    P.idx = 0;
    P.chosen = {};
    P.revealed = {};
    state.session = { filter: P.filter, idx: 0, at: Date.now() };
    save();
  }

  function resumeOrBuild(opts) {
    if (state.session && opts.resume && !opts.force) {
      const s = state.session;
      P.filter = s.filter || P.filter;
      let list = filterQuestions(P.filter);
      if (state.prefs.shuffle) list = window.Core.shuffle(list);
      P.list = list;
      P.idx = Math.min(s.idx || 0, Math.max(0, list.length - 1));
    } else {
      buildList(opts);
    }
  }

  function current() { return P.list[P.idx]; }

  function goto(i) {
    if (i < 0 || i >= P.list.length) return;
    P.idx = i;
    if (state.session) { state.session.idx = i; save(); }
    window.App.renderCurrent();
  }

  function next() { goto(P.idx + 1); }
  function prev() { goto(P.idx - 1); }

  /* 当前题的展示状态 */
  function statusOf(q) {
    const chosen = P.chosen[q.id];
    const revealed = P.revealed[q.id];
    // 多选题必须显式提交才判分；其余题型在即时模式下选完即判
    const autoJudge = state.prefs.instant && q.kind !== "multi";
    const judged = !!revealed || (autoJudge && chosen != null && chosen !== "");
    let ok = null;
    if (judged) ok = grade(q, chosen).ok;
    return { chosen, revealed: !!revealed, judged, ok };
  }

  function choose(key) {
    const q = current();
    if (!q) return;
    const st = statusOf(q);
    if (st.judged) return;                               // 已判分则锁定
    if (q.kind === "multi") {
      const set = new Set((P.chosen[q.id] || "").split(""));
      if (set.has(key)) set.delete(key); else set.add(key);
      P.chosen[q.id] = [...set].sort().join("");
    } else {
      if (P.chosen[q.id] === key && !state.prefs.instant) {
        // 再点一次取消（未开启即时判分时）
        delete P.chosen[q.id];
      } else {
        P.chosen[q.id] = key;
      }
    }
    if (state.prefs.instant && (q.kind !== "multi")) submit(true);
    else window.App.renderCurrent();
  }

  function inputBlank(val) {
    const q = current();
    if (!q) return;
    P.chosen[q.id] = val;
  }

  function submit(silent) {
    const q = current();
    if (!q) return;
    if (P.judgedOnce && P.judgedOnce[q.id]) return;      // 防止重复计分
    const ans = P.chosen[q.id];
    if (ans == null || ans === "") { if (!silent) window.Core.toast("先作答再提交"); return; }
    const g = grade(q, ans);
    P.revealed[q.id] = true;
    P.judgedOnce = P.judgedOnce || {};
    P.judgedOnce[q.id] = true;
    if (g.ok) {
      // 答对：只更新统计（若之前在错题本里，保留待用户手动移除）
      const s = state.stats[q.id] || (state.stats[q.id] = { r: 0, w: 0 });
      s.r += 1; s.last = Date.now(); s.lastOk = true;
      window.Core.save();
    } else {
      // 答错：统计 + 错题本计一次
      window.Core.trackAnswer(q, false);
    }
    window.App.renderCurrent();
    if (g.ok && state.prefs.autoNext) {
      setTimeout(() => { if (current() === q) next(); }, 420);
    }
  }

  function reveal() {
    const q = current();
    if (!q) return;
    P.revealed[q.id] = true;
    if (P.chosen[q.id] == null && !(P.judgedOnce && P.judgedOnce[q.id])) {
      P.judgedOnce = P.judgedOnce || {};
      P.judgedOnce[q.id] = true;
      window.Core.trackAnswer(q, false);
    }
    window.App.renderCurrent();
  }

  function fav() {
    const q = current();
    if (!q) return;
    window.Core.toast(toggleFav(q.id) ? "已收藏" : "已取消收藏");
    window.App.renderCurrent();
  }

  /* ---------- 答题卡 ---------- */
  function sheetHtml() {
    const cells = P.list.map((q, i) => {
      const s = state.stats[q.id];
      let cls = "";
      if (s && s.r > 0) cls = s.lastOk ? "done" : "bad";
      if (P.chosen[q.id] != null) {
        const g = grade(q, P.chosen[q.id]);
        cls = g.ok ? "done" : (P.revealed[q.id] || state.prefs.instant ? "bad" : "");
      }
      if (i === P.idx) cls += " cur";
      return `<button class="${cls}" data-jump="${i}" title="第 ${i + 1} 题">${i + 1}</button>`;
    });
    return `<div class="sheet">${cells.join("")}</div>`;
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    const q = current();
    const total = P.list.length;
    const pr = window.Core.progressOf(P.list);
    const cats = window.BANK_META.tree;

    /* 左侧分类 */
    const left = [];
    left.push(`<div class="card"><h2>选择范围</h2><ul class="cat-list">`);
    const allActive = !P.filter.part && !P.filter.cat && !P.filter.type;
    left.push(`<li><button class="cat-item ${allActive ? "active" : ""}" data-scope="all">
      <span>全部题目</span><span class="n">${window.BANK_META.total}</span></button></li>`);
    Object.keys(cats).forEach((part) => {
      left.push(`<li><div class="cat-head">${esc(part)}</div><ul class="cat-list">`);
      Object.keys(cats[part]).forEach((cat) => {
        const counts = cats[part][cat];
        const n = Object.keys(counts).reduce((a, k) => a + counts[k], 0);
        const act = P.filter.part === part && P.filter.cat === cat && !P.filter.type;
        left.push(`<li><button class="cat-item ${act ? "active" : ""}" data-part="${esc(part)}" data-cat="${esc(cat)}">
          <span>${esc(cat.replace(/^[一二三四五六七八九十]+、/, ""))}</span><span class="n">${n}</span></button></li>`);
        if (act) {
          left.push(`<li><ul class="cat-list" style="margin:6px 0 0 10px">`);
          Object.keys(counts).forEach((t) => {
            const tact = P.filter.type === t;
            left.push(`<li><button class="cat-item ${tact ? "active" : ""}" data-part="${esc(part)}" data-cat="${esc(cat)}" data-type="${esc(t)}">
              <span>${esc(t)}</span><span class="n">${counts[t]}</span></button></li>`);
          });
          left.push(`</ul></li>`);
        }
        left.push(`</ul></li>`);
      });
      left.push(`</li>`);
    });
    left.push(`</ul></div>`);

    /* 中间题卡 */
    let mid;
    if (!q) {
      mid = `<div class="card"><div class="empty">当前范围没有题目</div></div>`;
    } else {
      const st = statusOf(q);
      const locked = st.judged;
      const multi = q.kind === "multi";
      let optsHtml = "";
      if (q.pairs && q.pairs.length) {
        optsHtml += `<table class="match-table">` + q.pairs.map((p) => {
          const parts = p.split("——");
          return `<tr><td>${esc(parts[0])}</td><td>${esc(parts[1] || "")}</td></tr>`;
        }).join("") + `</table>`;
      }
      if (q.options && q.options.length) {
        optsHtml += `<ul class="opts">` + q.options.map((o) => {
          const isChosen = (st.chosen || "").indexOf(o.key) >= 0;
          let cls = "opt" + (isChosen ? " chosen" : "");
          if (st.judged) {
            const isRight = q.answer.indexOf(o.key) >= 0;
            if (isRight) cls = "opt correct";
            else if (isChosen) cls = "opt wrong";
            cls += " locked";
          }
          return `<li class="${cls}" data-key="${o.key}">
            <span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span></li>`;
        }).join("") + `</ul>`;
      } else if (q.kind === "blank") {
        optsHtml = `<div style="margin-top:16px">
          <input class="blank-input" id="blankInput" placeholder="在此输入答案后回车提交" value="${esc(st.chosen || "")}" ${locked ? "disabled" : ""}>
          <div class="muted" style="margin-top:6px">支持填写数字/文字（自动忽略大小写、空格与单位），回车提交</div></div>`;
      } else if (q.kind === "judge") {
        optsHtml = `<ul class="opts">
          ${["对", "错"].map((k) => {
            const isChosen = st.chosen === k;
            let cls = "opt" + (isChosen ? " chosen" : "");
            if (st.judged) {
              if (q.answer === k) cls = "opt correct";
              else if (isChosen) cls = "opt wrong";
              cls += " locked";
            }
            return `<li class="${cls}" data-key="${k}"><span class="key">${k === "对" ? "√" : "×"}</span><span class="txt">${k}</span></li>`;
          }).join("")}
        </ul>`;
      }

      let resultHtml = "";
      if (st.judged) {
        const g = grade(q, st.chosen);
        const rightTxt = q.kind === "judge" ? q.answer : (q.kind === "blank" ? q.answer : q.answer.split("").join(" "));
        resultHtml = `<div class="result ${g.ok ? "ok" : "bad"}">
          <div class="r-title">${g.ok ? "✓ 回答正确" : "✗ 回答错误"}　正确答案：${esc(rightTxt)}${st.chosen ? "　你的答案：" + esc(q.kind === "judge" ? st.chosen : (q.kind === "blank" ? st.chosen : st.chosen.split("").join(" "))) : "　（未作答）"}</div>
          ${g.partial ? `<div class="muted">评分说明：${esc(g.partial)}</div>` : ""}
          <div class="exp-block">
            <h4>为什么选它</h4><p>${esc(q.correctReason || q.analysis || "")}</p>
            ${q.wrongReason ? `<h4>其他选项为什么不对</h4><p>${esc(q.wrongReason)}</p>` : ""}
            ${q.analysis ? `<h4>解析</h4><p>${esc(q.analysis)}</p>` : ""}
            <h4>依据</h4><p>${esc(q.source || "—")}</p>
            <h4>考点</h4><p>${esc(q.keyPoint || "—")}</p>
            ${q.conflict ? `<p class="muted" style="margin-top:8px">⚠ ${esc(q.conflict)}</p>` : ""}
            ${q.note ? `<p class="muted" style="margin-top:6px">※ ${esc(q.note)}</p>` : ""}
          </div>
        </div>`;
      }

      mid = `<div class="card">
        <div class="q-head">
          <span class="pill">${esc(q.part)}</span>
          <span class="pill gray">${esc(q.cat)}</span>
          <span class="pill gray">${esc(q.type)}</span>
          ${multi ? `<span class="pill warn">多选</span>` : ""}
          <span class="spacer"></span>
          <span class="q-type">第 ${P.idx + 1} / ${total} 题　题号 ${q.no}</span>
          <button class="btn small" id="btnFav">${state.fav[q.id] ? "★ 已收藏" : "☆ 收藏"}</button>
        </div>
        <div class="q-stem">${esc(q.stem)}</div>
        ${optsHtml}
        ${resultHtml}
        <div class="q-foot">
          <button class="btn" id="btnPrev" ${P.idx === 0 ? "disabled" : ""}>← 上一题</button>
          ${!st.judged ? `<button class="btn primary" id="btnSubmit">提交答案</button>
            <button class="btn ghost" id="btnReveal">直接看答案</button>` : `<button class="btn" id="btnNext2">下一题 →</button>`}
          <span class="spacer"></span>
          <span class="muted">快捷键：<span class="kbd">A~D</span> 选项　<span class="kbd">Enter</span> 提交/下一题　<span class="kbd">←</span><span class="kbd">→</span> 翻题　<span class="kbd">F</span> 收藏</span>
          <button class="btn" id="btnNext" ${P.idx >= total - 1 ? "disabled" : ""}>下一题 →</button>
        </div>
      </div>`;
    }

    /* 右侧信息 */
    const right = `<div class="card">
      <h2>刷题进度</h2>
      <div class="progress-bar"><i style="width:${(pr.rate * 100).toFixed(1)}%"></i></div>
      <div class="muted" style="margin-top:8px">
        本范围 ${pr.total} 题：已做 <b class="num">${pr.done}</b>，最近一次做对 <b class="num">${pr.right}</b>，做错 <b class="num">${pr.wrongFlag}</b>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn small" id="btnGoWrong">只刷本范围错题</button>
        <button class="btn small" id="btnGoNew">只刷没做过的</button>
      </div>
    </div>
    <div class="card">
      <h2>答题卡</h2>
      ${sheetHtml()}
      <div class="legend">
        <span><i style="background:#e7f8ee;border:1px solid #b9e6cd"></i>已做对</span>
        <span><i style="background:#fdecea;border:1px solid #f2c6c2"></i>做错</span>
        <span><i style="background:#fff;border:1px solid #dde3ee"></i>未做</span>
      </div>
    </div>
    <div class="card">
      <h2>快捷操作</h2>
      <div class="btn-row">
        <button class="btn small" id="btnShuffle">打乱顺序重做</button>
        <button class="btn small" id="btnResetScope">清空本范围记录</button>
      </div>
    </div>`;

    $("#view").innerHTML = `<div class="practice-wrap">
      <div class="side">${left.join("")}</div>
      <div>${mid}</div>
      <div class="side">${right}</div>
    </div>`;

    bind();
  }

  function bind() {
    const view = $("#view");
    view.querySelectorAll("[data-scope]").forEach((b) => {
      b.onclick = () => { buildList({ force: true, filter: {} }); render(); };
    });
    view.querySelectorAll("[data-part]").forEach((b) => {
      b.onclick = () => {
        buildList({ force: true, filter: { part: b.dataset.part, cat: b.dataset.cat, type: b.dataset.type || "" } });
        render();
      };
    });
    view.querySelectorAll(".opt").forEach((li) => {
      li.onclick = () => { if (!li.classList.contains("locked")) choose(li.dataset.key); };
    });
    const bi = $("#blankInput");
    if (bi) {
      bi.oninput = () => inputBlank(bi.value);
      bi.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
    }
    view.querySelectorAll("[data-jump]").forEach((b) => {
      b.onclick = () => goto(parseInt(b.dataset.jump, 10));
    });
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnPrev", prev);
    on("btnNext", next);
    on("btnNext2", next);
    on("btnSubmit", () => submit());
    on("btnReveal", reveal);
    on("btnFav", fav);
    on("btnGoWrong", () => { buildList({ force: true, filter: Object.assign({}, P.filter, { onlyWrong: true }) }); render(); });
    on("btnGoNew", () => { buildList({ force: true, filter: Object.assign({}, P.filter, { onlyNew: true }) }); render(); });
    on("btnShuffle", () => {
      P.list = window.Core.shuffle(P.list);
      P.idx = 0; render(); window.Core.toast("已打乱顺序");
    });
    on("btnResetScope", () => {
      window.Core.modal({
        title: "清空本范围答题记录",
        body: `<p>将清除当前范围 ${P.list.length} 道题的作答记录与错题标记，题目本身不受影响。</p>`,
        buttons: [{ text: "取消" }, {
          text: "确定清空", cls: "danger", onClick: () => {
            P.list.forEach((q) => { delete state.stats[q.id]; delete state.wrong[q.id]; delete P.chosen[q.id]; delete P.revealed[q.id]; });
            save(); render(); window.Core.toast("已清空本范围记录");
          }
        }],
      });
    });
  }

  /* 键盘 */
  function onKey(e) {
    if (window.App.view !== "practice") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if ($("#modalMask").hidden === false) return;
    const q = current();
    if (!q) return;
    const k = e.key.toUpperCase();
    if (["A", "B", "C", "D"].indexOf(k) >= 0 && q.options && q.options.length) {
      const has = q.options.some((o) => o.key === k);
      if (has) { e.preventDefault(); choose(k); }
      return;
    }
    if (q.kind === "judge" && (k === "1" || k === "2")) {
      e.preventDefault(); choose(k === "1" ? "对" : "错"); return;
    }
    if (e.key === "Enter") { e.preventDefault(); const st = statusOf(q); if (!st.judged) submit(); else next(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); next(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); return; }
    if (k === "F") { e.preventDefault(); fav(); return; }
  }

  window.Practice = { render, buildList, resumeOrBuild, onKey, choose, submit, next, prev, get list() { return P.list; }, get idx() { return P.idx; } };
})();
