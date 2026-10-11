/* 静态检查：找出各模块里"用了但没定义/没解构"的标识符（针对本项目已知的全局集合） */
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
const files = ["js/core.js", "js/practice.js", "js/exam.js", "js/pages.js", "js/app.js"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* 每个模块顶部从 window.Core 解构出来的名字 */
function destructured(src) {
  const names = new Set();
  const re = /const\s*\{([^}]+)\}\s*=\s*window\.Core/g;
  let m;
  while ((m = re.exec(src))) {
    m[1].split(",").forEach((x) => {
      const n = x.trim().split(":")[0].trim();
      if (n) names.add(n);
    });
  }
  return names;
}

/* 项目里的全局/内置名 */
const GLOBALS = new Set([
  "window", "document", "console", "Math", "Date", "JSON", "Object", "Array", "String", "Number",
  "Boolean", "RegExp", "Error", "Set", "Map", "Promise", "isNaN", "parseInt", "parseFloat", "isFinite",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "localStorage", "Blob", "URL",
  "FileReader", "Event", "undefined", "null", "true", "false", "this", "arguments",
  "Core", "Practice", "Exam", "Pages", "App",
]);

/* 模块内自身定义的名字（function xxx / const xxx / let xxx / var xxx / 参数） */
function definedNames(src) {
  const names = new Set();
  const res = [
    /function\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:const|let|var)\s*\{([^}]+)\}/g,
    /(?:const|let|var)\s*\[([^\]]+)\]/g,
  ];
  let m;
  while ((m = res[0].exec(src))) names.add(m[1]);
  while ((m = res[1].exec(src))) names.add(m[1]);
  while ((m = res[2].exec(src))) m[1].split(",").forEach((x) => names.add(x.trim().split(":")[0].trim().split("=")[0].trim()));
  while ((m = res[3].exec(src))) m[1].split(",").forEach((x) => names.add(x.trim().split("=")[0].trim()));
  // 函数参数
  const params = src.match(/\(([^)]*)\)\s*(?:=>|\{)/g) || [];
  params.forEach((p) => {
    p.replace(/^\(|\)\s*(?:=>|\{)$/g, "").split(",").forEach((x) => {
      const n = x.trim().split("=")[0].trim().replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    });
  });
  return names;
}

let problems = 0;
files.forEach((f) => {
  const raw = fs.readFileSync(path.join(APP, f), "utf8");
  const src = stripComments(raw);
  const fromCore = destructured(src);
  const defined = new Set([...definedNames(src), ...fromCore, ...GLOBALS]);
  /* 找出裸调用：xxx(...) */
  const calls = new Set();
  let m;
  const callRe = /(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g;
  while ((m = callRe.exec(src))) calls.add(m[2]);
  /* 关键字级的内置函数调用白名单 */
  const builtinCalls = new Set(["if", "for", "while", "switch", "catch", "return", "typeof",
    "function", "new", "else", "do", "var", "let", "const"]);
  const missing = [...calls].filter((c) => {
    if (defined.has(c) || builtinCalls.has(c) || /^[A-Z]/.test(c)) return false;
    // 排除对象字面量里的简写方法 / getter：  name(  ...  或  get name(
    if (new RegExp("(?:get|set)\\s+" + c + "\\s*\\(").test(src)) return false;
    if (new RegExp("[{,;\\s]" + c + "\\s*\\([^)]*\\)\\s*\\{").test(src)) return false;
    return true;
  });
  if (missing.length) {
    problems += missing.length;
    console.log(`[${f}] 可能未定义的调用: ${missing.join(", ")}`);
  } else {
    console.log(`[${f}] OK（解构自 Core: ${[...fromCore].join(", ")}）`);
  }
});

/* 额外检查：window.Core.xxx 是否存在 */
const coreSrc = fs.readFileSync(path.join(APP, "js/core.js"), "utf8");
const exported = new Set();
const exp = coreSrc.match(/window\.Core\s*=\s*\{([\s\S]*?)\n\s*\};/);
if (exp) {
  exp[1].split(/[,\n]/).forEach((x) => {
    const t = x.trim();
    if (!t || t.startsWith("//")) return;
    const n = t.split(":")[0].replace(/get\s+/, "").trim();
    if (/^[A-Za-z_$][\w$]*$/.test(n)) exported.add(n);
  });
}
console.log("\nCore 导出:", [...exported].join(", "));
files.forEach((f) => {
  const src = fs.readFileSync(path.join(APP, f), "utf8");
  const used = new Set();
  let m;
  const re = /window\.Core\.([A-Za-z_$][\w$]*)/g;
  while ((m = re.exec(src))) used.add(m[1]);
  const bad = [...used].filter((x) => !exported.has(x));
  if (bad.length) { problems += bad.length; console.log(`[${f}] window.Core.${bad.join(", window.Core.")} 不存在！`); }
});

console.log(problems ? `\n发现 ${problems} 处可疑引用` : "\n未发现未定义引用");
process.exit(problems ? 1 : 0);
