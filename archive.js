/* 存档：状态读写与本地持久化，负责草稿、封存快照、修订履历的存取，不含页面渲染。 */
(function () {
  "use strict";

  const LEGACY_KEY = "zfl30Marks";
  const STATE_KEY = "zfl30ArchaeoState_v1";
  const SHIFT_KEY = "zfl30ArchaeoShift";

  function seed() {
    return [
      { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋" },
      { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁" }
    ];
  }

  function emptyState() {
    return { marks: [], drafts: [], sealed: {}, revisions: [] };
  }

  function migrateLegacy(state) {
    if (state.marks.length) return;
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (Array.isArray(legacy) && legacy.length) {
        state.marks = legacy;
        persist(state);
      }
    } catch (error) {
      console.warn("旧版标记迁移失败：", error);
    }
  }

  let state = emptyState();
  try {
    const stored = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (stored && Array.isArray(stored.marks)) state = Object.assign(emptyState(), stored);
  } catch (error) {
    console.warn("存档读取失败，使用空状态：", error);
  }

  if (!state.marks.length && !Object.keys(state.sealed).length) {
    migrateLegacy(state);
  }
  if (!state.marks.length && !Object.keys(state.sealed).length) {
    state.marks = seed();
    persist(state);
  }

  function persist(nextState) {
    localStorage.setItem(STATE_KEY, JSON.stringify(nextState || state));
  }

  /* 每次业务操作后调用：规则层只改内存状态，存档层统一落盘。 */
  function commit() {
    persist(state);
  }

  function getState() {
    return state;
  }

  function getShift() {
    return localStorage.getItem(SHIFT_KEY) || "";
  }

  function setShift(shift) {
    localStorage.setItem(SHIFT_KEY, shift || "");
  }

  window.ArchaeoStore = {
    getState: getState,
    commit: commit,
    getShift: getShift,
    setShift: setShift
  };
})();
