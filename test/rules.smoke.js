/* 无浏览器环境的规则冒烟测试：node test/rules.smoke.js */
global.crypto = require("crypto").webcrypto;
global.window = {};
require("../rules.js");
const R = global.window.ArchaeoRules;
const assert = require("assert");

function newState() {
  return {
    marks: [
      { id: "m1", code: "A-017", type: "ceramic", dive: "DIVE-01", x: 1, y: 2, depth: "17.8m", orientation: "东", condition: "", note: "" },
      { id: "m2", code: "W-003", type: "wood", dive: "DIVE-02", x: 3, y: 4, depth: "18.2m", orientation: "西北", condition: "", note: "" }
    ],
    drafts: [], sealed: {}, revisions: []
  };
}

// 1. 保存进入草稿，未确认前标记不变
let s = newState();
let r = R.submit(s, { kind: "save", markId: "m1", value: { ...s.marks[0], depth: "20m" } }, "甲班", 1000);
assert.equal(r.status, "drafted");
assert.equal(s.marks[0].depth, "17.8m");
assert.equal(s.drafts.length, 1);

// 2. 同编号再改 -> 冲突保留，不覆盖前一份
r = R.submit(s, { kind: "save", markId: "m1", value: { ...s.marks[0], depth: "22m" } }, "乙班", 2000);
assert.equal(r.status, "conflict");
assert.equal(s.drafts.length, 1);
assert.equal(s.drafts[0].value.depth, "20m");
assert.equal(s.drafts[0].conflicts.length, 1);
assert.equal(s.drafts[0].conflicts[0].value.depth, "22m");

// 有冲突不能确认
r = R.confirmDraft(s, s.drafts[0].id);
assert.equal(r.status, "conflict");
assert.equal(s.marks[0].depth, "17.8m");

// 采纳新值后确认生效
r = R.adoptConflict(s, s.drafts[0].id, s.drafts[0].conflicts[0].id);
assert.equal(r.status, "adopted");
assert.equal(s.drafts[0].value.depth, "22m");
r = R.confirmDraft(s, s.drafts[0].id);
assert.equal(r.status, "confirmed");
assert.equal(s.marks[0].depth, "22m");
assert.equal(s.drafts.length, 0);

// 3. 移除草稿确认后删除
r = R.submit(s, { kind: "remove", markId: "m2" }, "甲班", 3000);
assert.equal(r.status, "drafted");
assert.equal(s.marks.length, 2);
R.confirmDraft(s, s.drafts[0].id);
assert.equal(s.marks.length, 1);

// 4. 封存前必须清空草稿
s = newState();
R.submit(s, { kind: "remove", markId: "m2" }, "甲班", 1);
r = R.sealability(s, "DIVE-02");
assert.equal(r.ok, false);
assert.equal(r.reason, "pending");
// 草稿改潜次也会触及新旧两个潜次
R.discardDraft(s, s.drafts[0].id);
R.submit(s, { kind: "save", markId: "m1", value: { ...s.marks[0], dive: "DIVE-03" } }, "甲班", 2);
assert.equal(R.sealability(s, "DIVE-01").reason, "pending");
assert.equal(R.sealability(s, "DIVE-03").reason, "pending");
R.discardDraft(s, s.drafts[0].id);

// 5. 封存后改动只进履历，可见数据沿用快照
r = R.seal(s, "DIVE-01", "甲班", 4000);
assert.equal(r.status, "sealed");
r = R.submit(s, { kind: "save", markId: "m1", value: { ...s.marks[0], depth: "99m" } }, "乙班", 5000);
assert.equal(r.status, "revised");
assert.equal(s.marks[0].depth, "17.8m");
assert.equal(s.revisions.length, 2); // seal + 保存
assert.equal(R.visibleMarks(s).find(m => m.id === "m1").depth, "17.8m");

// 封存后移除同样只进履历
r = R.submit(s, { kind: "remove", markId: "m1" }, "乙班", 6000);
assert.equal(r.status, "revised");
assert.equal(s.marks.length, 2);
assert.equal(R.visibleMarks(s).filter(m => m.dive === "DIVE-01").length, 1);

// 已封存不能再封存
assert.equal(R.seal(s, "DIVE-01", "甲班").reason, "already-sealed");

// 6. 新编号保存草稿并确认
r = R.submit(s, { kind: "save", value: { id: undefined, code: "M-009", type: "metal", dive: "DIVE-02", x: 9, y: 9, depth: "15m" } }, "丙班", 7000);
assert.equal(r.status, "drafted");
R.confirmDraft(s, s.drafts[0].id);
assert.ok(s.marks.some(m => m.code === "M-009"));

console.log("rules smoke tests passed");
