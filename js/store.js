// 存档：状态在 localStorage 的读写、旧版数据迁移与班次记录。
window.DiveApp = window.DiveApp || {};

DiveApp.store = (() => {
  const STATE_KEY = "zfl30State";
  const LEGACY_KEY = "zfl30Marks"; // 旧版：只有标记数组
  const SHIFT_KEY = "zfl30Shift";

  const blank = () => ({ marks: [], drafts: [], conflicts: [], sealed: {}, revisions: [] });

  function seed() {
    const state = blank();
    state.marks = [
      { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋" },
      { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁" }
    ];
    return state;
  }

  function normalize(raw) {
    const state = blank();
    if (!raw || typeof raw !== "object") return state;
    if (Array.isArray(raw.marks)) state.marks = raw.marks;
    if (Array.isArray(raw.drafts)) state.drafts = raw.drafts;
    if (Array.isArray(raw.conflicts)) state.conflicts = raw.conflicts;
    if (raw.sealed && typeof raw.sealed === "object") state.sealed = raw.sealed;
    if (Array.isArray(raw.revisions)) state.revisions = raw.revisions;
    return state;
  }

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  function load() {
    let state = read(STATE_KEY);
    if (!state) {
      const legacy = read(LEGACY_KEY); // 迁移旧版标记数组
      state = Array.isArray(legacy) && legacy.length ? { ...blank(), marks: legacy } : seed();
      save(normalize(state));
      if (legacy) localStorage.removeItem(LEGACY_KEY);
    }
    return normalize(state);
  }

  function save(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function loadShift() {
    return localStorage.getItem(SHIFT_KEY) || "";
  }

  function saveShift(name) {
    localStorage.setItem(SHIFT_KEY, name);
  }

  return { load, save, loadShift, saveShift };
})();
