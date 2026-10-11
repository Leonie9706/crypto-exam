/* ============ 核心：工具 / 存储 / 判分 ============ */
(function () {
  "use strict";

  const KEY = "mmsj.v1";

  const DEFAULT_STATE = {
    prefs: {
      instant: true,          // 刷题即时显示对错
      autoNext: false,        // 答对后自动下一题
      shuffle: false,         // 打乱顺序
      partial: true,          // 多选按比例给分
      examSingle: 40, examMulti: 20, examJudge: 20, examMinutes: 60,
      examShuffle: true,
    },
    stats: {},      // id -> {r:答题次数, w:错次, last:时间戳, lastOk:bool}
    wrong: {},      // id -> {t:加入时间, n:错次}
    fav: {},        // id -> 1
    history: [],    // 考试记录
    session: null,  // 刷题进度
    examSession: null,
  };

  let state = null;

  function normalize(raw) {
    const base = JSON.parse(JSON.stringify(DEFAULT_STATE));
    const s = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
    const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    const plain = (v) => (isObj(v) ? v : {});
    return {
      prefs: Object.assign(base.prefs, plain(s.prefs)),
      stats: plain(s.stats),
      wrong: plain(s.wrong),
      fav: plain(s.fav),
      history: Array.isArray(s.history)
        ? s.history.filter((h) => isObj(h) && typeof h.at === "number")
            .map((h) => {
              const paper = isObj(h.paper) ? h.paper : null;
              return {
                at: h.at,
                usedSec: typeof h.usedSec === "number" && h.usedSec >= 0 ? h.usedSec : 0,
                paper, score: typeof h.score === "number" ? h.score : 0,
                right: h.right || 0, wrong: h.wrong || 0, empty: h.empty || 0,
                total: h.total || 0, auto: !!h.auto,
              };
            })
        : [],
      session: isObj(s.session) ? s.session : null,
      examSession: isObj(s.examSession) ? s.examSession : null,
    };
  }

  let storageOK = true;

  function load() {
    let raw = null;
    try {
      const text = window.localStorage ? window.localStorage.getItem(KEY) : null;
      raw = text ? JSON.parse(text) : null;
    } catch (e) {
      raw = null;   // 数据损坏或无权限：回退到默认值
      storageOK = false;
    }
    const fresh = normalize(raw);
    if (state) {
      // 保持对象引用不变：其它模块在加载时就持有 state 引用
      Object.keys(state).forEach((k) => { if (!(k in fresh)) delete state[k]; });
      Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
    } else {
      state = fresh;
    }
    return state;
  }

  /* 保存；返回 false 表示写入失败（容量满 / 隐私模式禁用存储） */
  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      storageOK = true;
      return true;
    } catch (e) {
      storageOK = false;
      return false;
    }
  }

  function storageAvailable() { return storageOK; }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 1800);
  }

  function modal(opts) {
    const mask = $("#modalMask");
    $("#modalTitle").textContent = opts.title || "提示";
    $("#modalBody").innerHTML = opts.body || "";
    const foot = $("#modalFoot");
    foot.innerHTML = "";
    (opts.buttons || [{ text: "关闭" }]).forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "btn " + (b.cls || "");
      btn.textContent = b.text;
      btn.onclick = () => { if (!b.onClick || b.onClick() !== false) closeModal(); };
      foot.appendChild(btn);
    });
    mask.hidden = false;
    if (opts.onOpen) opts.onOpen();
    return { close: closeModal };
  }
  function closeModal() { $("#modalMask").hidden = true; }

  /* ---------- 题库索引 ---------- */
  const bank = window.BANK || [];
  const byId = {};
  bank.forEach((q) => { byId[q.id] = q; });

  function normText(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[\s\u3000]/g, "")
      .replace(/[，。；：、．,;:.!！?？"'“”‘’（）()\[\]【】<>《》]/g, "");
  }
  const CN_NUM = { "零": "0", "一": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9", "十": "10" };

  function normJudge(s) {
    const t = normText(s);
    if (["对", "正确", "是", "√", "t", "true", "y", "yes", "1"].indexOf(t) >= 0) return "对";
    if (["错", "错误", "否", "×", "x", "f", "false", "n", "no", "0"].indexOf(t) >= 0) return "错";
    return t;
  }

  const UNIT_RE = /(比特|位|字节|个|轮|次|块|种|字|天|日|小时|工作日)/g;

  function blankEquivalent(input, answer) {
    const a = normText(answer);
    if (!a) return false;
    const b = normText(input);
    if (!b) return false;
    if (b === a) return true;

    const variants = new Set();
    variants.add(b.replace(UNIT_RE, ""));            // 去掉单位：128比特 -> 128
    variants.add(b.replace(/^第/, ""));               // 第16 -> 16
    variants.add(b.replace(/^[=＝]/, ""));
    // 中文数字 -> 阿拉伯数字
    if (/^[零一二两三四五六七八九十]+$/.test(b)) {
      let v = b.replace(/十([一二三四五六七八九])?/g, (m, d) => (d ? "1" + d : "10"));
      v = v.replace(/[零一二两三四五六七八九]/g, (c) => CN_NUM[c] || c);
      variants.add(v);
      const n = parseInt(v, 10);
      if (!isNaN(n)) variants.add(String(n));
    }
    for (const v of variants) {
      if (v && v === a) return true;
    }
    // 纯数值比较（仅当两者都是纯数字时）
    if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) return parseInt(a, 10) === parseInt(b, 10);
    return false;
  }

  function answerText(q) {
    if (q.kind === "judge") return q.answer;
    if (q.kind === "blank") return q.answer;
    return (q.answer || "").split("").join("");
  }

  /* 判分：返回 {ok, score(0~1), detail} */
  function grade(q, userAnswer) {
    if (userAnswer == null || userAnswer === "") return { ok: false, score: 0, empty: true };
    if (q.kind === "single") {
      const ok = String(userAnswer) === q.answer;
      return { ok, score: ok ? 1 : 0 };
    }
    if (q.kind === "multi") {
      const u = String(userAnswer).split("").sort().join("");
      const a = q.answer.split("").sort().join("");
      if (u === a) return { ok: true, score: 1 };
      const uSet = new Set(u.split("")), aSet = new Set(a.split(""));
      const wrongPick = [...uSet].some((c) => !aSet.has(c));
      if (wrongPick) return { ok: false, score: 0, partial: "多选错选不得分" };
      const right = [...uSet].filter((c) => aSet.has(c)).length;
      if (state.prefs.partial) {
        return { ok: false, score: right / aSet.size, partial: `少选，得 ${Math.round(right / aSet.size * 100)}% 分` };
      }
      return { ok: false, score: 0, partial: "少选不得分（当前为严格模式）" };
    }
    if (q.kind === "judge") {
      const ok = normJudge(userAnswer) === normJudge(q.answer);
      return { ok, score: ok ? 1 : 0 };
    }
    if (q.kind === "blank") {
      const ok = blankEquivalent(userAnswer, q.answer);
      return { ok, score: ok ? 1 : 0 };
    }
    return { ok: false, score: 0 };
  }

  /* 记录答题（刷题模式）：统计与错题本一次性更新，避免重复累加错次 */
  function trackAnswer(q, ok) {
    const s = state.stats[q.id] || (state.stats[q.id] = { r: 0, w: 0 });
    s.r += 1;
    s.last = Date.now();
    s.lastOk = !!ok;
    if (!ok) {
      s.w += 1;
      const w = state.wrong[q.id] || (state.wrong[q.id] = { t: Date.now(), n: 0 });
      w.n += 1;
      w.t = Date.now();
    }
    save();
  }

  /* 兼容旧调用：仅更新统计 */
  function record(q, ok) { trackAnswer(q, ok); }

  function addWrong(q) {
    const w = state.wrong[q.id] || (state.wrong[q.id] = { t: Date.now(), n: 0 });
    w.n += 1; w.t = Date.now();
    save();
  }
  function removeWrong(id) { delete state.wrong[id]; save(); }
  function toggleFav(id) {
    if (state.fav[id]) delete state.fav[id]; else state.fav[id] = 1;
    save();
    return !!state.fav[id];
  }

  function progressOf(questions) {
    let done = 0, right = 0, wrongFlag = 0;
    questions.forEach((q) => {
      const s = state.stats[q.id];
      if (s && s.r > 0) {
        done++;
        if (s.lastOk) right++; else wrongFlag++;
      }
    });
    return { total: questions.length, done, right, wrongFlag, rate: questions.length ? done / questions.length : 0 };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (h > 0 ? p(h) + ":" : "") + p(m) + ":" + p(s);
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function filterQuestions(opts) {
    opts = opts || {};
    let list = bank.slice();
    if (opts.part) list = list.filter((q) => q.part === opts.part);
    if (opts.cat) list = list.filter((q) => q.cat === opts.cat);
    if (opts.type) {
      if (opts.type === "单选题") list = list.filter((q) => q.kind === "single" && q.type !== "单选题（连线）");
      else if (opts.type === "连线题") list = list.filter((q) => q.type === "单选题（连线）");
      else if (opts.type === "多选题") list = list.filter((q) => q.kind === "multi");
      else if (opts.type === "判断题") list = list.filter((q) => q.kind === "judge");
      else if (opts.type === "填空题") list = list.filter((q) => q.kind === "blank");
      else list = list.filter((q) => q.type === opts.type);
    }
    if (opts.onlyWrong) list = list.filter((q) => state.wrong[q.id]);
    if (opts.onlyFav) list = list.filter((q) => state.fav[q.id]);
    if (opts.onlyNew) list = list.filter((q) => !state.stats[q.id] || !state.stats[q.id].r);
    return list;
  }

  function exportData() {
    return JSON.stringify({
      app: "密码竞赛刷题", version: 1, exportedAt: new Date().toISOString(),
      prefs: state.prefs, stats: state.stats, wrong: state.wrong, fav: state.fav, history: state.history,
    }, null, 1);
  }
  function importData(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== "object") throw new Error("文件内容无法识别");
    const fresh = normalize({
      prefs: Object.assign({}, state.prefs, d.prefs || {}),
      stats: d.stats || {},
      wrong: d.wrong || {},
      fav: d.fav || {},
      history: d.history || [],
      session: null,
      examSession: null,
    });
    Object.keys(state).forEach((k) => { delete state[k]; });
    Object.assign(state, fresh);
    save();
  }
  function resetAll() {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    Object.keys(state).forEach((k) => { delete state[k]; });
    Object.assign(state, fresh);
    save();
  }

  window.Core = {
    KEY, DEFAULT_STATE,
    get state() { return state; },
    load, save, storageAvailable, $, $$, esc, toast, modal, closeModal,
    bank, byId, grade, answerText, normJudge, blankEquivalent,
    trackAnswer, record, addWrong, removeWrong, toggleFav, progressOf,
    shuffle, fmtTime, fmtDate, filterQuestions, exportData, importData, resetAll,
  };

  /* 立即载入本地记录：其它模块在加载时就会读取 state，必须先初始化 */
  load();
})();
