// 判断：草稿、冲突、封存、修订的业务规则。只处理数据，不碰页面与存储。
window.DiveApp = window.DiveApp || {};

DiveApp.domain = (() => {
  const uid = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  // 一次改动：action 为 save/remove；code 与 dive 冗余存放，便于展示和封存判断
  function makeChange(action, mark, by, at) {
    return {
      action,
      markerId: mark.id,
      code: mark.code,
      dive: mark.dive,
      data: action === "save" ? { ...mark } : null,
      by,
      at
    };
  }

  // 同一编号（或同一标记）视为同一目标
  function sameTarget(a, b) {
    return a.markerId === b.markerId || a.code === b.code;
  }

  // 保存/移除先进入确认草稿，每条标记只留一份未确认改动
  function stageChange(state, change) {
    const existing = state.drafts.find(d => sameTarget(d, change));
    if (!existing) {
      const draft = { id: uid(), ...change };
      state.drafts.push(draft);
      return { kind: "staged", draft };
    }
    if (existing.by === change.by) {
      Object.assign(existing, change); // 同一班次重复提交：更新自己的那份草稿
      return { kind: "restaged", draft: existing };
    }
    // 别的班次已占位：新值保留为冲突项，不覆盖前一份草稿
    const conflict = { id: uid(), ...change, against: existing.id };
    state.conflicts.push(conflict);
    return { kind: "conflict", conflict, draft: existing };
  }

  function applyDraft(state, draft) {
    if (draft.action === "remove") {
      state.marks = state.marks.filter(m => m.id !== draft.markerId);
      return;
    }
    const idx = state.marks.findIndex(m => m.id === draft.markerId);
    if (idx >= 0) state.marks[idx] = { ...state.marks[idx], ...draft.data, id: draft.markerId };
    else state.marks.push({ ...draft.data, id: draft.markerId });
  }

  // 确认草稿：改动生效，相关冲突项一并了结
  function confirmDraft(state, draftId) {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) return null;
    applyDraft(state, draft);
    state.drafts = state.drafts.filter(d => d.id !== draftId);
    state.conflicts = state.conflicts.filter(c => !sameTarget(c, draft));
    return draft;
  }

  function toDraft(conflict) {
    const { against, ...draft } = conflict;
    return draft;
  }

  // 放弃草稿：最早一份冲突项顶上，任何班次的改动都不丢
  function discardDraft(state, draftId) {
    const draft = state.drafts.find(d => d.id === draftId);
    if (!draft) return null;
    state.drafts = state.drafts.filter(d => d.id !== draftId);
    const next = state.conflicts
      .filter(c => sameTarget(c, draft))
      .sort((a, b) => a.at - b.at)[0];
    if (next) {
      state.conflicts = state.conflicts.filter(c => c.id !== next.id);
      state.drafts.push(toDraft(next));
    }
    return draft;
  }

  // 采用冲突项：人工裁定后，新值替换当前草稿
  function adoptConflict(state, conflictId) {
    const conflict = state.conflicts.find(c => c.id === conflictId);
    if (!conflict) return null;
    state.conflicts = state.conflicts.filter(c => c.id !== conflictId);
    const draft = toDraft(conflict);
    const idx = state.drafts.findIndex(d => sameTarget(d, draft));
    if (idx >= 0) state.drafts[idx] = draft;
    else state.drafts.push(draft);
    return draft;
  }

  function discardConflict(state, conflictId) {
    const conflict = state.conflicts.find(c => c.id === conflictId);
    if (!conflict) return null;
    state.conflicts = state.conflicts.filter(c => c.id !== conflictId);
    return conflict;
  }

  // 改动涉及的潜次：目标潜次 + 标记当前所在潜次
  function divesOf(state, change) {
    const dives = new Set([change.dive]);
    const mark = state.marks.find(m => m.id === change.markerId);
    if (mark) dives.add(mark.dive);
    return dives;
  }

  function pendingForDive(state, dive) {
    return {
      drafts: state.drafts.filter(d => divesOf(state, d).has(dive)),
      conflicts: state.conflicts.filter(c => divesOf(state, c).has(dive))
    };
  }

  function isSealed(state, dive) {
    return Boolean(state.sealed[dive]);
  }

  // 潜次封存：封存前必须清空该潜次的草稿与冲突
  function sealDive(state, dive, at) {
    if (isSealed(state, dive)) return { ok: false, reason: "sealed" };
    const pending = pendingForDive(state, dive);
    if (pending.drafts.length || pending.conflicts.length) {
      return { ok: false, reason: "pending", drafts: pending.drafts, conflicts: pending.conflicts };
    }
    state.sealed[dive] = {
      at,
      snapshot: state.marks.filter(m => m.dive === dive).map(m => ({ ...m }))
    };
    return { ok: true };
  }

  // 封存前清理：清空该潜次的草稿与冲突
  function clearDrafts(state, dive) {
    const pending = pendingForDive(state, dive);
    const cleared = pending.drafts.length + pending.conflicts.length;
    state.drafts = state.drafts.filter(d => !divesOf(state, d).has(dive));
    state.conflicts = state.conflicts.filter(c => !divesOf(state, c).has(dive));
    return cleared;
  }

  // 封存后的改动：只进修订履历，页面与导出仍用封存版
  function recordRevision(state, change) {
    const revision = { id: uid(), ...change };
    state.revisions.push(revision);
    return revision;
  }

  return {
    makeChange,
    stageChange,
    confirmDraft,
    discardDraft,
    adoptConflict,
    discardConflict,
    clearDrafts,
    sealDive,
    isSealed,
    recordRevision,
    pendingForDive
  };
})();
