/* 单文件版自检：把内联脚本抽出来在最小 DOM 里跑一遍 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const harnessPath = path.join(__dirname, "harness.js");

const file = path.join(__dirname, "..", "密码竞赛刷题-单文件版.html");
const html = fs.readFileSync(file, "utf8");

/* 抽出 <script>…</script> 里的内联代码（跳过 src 引用） */
const blocks = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) blocks.push(m[1]);
console.log("内联脚本块数:", blocks.length);
console.log("样式内联:", /<style>[\s\S]*<\/style>/.test(html));
console.log("还有外链 script/link:", /<script[^>]*\bsrc=/.test(html) || /<link[^>]*stylesheet/.test(html));

/* 复用 harness 的 DOM 桩，但只跑单文件里的代码 */
const src = fs.readFileSync(harnessPath, "utf8");
const mod = { exports: {} };
new Function("module", "exports", "require", "__dirname", src)(mod, mod.exports, require, __dirname);
const { El } = mod.exports;

/* 手工构造最小环境（与 harness 相同思路） */
const registry = {};
const mk = (id) => (registry[id] = new El("div"));
["#toast", "#modalMask", "#modalTitle", "#modalBody", "#modalFoot", "#modalClose", "#view",
 "#tabs", "#brandHome", "#btnSettings", "#btnHelp", "#examTimer"].forEach(mk);
registry["#toast"].hidden = true;
registry["#modalMask"].hidden = true;

const document = {
  readyState: "complete",
  documentElement: { style: {} },
  activeElement: { tagName: "BODY" },
  body: new El("body"),
  createElement: (t) => new El(t),
  getElementById: (id) => registry["#" + id] || null,
  querySelector: (sel) => registry[sel] || (registry[sel] = new El("div")),
  querySelectorAll: () => [],
  addEventListener: () => {},
};
const store = {};
const sandbox = {
  console, document, window: {}, __store: store,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat, Promise,
  Blob: function () {}, URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  FileReader: function () {}, scrollTo: () => {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log("  [PASS]", n); } else { fail++; console.log("  [FAIL]", n, e === undefined ? "" : e); } };

try {
  blocks.forEach((code, i) => vm.runInContext(code, sandbox, { filename: "inline-" + i }));
  ok("内联脚本全部执行", true);
} catch (e) {
  ok("内联脚本全部执行", false, e.message);
}

ok("题库已内联（1049 题）", sandbox.BANK && sandbox.BANK.length === 1049, sandbox.BANK && sandbox.BANK.length);
ok("实操题已内联（12 道）", sandbox.PRACTICAL && sandbox.PRACTICAL.length === 12);
try {
  sandbox.App.go("home");
  ok("首页渲染", document.getElementById("view").innerHTML.length > 500);
  sandbox.Exam.start({ single: 40, multi: 20, judge: 20, minutes: 60 });
  ok("考试组卷 80 题", sandbox.Core.state.examSession.ids.length === 80);
  sandbox.App.go("practice");
  ok("刷题页渲染", document.getElementById("view").innerHTML.length > 500);
  sandbox.App.go("practical");
  ok("实操页渲染", document.getElementById("view").innerHTML.length > 500);
} catch (e) {
  ok("交互", false, e.message);
}

console.log("\n===== 单文件版自检：pass " + pass + "，fail " + fail + " =====");
process.exit(fail ? 1 : 0);
