/* ============ 应用入口：路由 / 设置 / 帮助 ============ */
(function () {
  "use strict";
  const { $, $$, esc, state, save } = window.Core;

  const App = { view: "home" };

  const VIEWS = {
    home: () => window.Pages.renderHome(),
    practice: () => window.Practice.render(),
    exam: () => { if (window.Exam.finished || (state.examSession && Date.now() < state.examSession.endAt)) window.Exam.render(); else window.Exam.renderStart(); },
    wrong: () => window.Pages.renderWrong(),
    fav: () => window.Pages.renderFav(),
    practical: () => window.Pages.renderPractical(),
    stats: () => window.Pages.renderStats(),
    examResult: () => window.Exam.renderResult(),
  };

  App.go = function (view) {
    App.view = view;
    $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    (VIEWS[view] || VIEWS.home)();
    window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  };

  /* 当前视图重绘（刷题/考试内部状态变化时调用） */
  App.renderCurrent = function () {
    (VIEWS[App.view] || VIEWS.home)();
  };

  App.downloadText = function (text, filename) {
    const blob = new Blob(["\ufeff" + text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  App.showQuestionModal = function (q) {
    if (!q) return;
    const rightTxt = q.kind === "judge" ? q.answer : (q.kind === "blank" ? q.answer : q.answer.split("").join(" "));
    const opts = q.options && q.options.length
      ? `<ul class="opts">${q.options.map((o) => `<li class="opt ${q.answer.indexOf(o.key) >= 0 ? "correct" : ""} locked"><span class="key">${o.key}</span><span class="txt">${esc(o.text)}</span></li>`).join("")}</ul>`
      : "";
    window.Core.modal({
      title: `${q.cat} · ${q.type} · 第 ${q.no} 题`,
      body: `<div class="q-stem">${esc(q.stem)}</div>
        ${q.pairs && q.pairs.length ? `<table class="match-table">${q.pairs.map((p) => { const a = p.split("——"); return `<tr><td>${esc(a[0])}</td><td>${esc(a[1] || "")}</td></tr>`; }).join("")}</table>` : ""}
        ${opts}
        <div class="result ok" style="margin-top:14px">
          <div class="r-title">正确答案：${esc(rightTxt)}</div>
          <div class="exp-block">
            <h4>为什么选它</h4><p>${esc(q.correctReason || q.analysis || "")}</p>
            ${q.wrongReason ? `<h4>其他选项为什么不对</h4><p>${esc(q.wrongReason)}</p>` : ""}
            ${q.analysis ? `<h4>解析</h4><p>${esc(q.analysis)}</p>` : ""}
            <h4>依据</h4><p>${esc(q.source || "—")}</p>
            <h4>考点</h4><p>${esc(q.keyPoint || "—")}</p>
            ${q.conflict ? `<p class="muted">⚠ ${esc(q.conflict)}</p>` : ""}
            ${q.note ? `<p class="muted">※ ${esc(q.note)}</p>` : ""}
          </div>
        </div>`,
      buttons: [{ text: "关闭" }],
    });
  };

  /* ---------------- 设置 ---------------- */
  function openSettings() {
    const p = state.prefs;
    window.Core.modal({
      title: "设置",
      body: `
        <div class="setting-row"><label>答完立即显示对错<span class="tip">关闭后需要自己点「提交答案」才判分</span></label>
          <input type="checkbox" id="setInstant" ${p.instant ? "checked" : ""}></div>
        <div class="setting-row"><label>答对后自动跳下一题<span class="tip">适合快速刷题</span></label>
          <input type="checkbox" id="setAutoNext" ${p.autoNext ? "checked" : ""}></div>
        <div class="setting-row"><label>刷题时打乱顺序</label>
          <input type="checkbox" id="setShuffle" ${p.shuffle ? "checked" : ""}></div>
        <div class="setting-row"><label>多选题少选按比例给分<span class="tip">关闭＝严格判分：少选也不得分</span></label>
          <input type="checkbox" id="setPartial" ${p.partial ? "checked" : ""}></div>
        <div class="setting-row"><label>考试题目乱序</label>
          <input type="checkbox" id="setExamShuffle" ${p.examShuffle ? "checked" : ""}></div>
        <div class="setting-row"><label>模拟考试默认题量与时长<span class="tip">在「模拟考试」页也可临时修改</span></label>
          <span>单选 <input type="number" id="setES" value="${p.examSingle}" style="width:64px">
                多选 <input type="number" id="setEM" value="${p.examMulti}" style="width:64px">
                判断 <input type="number" id="setEJ" value="${p.examJudge}" style="width:64px">
                <input type="number" id="setMin" value="${p.examMinutes}" style="width:64px"> 分钟</span></div>`,
      buttons: [
        { text: "取消" },
        {
          text: "保存设置", cls: "primary", onClick: () => {
            p.instant = $("#setInstant").checked;
            p.autoNext = $("#setAutoNext").checked;
            p.shuffle = $("#setShuffle").checked;
            p.partial = $("#setPartial").checked;
            p.examShuffle = $("#setExamShuffle").checked;
            p.examSingle = Math.max(1, parseInt($("#setES").value, 10) || 40);
            p.examMulti = Math.max(1, parseInt($("#setEM").value, 10) || 20);
            p.examJudge = Math.max(1, parseInt($("#setEJ").value, 10) || 20);
            p.examMinutes = Math.max(5, parseInt($("#setMin").value, 10) || 60);
            save();
            window.Core.toast("设置已保存");
            App.go(App.view);
          }
        },
      ],
    });
  }

  /* ---------------- 帮助 ---------------- */
  function openHelp() {
    window.Core.modal({
      title: "使用说明",
      body: `
        <h3 style="font-size:15px;margin-bottom:6px">刷题</h3>
        <p style="margin:0 0 10px">左侧选章节/题型 → 中间答题。单选、判断点选项即判分；多选先点多个选项再点「提交答案」；填空题输入后回车。答完立刻显示「为什么选它 / 其他选项为什么不对 / 依据 / 考点」。右侧是进度与答题卡，可点击题号跳转。</p>
        <h3 style="font-size:15px;margin-bottom:6px">模拟考试</h3>
        <p style="margin:0 0 10px">默认 80 题（单选 40 + 多选 20 + 判断 20）、60 分钟、满分 100 分，题目从全题库随机抽取（优先没做过的题）。考试中不显示对错，交卷后统一评分并逐题给解析；错题自动进错题本。中途关掉浏览器可「继续上次未完成的考试」，时间到自动交卷。</p>
        <h3 style="font-size:15px;margin-bottom:6px">错题本 / 收藏</h3>
        <p style="margin:0 0 10px">做错的题自动进错题本，支持「重做全部错题」、查看解析、手动移除、导出清单；收藏用于标记需要反复看的题。</p>
        <h3 style="font-size:15px;margin-bottom:6px">实操题</h3>
        <p style="margin:0 0 10px">第三部分 12 道实操题（密码算法、逆向、流量分析、编码转换等），含题干、思路、参考脚本与 flag。</p>
        <h3 style="font-size:15px;margin-bottom:6px">快捷键</h3>
        <p style="margin:0 0 10px"><span class="kbd">A</span>~<span class="kbd">D</span> 选选项　<span class="kbd">Enter</span> 提交 / 下一题　<span class="kbd">←</span> <span class="kbd">→</span> 翻题　<span class="kbd">F</span> 收藏（刷题时）</p>
        <h3 style="font-size:15px;margin-bottom:6px">数据与备份</h3>
        <p style="margin:0">记录存在本机浏览器，不上传网络。到「统计」页可导出/导入学习记录；清理浏览器数据会丢失记录，建议定期导出备份。</p>
        <h3 style="font-size:15px;margin:10px 0 6px">题库说明</h3>
        <p style="margin:0">题目来自《附件3：2026年江苏省密码行业职业技能竞赛题库》（理论 1049 题 + 实操 12 题），全部题目与答案均按原卷录入。个别题目原卷本身存在题型与答案不一致或排版粘连，程序按原卷保留并在题目下方标注提示。</p>`,
      buttons: [{ text: "知道了", cls: "primary" }],
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    /* 注意：Core 已在 core.js 加载时完成 load()，这里不能再次 load，否则会替换 state 对象，
       导致其它模块（practice/exam）持有的引用失效。 */
    if (!window.BANK || !window.BANK.length) {
      $("#view").innerHTML = `<div class="card"><div class="empty">题库数据未加载：请确认 data/bank.js 与 index.html 在同一目录结构中。</div></div>`;
      return;
    }
    $$("#tabs button").forEach((b) => { b.onclick = () => App.go(b.dataset.view); });
    $("#brandHome").onclick = () => App.go("home");
    $("#btnSettings").onclick = openSettings;
    $("#btnHelp").onclick = openHelp;
    $("#modalClose").onclick = window.Core.closeModal;
    $("#modalMask").onclick = (e) => { if (e.target.id === "modalMask") window.Core.closeModal(); };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { window.Core.closeModal(); return; }
      window.Practice.onKey(e);
      window.Exam.onKey(e);
    });
    App.go("home");
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();
})();
