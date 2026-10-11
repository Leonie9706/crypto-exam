/* 鏈€灏?DOM 妗?+ 鍔犺浇搴旂敤鑴氭湰锛堜緵澶氫釜娴嬭瘯澶嶇敤锛?*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.join(__dirname, "..");

class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.classList = {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
    };
    this._html = "";
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.checked = false;
    this.files = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() {}
  select() {}
  click() { if (this.onclick) this.onclick({ target: this }); }
  focus() {}
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function build() {
  const registry = {};
  const mk = (id) => { registry[id] = new El("div"); return registry[id]; };
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
    querySelector: (sel) => {
      if (!registry[sel]) registry[sel] = new El(sel.indexOf("input") >= 0 ? "input" : "div");
      return registry[sel];
    },
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
    FileReader: function () {},
    scrollTo: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ["data/bank.js", "js/core.js", "js/practice.js", "js/exam.js", "js/pages.js", "js/app.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(APP, f), "utf8"), sandbox, { filename: f });
  });
  return { sandbox, document, registry, store, Core: sandbox.Core, storeRef: store };
}

module.exports = { build, load: build, El, APP };

