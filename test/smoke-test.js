/* Headless smoke test: minimal DOM stub (test/harness.js) + real app logic */
const harness = require("./harness.js");
const { sandbox, document, Core } = harness.load();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  [PASS]", name); }
  else { fail++; console.log("  [FAIL]", name, extra === undefined ? "" : JSON.stringify(extra)); }
}

console.log("=== 1. Data integrity ===");
ok("bank 1049 questions", sandbox.BANK.length === 1049, sandbox.BANK.length);
ok("12 practical challenges", sandbox.PRACTICAL.length === 12, sandbox.PRACTICAL.length);
ok("no duplicate ids", new Set(sandbox.BANK.map((q) => q.id)).size === sandbox.BANK.length);
ok("every question has answer", sandbox.BANK.every((q) => q.answer && q.answer.length));
ok("every question has analysis", sandbox.BANK.every((q) => (q.analysis || "").length > 20));
ok("choice questions have 4 options", sandbox.BANK.filter((q) => q.kind === "single" || q.kind === "multi").every((q) => q.options.length === 4));
ok("answer letters exist in options", sandbox.BANK.filter((q) => q.kind === "single" || q.kind === "multi")
  .every((q) => q.answer.split("").every((c) => q.options.some((o) => o.key === c)) || q.type.indexOf("连线") >= 0));
ok("practical items have steps", sandbox.PRACTICAL.every((p) => (p.idea || []).length >= 2));

console.log("\n=== 2. Grading ===");
const q = (kind, answer) => ({ id: "t", kind, answer, options: [{ key: "A" }, { key: "B" }, { key: "C" }, { key: "D" }] });
ok("single correct", Core.grade(q("single", "B"), "B").ok === true);
ok("single wrong", Core.grade(q("single", "B"), "C").score === 0);
ok("multi exact", Core.grade(q("multi", "ABC"), "CBA").ok === true);
ok("multi partial credit", (function () { const g = Core.grade(q("multi", "ABC"), "AB"); return !g.ok && Math.abs(g.score - 2 / 3) < 1e-9; })());
ok("multi wrong pick = 0", Core.grade(q("multi", "ABC"), "ABD").score === 0);
ok("judge correct/wrong", Core.grade(q("judge", "\u5bf9"), "\u5bf9").ok && !Core.grade(q("judge", "\u9519"), "\u5bf9").ok);
ok("blank tolerant", [" 128 ", "128\u6bd4\u7279", "\u5341\u516d", "sm4"].every((v, i) =>
  Core.grade(q("blank", ["128", "128", "16", "SM4"][i]), v).ok));
ok("blank wrong rejected", Core.grade(q("blank", "16"), "32").ok === false);
ok("strict mode partial = 0", (function () { Core.state.prefs.partial = false; const r = Core.grade(q("multi", "ABC"), "AB").score; Core.state.prefs.partial = true; return r === 0; })());

console.log("\n=== 3. Filter / wrong book / favorites ===");
ok("all questions", Core.filterQuestions({}).length === 1049);
ok("cryptography 395", Core.filterQuestions({ part: "\u7b2c\u4e8c\u90e8\u5206\u4e13\u4e1a\u9898", cat: "\u4e00\u3001\u5bc6\u7801\u5b66" }).length === 395);
ok("blank type 30", Core.filterQuestions({ type: "\u586b\u7a7a\u9898" }).length === 30);
ok("matching type 4", Core.filterQuestions({ type: "\u8fde\u7ebf\u9898" }).length === 4);
const first = sandbox.BANK[0];
Core.record(first, false);
ok("wrong goes to book", Core.filterQuestions({ onlyWrong: true }).length === 1);
Core.record(first, true);
ok("stays until removed", Core.filterQuestions({ onlyWrong: true }).length === 1);
Core.removeWrong(first.id);
ok("manual remove", Core.filterQuestions({ onlyWrong: true }).length === 0);
ok("favorite toggle", (function () { Core.toggleFav(first.id); const a = Core.filterQuestions({ onlyFav: true }).length; Core.toggleFav(first.id); return a === 1 && Core.filterQuestions({ onlyFav: true }).length === 0; })());

console.log("\n=== 4. Exam paper (80 q / 60 min) ===");
sandbox.Exam.start({ single: 40, multi: 20, judge: 20, minutes: 60 });
const es = Core.state.examSession;
ok("session saved", !!es);
if (es) {
  ok("80 questions", es.ids.length === 80, es.ids.length);
  const kinds = { single: 0, multi: 0, judge: 0 };
  es.ids.forEach((id) => { kinds[Core.byId[id].kind]++; });
  ok("composition 40/20/20", kinds.single === 40 && kinds.multi === 20 && kinds.judge === 20, kinds);
  ok("no duplicates", new Set(es.ids).size === 80);
  ok("60 minutes limit", Math.round((es.endAt - Date.now()) / 60000) === 60);
  ok("persisted to localStorage", !!sandbox.__store["mmsj.v1"]);
}

console.log("\n=== 5. View rendering ===");
["home", "practice", "exam", "wrong", "fav", "practical", "stats"].forEach((v) => {
  try {
    sandbox.App.go(v);
    const html = document.getElementById("view").innerHTML;
    ok("render " + v, html.length > 200, html.length);
  } catch (e) {
    ok("render " + v, false, e.message);
  }
});

console.log("\n=== 6. Practice interaction ===");
try {
  sandbox.Practice.buildList({ force: true, filter: { part: "\u7b2c\u4e00\u90e8\u5206\u57fa\u7840\u9898", cat: "\u4e00\u3001\u5bc6\u7801\u6cd5\u5f8b\u6cd5\u89c4", type: "\u5224\u65ad\u9898" } });
  sandbox.App.go("practice");
  sandbox.Practice.choose("\u5bf9");
  ok("answer recorded", Object.keys(Core.state.stats).length >= 1);
  sandbox.Practice.next();
  ok("next question", sandbox.Practice.idx === 1);
  sandbox.Practice.prev();
  ok("previous question", sandbox.Practice.idx === 0);
} catch (e) { ok("practice interaction", false, e.message); }

console.log("\n=== 7. Export / reset / import ===");
try {
  const dump = Core.exportData();
  ok("export has stats", Object.keys(JSON.parse(dump).stats).length > 0);
  Core.resetAll();
  ok("reset clears stats", Object.keys(Core.state.stats).length === 0);
  Core.importData(dump);
  ok("import restores", Object.keys(Core.state.stats).length > 0);
} catch (e) { ok("export/import", false, e.message); }

console.log("\n=== 8. Submit paper ===");
try {
  sandbox.Exam.start({ single: 5, multi: 3, judge: 2, minutes: 10 });
  const s2 = Core.state.examSession;
  ok("start creates session", !!s2);
  if (!s2) throw new Error("no session after Exam.start");
  s2.ids.forEach((id) => { s2.answers[id] = Core.byId[id].answer; });
  sandbox.Exam.submitPaper(true);
  ok("all correct = 100", Core.state.history[0].score === 100, Core.state.history[0].score);
  ok("session cleared after submit", Core.state.examSession === null);
  sandbox.App.go("examResult");
  ok("result view renders", document.getElementById("view").innerHTML.length > 500);
  sandbox.Exam.start({ single: 4, multi: 2, judge: 2, minutes: 10 });
  const s3 = Core.state.examSession;
  s3.ids.forEach((id) => {
    const qq = Core.byId[id];
    s3.answers[id] = qq.kind === "judge" ? (qq.answer === "\u5bf9" ? "\u9519" : "\u5bf9")
      : qq.kind === "multi" ? (qq.answer === "ABCD" ? "A" : "ABCD")
        : (qq.options.find((o) => o.key !== qq.answer) || {}).key;
  });
  sandbox.Exam.submitPaper(true);
  // 多选题按比例给分，全错也可能因“少选”拿到极少分值，故只断言低分且全部判错
  ok("all wrong scores low", Core.state.history[0].score <= 15 && Core.state.history[0].right === 0,
    { score: Core.state.history[0].score, right: Core.state.history[0].right });
  ok("wrong answers recorded", Object.keys(Core.state.wrong).length >= 8, Object.keys(Core.state.wrong).length);
} catch (e) { ok("submit paper", false, e.message); }

console.log("\n===== RESULT: pass " + pass + ", fail " + fail + " =====");
process.exit(fail ? 1 : 0);
