/* ============ 模拟考试：80题 / 60分钟（40单选 + 20多选 + 20判断） ============ */
(function () {
  "use strict";
  const { $, esc, state, save, grade, fmtTime, fmtDate, shuffle, byId } = window.Core;

  const E = {
    qs: [], answers: {}, idx: 0, endAt: 0, started: 0, remain: 0, timer: null, finished: false, paper: null,
  };

  function pick(pool, n, used) {
    let cand = pool.filter((q) => !used.has(q.id));
    const fresh = cand.filter((q) => !state.stats[q.id] || !state.stats[q.id].r);
    if (fresh.length >= n) cand = fresh;
    const out = shuffle(cand).slice(0, n);
    out.forEach((q) => used.add(q.id));
    return out;
  }

  function start(cfg) {
    cfg = Object.assign({ single: 40, multi: 20, judge: 20, minutes: 60 }, cfg || {});
    const used = new Set();
    const single = pick(window.BANK.filter((q) => q.kind === "single"), cfg.single, used);
    const multi = pick(window.BANK.filter((q) => q.kind === "multi"), cfg.multi, used);
    const judge = pick(window.BANK.filter((q) => q.kind === "judge"), cfg.judge, used);
    E.qs = single.concat(multi, judge);
    if (state.prefs.examShuffle) E.qs = shuffle(E.qs);
    E.qs.forEach((q) => { q._kind = q.kind; });
    E.answers = {};
    E.idx = 0;
    E.finished = false;
    E.started = Date.now();
    E.endAt = E.started + cfg.minutes * 60 * 1000;
    E.paper = {
      single: single.length, multi: multi.length, judge: judge.length,
      minutes: cfg.minutes, total: E.qs.length,
    };
    state.examSession = { ids: E.qs.map((q) => q.id), answers: {}, idx: 0, endAt: E.endAt, paper: E.paper };
    save();
    tick(true);
    window.App.go("exam");
  }

  function resume() {
    const s = state.examSession;
    if (!s || !s.ids) return false;
    if (Date.now() >= s.endAt) { return false; }
    E.qs = s.ids.map((id) => byId[id]).filter(Boolean);
    if (!E.qs.length) return false;
    E.answers = s.answers || {};
    E.idx = s.idx || 0;
    E.endAt = s.endAt;
    E.paper = s.paper;
    E.started = s.endAt - (s.paper ? s.paper.minutes : 60) * 60000;
    E.finished = false;
    return true;
  }

  function persist() {
    if (!state.examSession) return;
    state.examSession.answers = E.answers;
    state.examSession.idx = E.idx;
    save();
  }

  function tick(silent) {
    const left = Math.max(0, Math.round((E.endAt - Date.now()) / 1000));
    E.remain = left;
    const el = $("#examTimer");
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle("danger", left <= 300);
    }
    if (left <= 0 && !E.finished) { submitPaper(true); return; }
    if (!silent) clearTimeout(E.timer);
    E.timer = setTimeout(() => tick(false), 1000);
  }

  function current() { return E.qs[E.idx]; }

  function choose(key) {
    const q = current();
    if (!q || E.finished) return;
    if (q.kind === "multi") {
      const set = new Set((E.answers[q.id] || "").split(""));
      if (set.has(key)) set.delete(key); else set.add(key);
      E.answers[q.id] = [...set].sort().join("");
    } else {
      E.answers[q.id] = key;
    }
    persist();
    window.Exam.render();
  }

  function inputBlank(v) {
    const q = current();
    if (!q) return;
    E.answers[q.id] = v;
    persist();
  }

  function goto(i) {
    if (i < 0 || i >= E.qs.length) return;
    E.idx = i; persist(); window.Exam.render();
  }

  function unanswered() {
    return E.qs.filter((q) => {
      const a = E.answers[q.id];
      return a == null || a === "";
    });
  }

  function repaper(h) {
    // 兼容历史里的脏记录（paper 缺失/为 null），从已有字段推算，避免渲染崩溃
    const p = h && h.paper;
    if (p && typeof p === "object") {
      return {
        single: p.single || 0, multi: p.multi || 0, judge: p.judge || 0,
        minutes: p.minutes || 0, total: p.total || (h.total || 0),
      };
    }
    const total = (h && h.total) || 0;
    return { single: 0, multi: 0, judge: 0, minutes: 0, total };
  }

  function submitPaper(auto) {
    if (E.finished) return;
    if (!E.qs || !E.qs.length) {          // 空试卷：不结算、不留记录
      clearTimeout(E.timer);
      E.finished = true;
      return;
    }
    if (state.examSession && state.examSession.answers) E.answers = state.examSession.answers;
    const left = unanswered();
    const doSubmit = () => {
      E.finished = true;
      clearTimeout(E.timer);
      let got = 0, full = 0, right = 0, wrong = 0, empty = 0, partRight = 0;
      const details = [];
      E.qs.forEach((q) => {
        const a = E.answers[q.id];
        const g = grade(q, a);
        full += 1;
        got += g.score;
        if (g.empty) empty++;
        else if (g.ok) right++;
        else { wrong++; if (g.score > 0) partRight++; }
        // 统计与错题本：统一走 Core.trackAnswer，避免重复累加
        window.Core.trackAnswer(q, g.ok);
        details.push({ id: q.id, chosen: a, ok: g.ok, score: g.score, kind: q.kind });
      });
      const score100 = full ? Math.round((got / full) * 100) : 0;
      // 停表时间：优先用试卷时长，且不允许出现负数或超大值
      let usedSec = Math.round((Date.now() - E.started) / 1000);
      const limitSec = ((E.paper && E.paper.minutes) || 60) * 60;
      if (!isFinite(usedSec) || usedSec < 0 || usedSec > limitSec) usedSec = limitSec;
      const rec = {
        at: Date.now(), usedSec,
        paper: E.paper, score: score100, right, wrong, empty,
        total: full, auto: !!auto,
      };
      state.history.unshift(rec);
      state.history = state.history.slice(0, 60);
      state.examSession = null;
      save();
      E.result = { rec, details };
      window.App.go("examResult");
    };
    if (auto) { doSubmit(); return; }
    window.Core.modal({
      title: "交卷确认",
      body: `<p>共 ${E.qs.length} 题，已作答 <b>${E.qs.length - left.length}</b> 题，未作答 <b>${left.length}</b> 题。</p>
             <p class="muted">交卷后立即评分，错题会自动进入错题本。</p>`,
      buttons: [
        { text: "继续答题" },
        { text: "确认交卷", cls: "primary", onClick: doSubmit },
      ],
    });
  }

  function sheetHtml() {
    return E.qs.map((q, i) => {
      const a = E.answers[q.id];
      let cls = "";
      if (a != null && a !== "") {
        if (E.finished || E.result) {
          const g = grade(q, a);
          cls = g.ok ? "done" : "bad";
        } else cls = "done";
      }
      if (i === E.idx) cls += " cur";
      return `<button class="${cls}" data-jump="${i}">${i + 1}</button>`;
    }).join("");
  }

  function render() {
    if (E.finished && E.result) { renderResult(); return; }
    const q = current();
    const left = unanswered().length;
    if (!q) { $("#view").innerHTML = `<div class="card"><div class="empty">考试尚未开始</div></div>`; bindStart(); return; }

    let opts = "";
    if (q.pairs && q.pairs.length) {
      opts += `<table class="match-table">` + q.pairs.map((p) => {
        const parts = p.split("——");
        return `<tr><td>${esc(parts[0])}</td><td>${esc(parts[1] || "")}</td></tr>`;
      }).join("") + `</table>`;
    }
    if (q.options && q.options.length) {
      opts += `<ul class="opts">` + q.options.map((o) => {
        const isChosen = (E.answers[q.id] || "").indexOf(o.key) >= 0;
        return `<li class="opt ${isChosen ? "chosen" : ""}" data-key="${o.key}">
          <span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span></li>`;
      }).join("") + `</ul>`;
    } else if (q.kind === "blank") {
      opts = `<div style="margin-top:16px"><input class="blank-input" id="blankInput" placeholder="输入答案" value="${esc(E.answers[q.id] || "")}"></div>`;
    } else if (q.kind === "judge") {
      opts = `<ul class="opts">` + ["对", "错"].map((k) => {
        const isChosen = E.answers[q.id] === k;
        return `<li class="opt ${isChosen ? "chosen" : ""}" data-key="${k}"><span class="key">${k === "对" ? "√" : "×"}</span><span class="txt">${k}</span></li>`;
      }).join("") + `</ul>`;
    }

    $("#view").innerHTML = `
      <div class="exam-top">
        <div>剩余时间 <span class="timer" id="examTimer">${fmtTime(E.remain)}</span></div>
        <div class="muted">共 ${E.qs.length} 题　未作答 <b class="num" id="leftCount">${left}</b> 题</div>
        <span class="spacer"></span>
        <button class="btn small" id="btnExamSubmit">交卷</button>
        <button class="btn small ghost" id="btnExamQuit">放弃本次</button>
      </div>
      <div class="exam-wrap">
        <div class="card">
          <div class="q-head">
            <span class="pill">${q.kind === "single" ? "单选题" : q.kind === "multi" ? "多选题" : q.kind === "judge" ? "判断题" : "填空题"}</span>
            <span class="pill gray">${esc(q.cat)}</span>
            <span class="spacer"></span>
            <span class="q-type">第 ${E.idx + 1} / ${E.qs.length} 题</span>
          </div>
          <div class="q-stem">${esc(q.stem)}</div>
          ${opts}
          <div class="q-foot">
            <button class="btn" id="btnPrev" ${E.idx === 0 ? "disabled" : ""}>← 上一题</button>
            <button class="btn primary" id="btnNext" ${E.idx >= E.qs.length - 1 ? "disabled" : ""}>下一题 →</button>
            <span class="spacer"></span>
            <span class="muted">快捷键：<span class="kbd">A~D</span> 选项　<span class="kbd">←</span><span class="kbd">→</span> 翻题</span>
          </div>
        </div>
        <div class="side">
          <div class="card">
            <h2>答题卡</h2>
            <div class="exam-sheet">${sheetHtml()}</div>
            <div class="legend">
              <span><i style="background:#e7f8ee;border:1px solid #b9e6cd"></i>已作答</span>
              <span><i style="background:#fff;border:1px solid #dde3ee"></i>未作答</span>
            </div>
          </div>
          <div class="card">
            <h2>试卷构成</h2>
            <div class="muted">单选 ${E.paper.single} 题 · 多选 ${E.paper.multi} 题 · 判断 ${E.paper.judge} 题<br>限时 ${E.paper.minutes} 分钟，满分 100 分</div>
          </div>
        </div>
      </div>`;
    bind();
  }

  function bind() {
    const view = $("#view");
    view.querySelectorAll(".opt").forEach((li) => { li.onclick = () => choose(li.dataset.key); });
    const bi = $("#blankInput");
    if (bi) {
      bi.oninput = () => inputBlank(bi.value);
      bi.onfocus = () => bi.select();
    }
    view.querySelectorAll("[data-jump]").forEach((b) => { b.onclick = () => goto(parseInt(b.dataset.jump, 10)); });
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnPrev", () => goto(E.idx - 1));
    on("btnNext", () => goto(E.idx + 1));
    on("btnExamSubmit", () => submitPaper(false));
    on("btnExamQuit", () => {
      window.Core.modal({
        title: "放弃本次考试",
        body: "<p>放弃后本次作答不会计入成绩，错题也不会进入错题本。</p>",
        buttons: [{ text: "继续答题" }, {
          text: "放弃", cls: "danger", onClick: () => {
            clearTimeout(E.timer);
            state.examSession = null; save();
            E.finished = true; E.result = null;
            window.App.go("exam");
          }
        }],
      });
    });
  }

  /* 首页/结果页的“开始考试”卡片与历史 */
  function renderStart() {
    const p = state.prefs;
    const hist = state.history.slice(0, 10);
    $("#view").innerHTML = `
      <div class="card">
        <h2>模拟考试</h2>
        <p class="muted">按竞赛理论考试形式组卷：80 题 / 60 分钟，其中单选 40 题、多选 20 题、判断 20 题，满分 100 分。多选题少选按比例给分、错选不得分（可在设置中改为严格判分）。</p>
        <div class="grid c4" style="margin:16px 0">
          <div><div class="muted">单选题</div><div style="font-size:22px;font-weight:700" id="cfgSingle">${p.examSingle}</div><input type="number" min="1" max="200" value="${p.examSingle}" data-cfg="examSingle" style="width:80px"></div>
          <div><div class="muted">多选题</div><div style="font-size:22px;font-weight:700" id="cfgMulti">${p.examMulti}</div><input type="number" min="1" max="200" value="${p.examMulti}" data-cfg="examMulti" style="width:80px"></div>
          <div><div class="muted">判断题</div><div style="font-size:22px;font-weight:700" id="cfgJudge">${p.examJudge}</div><input type="number" min="1" max="200" value="${p.examJudge}" data-cfg="examJudge" style="width:80px"></div>
          <div><div class="muted">时长（分钟）</div><div style="font-size:22px;font-weight:700" id="cfgMin">${p.examMinutes}</div><input type="number" min="5" max="300" value="${p.examMinutes}" data-cfg="examMinutes" style="width:80px"></div>
        </div>
        <div class="btn-row">
          <button class="btn primary" id="btnStartExam">开始考试</button>
          <button class="btn" id="btnResumeExam" ${state.examSession ? "" : "disabled"}>继续上次未完成的考试</button>
          <span class="muted">修改上方数字即可自定义试卷（默认即 40/20/20、60 分钟）</span>
        </div>
      </div>
      <div class="card">
        <h2>考试记录</h2>
        ${hist.length ? `<table class="tbl"><thead><tr><th>时间</th><th>得分</th><th>对/错/未答</th><th>用时</th><th>试卷</th></tr></thead><tbody>
          ${hist.map((h) => { const pa = repaper(h); return `<tr><td>${fmtDate(h.at)}</td>
            <td><b style="font-size:16px;color:${h.score >= 80 ? "var(--ok)" : h.score >= 60 ? "var(--warn)" : "var(--bad)"}">${h.score}</b></td>
            <td class="num">${h.right} / ${h.wrong} / ${h.empty}</td>
            <td class="num">${fmtTime(h.usedSec)}</td>
            <td class="muted">单选${pa.single}+多选${pa.multi}+判断${pa.judge}${h.auto ? "（超时自动交卷）" : ""}</td></tr>`; }).join("")}
        </tbody></table>` : `<div class="empty">还没有考试记录，先来一场模拟考试吧</div>`}
      </div>`;
    bindStart();
    tick(false);
  }

  function bindStart() {
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    document.querySelectorAll("[data-cfg]").forEach((inp) => {
      inp.onchange = () => {
        const v = Math.max(1, parseInt(inp.value, 10) || 1);
        state.prefs[inp.dataset.cfg] = v; save();
        const map = { examSingle: "cfgSingle", examMulti: "cfgMulti", examJudge: "cfgJudge", examMinutes: "cfgMin" };
        const el = $("#" + map[inp.dataset.cfg]);
        if (el) el.textContent = v;
      };
    });
    on("btnStartExam", () => {
      const p = state.prefs;
      const total = p.examSingle + p.examMulti + p.examJudge;
      if (total < 5) { window.Core.toast("题量太小了"); return; }
      if (state.examSession) {
        window.Core.modal({
          title: "已有未完成的考试",
          body: "<p>继续上次考试，还是重新开考？</p>",
          buttons: [{ text: "继续上次", onClick: () => { if (resume()) { window.App.go("exam"); tick(false); } else window.Core.toast("上次考试已超时"); } },
                     { text: "重新开考", cls: "primary", onClick: () => start({ single: p.examSingle, multi: p.examMulti, judge: p.examJudge, minutes: p.examMinutes }) }],
        });
        return;
      }
      start({ single: p.examSingle, multi: p.examMulti, judge: p.examJudge, minutes: p.examMinutes });
    });
    on("btnResumeExam", () => {
      if (resume()) { window.App.go("exam"); tick(false); }
      else window.Core.toast("上次考试已超时或不存在");
    });
  }

  function renderResult() {
    const { rec, details } = E.result;
    const wrongList = details.filter((d) => !d.ok && !(d.chosen == null || d.chosen === ""));
    const emptyList = details.filter((d) => d.chosen == null || d.chosen === "");
    $("#view").innerHTML = `
      <div class="card" style="text-align:center">
        <div class="muted">本次模拟考试得分</div>
        <div class="score-big" style="color:${rec.score >= 80 ? "var(--ok)" : rec.score >= 60 ? "var(--warn)" : "var(--bad)"}">${rec.score}</div>
        <div class="muted">满分 100 分　用时 ${fmtTime(rec.usedSec)}${rec.auto ? "（超时自动交卷）" : ""}</div>
        <div class="grid c4" style="margin-top:18px;text-align:left">
          <div class="card" style="margin:0"><div class="muted">答对</div><div style="font-size:24px;font-weight:700;color:var(--ok)">${rec.right}</div></div>
          <div class="card" style="margin:0"><div class="muted">答错</div><div style="font-size:24px;font-weight:700;color:var(--bad)">${rec.wrong}</div></div>
          <div class="card" style="margin:0"><div class="muted">未作答</div><div style="font-size:24px;font-weight:700">${rec.empty}</div></div>
          <div class="card" style="margin:0"><div class="muted">总题数</div><div style="font-size:24px;font-weight:700">${rec.total}</div></div>
        </div>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          <button class="btn primary" id="btnAgain">再考一场</button>
          <button class="btn" id="btnReviewAll">逐题看解析</button>
        </div>
      </div>
      <div class="card">
        <h2>逐题回顾</h2>
        ${E.qs.map((q, i) => {
          const d = details[i];
          const rightTxt = q.kind === "judge" ? q.answer : (q.kind === "blank" ? q.answer : q.answer.split("").join(" "));
          const mine = d.chosen == null || d.chosen === "" ? "（未作答）" : (q.kind === "judge" || q.kind === "blank" ? d.chosen : d.chosen.split("").join(" "));
          return `<div class="result ${d.ok ? "ok" : "bad"}" style="margin-bottom:12px">
            <div class="r-title">${i + 1}. ${d.ok ? "✓ 正确" : "✗ 错误"}　正确答案：${esc(rightTxt)}　你的答案：${esc(mine)}
              <span class="muted" style="font-weight:400">· ${esc(q.cat)} · ${esc(q.type)}</span></div>
            <div style="white-space:pre-wrap;margin-bottom:8px">${esc(q.stem)}</div>
            ${q.options && q.options.length ? `<div class="muted">${q.options.map((o) => `${o.key}. ${esc(o.text)}`).join("　")}</div>` : ""}
            <div class="exp-block">
              <h4>为什么选它</h4><p>${esc(q.correctReason || q.analysis || "")}</p>
              ${q.wrongReason ? `<h4>其他选项为什么不对</h4><p>${esc(q.wrongReason)}</p>` : ""}
              ${q.analysis ? `<h4>解析</h4><p>${esc(q.analysis)}</p>` : ""}
              <h4>依据 / 考点</h4><p>${esc(q.source || "—")}　${esc(q.keyPoint || "")}</p>
            </div></div>`;
        }).join("")}
      </div>`;
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
    on("btnAgain", () => { E.result = null; start({ single: state.prefs.examSingle, multi: state.prefs.examMulti, judge: state.prefs.examJudge, minutes: state.prefs.examMinutes }); });
    on("btnReviewAll", () => { window.Practice.buildList({ force: true, filter: {} }); window.App.go("practice"); });
  }

  function onKey(e) {
    if (window.App.view !== "exam" || E.finished) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if ($("#modalMask").hidden === false) return;
    const q = current();
    if (!q) return;
    const k = e.key.toUpperCase();
    if (["A", "B", "C", "D"].indexOf(k) >= 0) { e.preventDefault(); choose(k); return; }
    if (q.kind === "judge" && (k === "1" || k === "2")) { e.preventDefault(); choose(k === "1" ? "对" : "错"); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); goto(E.idx + 1); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); goto(E.idx - 1); return; }
  }

  window.Exam = { render, renderStart, renderResult, start, resume, onKey, submitPaper, get finished() { return E.finished; } };
})();
