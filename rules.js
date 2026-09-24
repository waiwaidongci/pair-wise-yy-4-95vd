/* 判断（业务规则）：草稿去留、冲突判定、封存规则，对状态做纯业务操作，不碰 DOM 与存档。 */
(function () {
  "use strict";

  function uuid() {
    return crypto.randomUUID();
  }

  function clone(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function findDraftByCode(state, code) {
    return state.drafts.find(d => d.code === code);
  }

  /* 草稿可能触及的潜次：新值潜次、原标记潜次、冲突项新值潜次都算。 */
  function draftTouches(draft, marks) {
    const dives = new Set();
    if (draft.value && draft.value.dive) dives.add(draft.value.dive);
    const base = draft.markId ? marks.find(m => m.id === draft.markId) : null;
    if (base) dives.add(base.dive);
    draft.conflicts.forEach(c => {
      if (c.value && c.value.dive) dives.add(c.value.dive);
    });
    return dives;
  }

  /*
   * 一次保存/移除提交的去向：
   * 1. 所属潜次已封存 -> 只进修订履历，页面与导出不变；
   * 2. 同一编号已有未确认改动 -> 记为冲突项并保留新值，不覆盖前一份；
   * 3. 否则 -> 进入确认草稿（每条标记只留一份）。
   */
  function submit(state, payload, shift, now) {
    now = now || Date.now();
    const kind = payload.kind === "remove" ? "remove" : "save";
    const markId = payload.markId || null;

    let code;
    let dive;
    let value = null;

    if (kind === "save") {
      value = clone(payload.value);
      code = value.code;
      dive = value.dive;
    } else {
      const mark = state.marks.find(m => m.id === markId);
      if (!mark) return { ok: false, status: "missing" };
      code = mark.code;
      dive = mark.dive;
    }

    if (state.sealed[dive]) {
      const revision = {
        id: uuid(), kind: kind, code: code, dive: dive,
        shift: shift, at: now, value: value ? clone(value) : null
      };
      state.revisions.push(revision);
      return { ok: true, status: "revised", revision: revision };
    }

    const draft = findDraftByCode(state, code);
    if (draft) {
      const conflict = {
        id: uuid(), kind: kind, shift: shift, at: now,
        value: value ? clone(value) : null
      };
      draft.conflicts.push(conflict);
      return { ok: true, status: "conflict", draft: draft, conflict: conflict };
    }

    const base = markId ? clone(state.marks.find(m => m.id === markId) || null) : null;
    const created = {
      id: uuid(), code: code, markId: markId, kind: kind,
      base: base, value: value, shift: shift, at: now, conflicts: []
    };
    state.drafts.push(created);
    return { ok: true, status: "drafted", draft: created };
  }

  /* 确认生效：仍有未处理冲突时拒绝，避免静默覆盖前一份改动。 */
  function confirmDraft(state, draftId) {
    const index = state.drafts.findIndex(d => d.id === draftId);
    if (index < 0) return { ok: false, status: "missing" };
    const draft = state.drafts[index];

    if (draft.conflicts.length) return { ok: false, status: "conflict", draft: draft };

    if (draft.kind === "save") {
      if (!draft.value || state.sealed[draft.value.dive]) return { ok: false, status: "sealed" };
      const target = draft.markId ? state.marks.find(m => m.id === draft.markId) : null;
      if (target) Object.assign(target, clone(draft.value));
      else state.marks.push(Object.assign({ id: uuid() }, clone(draft.value)));
    } else {
      state.marks = state.marks.filter(m => m.id !== draft.markId);
    }
    state.drafts.splice(index, 1);
    return { ok: true, status: "confirmed" };
  }

  /* 丢弃：整份草稿连同其冲突项一起作废。 */
  function discardDraft(state, draftId) {
    const index = state.drafts.findIndex(d => d.id === draftId);
    if (index < 0) return { ok: false, status: "missing" };
    state.drafts.splice(index, 1);
    return { ok: true, status: "discarded" };
  }

  /* 显式采纳冲突新值：由确认人操作，而非后提交者自动覆盖。 */
  function adoptConflict(state, draftId, conflictId) {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) return { ok: false, status: "missing" };
    const index = draft.conflicts.findIndex(c => c.id === conflictId);
    if (index < 0) return { ok: false, status: "missing" };
    const chosen = draft.conflicts[index];
    draft.kind = chosen.kind;
    draft.value = chosen.value ? clone(chosen.value) : null;
    draft.shift = chosen.shift;
    draft.at = chosen.at;
    draft.conflicts.splice(index, 1);
    return { ok: true, status: "adopted" };
  }

  function ignoreConflict(state, draftId, conflictId) {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) return { ok: false, status: "missing" };
    const before = draft.conflicts.length;
    draft.conflicts = draft.conflicts.filter(c => c.id !== conflictId);
    return draft.conflicts.length < before ? { ok: true, status: "ignored" } : { ok: false, status: "missing" };
  }

  /* 封存前置判断：潜次已封存或仍有触及该潜次的草稿，都不允许封存。 */
  function sealability(state, dive) {
    if (state.sealed[dive]) return { ok: false, reason: "already-sealed" };
    const blocking = state.drafts.filter(d => draftTouches(d, state.marks).has(dive));
    if (blocking.length) return { ok: false, reason: "pending", blocking: blocking };
    return { ok: true };
  }

  /* 封存：留存当前标记快照；封存后该潜次只认快照。 */
  function seal(state, dive, shift, now) {
    now = now || Date.now();
    const check = sealability(state, dive);
    if (!check.ok) return check;
    const snapshot = state.marks.filter(m => m.dive === dive).map(clone);
    state.sealed[dive] = { at: now, by: shift, marks: snapshot };
    const revision = { id: uuid(), kind: "seal", code: "", dive: dive, shift: shift, at: now, value: null };
    state.revisions.push(revision);
    return { ok: true, status: "sealed", dive: dive };
  }

  /* 页面与导出统一取数：已封存潜次用封存快照，其余用当前确认值。 */
  function visibleMarks(state) {
    return state.marks.map(mark => {
      const sealed = state.sealed[mark.dive];
      if (!sealed) return mark;
      return sealed.marks.find(m => m.id === mark.id) || mark;
    });
  }

  function allDives(state) {
    const dives = new Set(state.marks.map(m => m.dive));
    state.drafts.forEach(d => {
      if (d.value && d.value.dive) dives.add(d.value.dive);
      d.conflicts.forEach(c => {
        if (c.value && c.value.dive) dives.add(c.value.dive);
      });
    });
    return Array.from(dives).filter(Boolean).sort();
  }

  window.ArchaeoRules = {
    submit: submit,
    confirmDraft: confirmDraft,
    discardDraft: discardDraft,
    adoptConflict: adoptConflict,
    ignoreConflict: ignoreConflict,
    sealability: sealability,
    seal: seal,
    visibleMarks: visibleMarks,
    allDives: allDives
  };
})();
