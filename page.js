/* 页面操作：渲染、表单、地图点击、草稿确认面板、封存与导出入口；业务判断一律调 Rules。 */
(function () {
  "use strict";

  const R = window.ArchaeoRules;
  const store = window.ArchaeoStore;

  const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };

  const map = document.querySelector("#map");
  const form = document.querySelector("#form");
  const list = document.querySelector("#list");
  const filter = document.querySelector("#filter");
  const view = document.querySelector("#view");
  const listTitle = document.querySelector("#listTitle");
  const shiftInput = document.querySelector("#shift");
  const notice = document.querySelector("#notice");
  const sealSelect = document.querySelector("#sealDive");
  const sealBtn = document.querySelector("#sealBtn");
  const draftList = document.querySelector("#draftList");
  const formHint = document.querySelector("#formHint");

  let pending = null;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleString("zh-CN", { hour12: false });
  }

  function shiftName() {
    return shiftInput.value.trim() || "未填班次";
  }

  function tell(message, kind) {
    notice.textContent = message;
    notice.className = "notice" + (kind ? " " + kind : "");
  }

  function refreshSealOptions() {
    const state = store.getState();
    const current = sealSelect.value;
    sealSelect.innerHTML = '<option value="">选择潜次…</option>' +
      R.allDives(state).map(dive => {
        const sealed = !!state.sealed[dive];
        return '<option value="' + esc(dive) + '"' + (sealed ? " disabled" : "") + ">" +
          esc(dive) + (sealed ? "（已封存）" : "") + "</option>";
      }).join("");
    if (current && !state.sealed[current]) sealSelect.value = current;
  }

  function render() {
    const state = store.getState();
    map.querySelectorAll(".marker").forEach(el => el.remove());
    const data = R.visibleMarks(state);
    const filtered = filter.value ? data.filter(m => m.type === filter.value) : data;

    filtered.forEach(mark => {
      const el = document.createElement("button");
      el.className = "marker " + mark.type + (mark.id === form.id.value ? " selected" : "");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.title = mark.code;
      el.textContent = mark.code.slice(0, 2);
      el.onclick = event => { event.stopPropagation(); edit(mark.id); };
      map.appendChild(el);
    });

    if (view.value === "timeline") renderTimeline(filtered);
    else if (view.value === "history") renderHistory();
    else renderList(filtered);

    renderDrafts();
    refreshSealOptions();
  }

  function renderList(data) {
    listTitle.textContent = "标记列表（封存潜次显示封存版）";
    list.className = "list";
    list.innerHTML = data.map(m =>
      '<div class="item ' + (m.id === form.id.value ? "active" : "") + '" data-id="' + esc(m.id) + '">' +
      '<b>' + esc(m.code) + '</b> <span class="pill">' + esc(typeNames[m.type] || m.type) + '</span>' +
      '<div class="muted">' + esc(m.dive) + " · " + esc(m.depth) + " · " + esc(m.orientation) + "</div>" +
      "<div>" + esc(m.condition) + "</div></div>"
    ).join("") || '<div class="muted">没有匹配的标记。</div>';
    list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
  }

  function renderTimeline(data) {
    listTitle.textContent = "潜次时间线";
    list.className = "timeline";
    const state = store.getState();
    const groups = data.reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
    list.innerHTML = Object.entries(groups).map(([dive, items]) =>
      '<div class="item"><b>' + esc(dive) + (state.sealed[dive] ? ' <span class="pill sealed-pill">已封存</span>' : "") + '</b>' +
      '<div class="muted">' + items.length + '个标记（封存版）</div>' +
      items.map(i => "<div>" + esc(i.code) + " · " + esc(typeNames[i.type] || i.type) + "</div>").join("") +
      "</div>"
    ).join("") || '<div class="muted">没有匹配的标记。</div>';
  }

  function kindLabel(kind) {
    return kind === "remove" ? "移除" : kind === "seal" ? "封存" : "保存";
  }

  function revisionSummary(entry) {
    if (entry.kind === "seal") return "潜次封存，页面与导出沿用封存版";
    const v = entry.value;
    if (entry.kind === "remove") return "提交移除（仅入履历）";
    return "提交保存（仅入履历）：" + esc(typeNames[v && v.type] || (v && v.type)) +
      " · " + esc(v ? v.depth : "") + " · " + esc(v ? v.orientation : "");
  }

  function renderHistory() {
    listTitle.textContent = "修订履历（封存后改动只在此留痕）";
    list.className = "timeline";
    const state = store.getState();
    const rows = state.revisions.slice().sort((a, b) => b.at - a.at);
    list.innerHTML = rows.map(entry =>
      '<div class="item"><b>' + kindLabel(entry.kind) +
      (entry.code ? " · " + esc(entry.code) : "") +
      ' <span class="pill">' + esc(entry.dive) + "</span></b>" +
      '<div class="muted">' + esc(entry.shift || "未填班次") + " · " + fmtTime(entry.at) + "</div>" +
      "<div>" + revisionSummary(entry) + "</div></div>"
    ).join("") || '<div class="muted">暂无修订履历。</div>';
  }

  function draftSummary(draft) {
    if (draft.kind === "remove") return "移除该标记";
    const v = draft.value || {};
    return esc(typeNames[v.type] || v.type || "") + " · " + esc(v.dive || "") + " · " + esc(v.depth || "") +
      " · " + esc(v.orientation || "");
  }

  function conflictBlock(draft) {
    if (!draft.conflicts.length) return "";
    return draft.conflicts.map(c =>
      '<div class="conflict"><b>冲突项</b>（' + esc(c.shift || "未填班次") + " · " + fmtTime(c.at) + "）：" +
      (c.kind === "remove" ? "移除" : "保存 " + (c.value ? esc(c.value.type) + " · " + esc(c.value.depth) : "")) +
      '<div class="draft-actions"><button type="button" data-act="adopt" data-draft="' + esc(draft.id) + '" data-conflict="' + esc(c.id) + '">采纳新值</button>' +
      '<button type="button" class="secondary" data-act="ignore" data-draft="' + esc(draft.id) + '" data-conflict="' + esc(c.id) + '">忽略</button></div></div>'
    ).join("");
  }

  function renderDrafts() {
    const state = store.getState();
    draftList.innerHTML = state.drafts.map(d =>
      '<div class="draft-item' + (d.conflicts.length ? " has-conflict" : "") + '">' +
      "<b>" + esc(d.code) + '</b> <span class="pill">' + (d.kind === "remove" ? "移除" : "保存") + "</span>" +
      '<div class="muted">' + esc(d.shift || "未填班次") + " · " + fmtTime(d.at) + "</div>" +
      "<div>" + draftSummary(d) + "</div>" +
      conflictBlock(d) +
      '<div class="draft-actions"><button type="button" data-act="confirm" data-draft="' + esc(d.id) + '"' +
      (d.conflicts.length ? " disabled title='请先采纳或忽略冲突项'" : "") + ">确认生效</button>" +
      '<button type="button" class="secondary" data-act="discard" data-draft="' + esc(d.id) + '">丢弃</button></div>' +
      "</div>"
    ).join("") || '<div class="muted">暂无待确认草稿。</div>';
  }

  function edit(id) {
    const state = store.getState();
    const mark = R.visibleMarks(state).find(m => m.id === id);
    if (!mark) return;
    for (const [key, value] of Object.entries(mark)) if (form[key]) form[key].value = value;
    pending = { x: mark.x, y: mark.y };
    formHint.textContent = state.sealed[mark.dive]
      ? "该潜次已封存：保存或移除只会进入修订履历，页面与导出不变。"
      : "保存或移除先进入确认草稿，经确认后才生效。";
    render();
  }

  map.addEventListener("click", event => {
    // 标记按钮会 stopPropagation，其余区域（含沉船轮廓、船肋）均可放置新标记
    const rect = map.getBoundingClientRect();
    pending = {
      x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
      y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
    };
    form.reset();
    form.id.value = "";
    const state = store.getState();
    form.code.value = "M-" + String(state.marks.length + 1).padStart(3, "0");
    form.dive.value = "DIVE-01";
    formHint.textContent = "新标记：保存先进入确认草稿。";
    render();
  });

  form.onsubmit = event => {
    event.preventDefault();
    if (!pending) pending = { x: 50, y: 50 };
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = data.id
      ? { kind: "save", markId: data.id, value: Object.assign({}, data, { id: data.id }, pending) }
      : { kind: "save", value: Object.assign({}, data, pending) };

    const result = R.submit(store.getState(), payload, shiftName());
    store.commit();

    if (result.status === "drafted") tell("已进入确认草稿：" + data.code + "，确认后才生效。");
    else if (result.status === "conflict") tell("该编号已有未确认改动，新值已保留为冲突项，未覆盖前一份。", "warn");
    else if (result.status === "revised") tell("该潜次已封存：改动只进入修订履历，页面与导出沿用封存版。", "warn");

    form.reset();
    form.id.value = "";
    pending = null;
    formHint.textContent = "";
    render();
  };

  document.querySelector("#deleteBtn").onclick = () => {
    if (!form.id.value) return;
    const result = R.submit(store.getState(), { kind: "remove", markId: form.id.value }, shiftName());
    store.commit();

    if (result.status === "drafted") tell("移除已进入确认草稿，确认后才删除。");
    else if (result.status === "conflict") tell("该编号已有未确认改动，移除请求已保留为冲突项。", "warn");
    else if (result.status === "revised") tell("该潜次已封存：移除只进入修订履历，页面与导出不变。", "warn");

    form.reset();
    form.id.value = "";
    pending = null;
    formHint.textContent = "";
    render();
  };

  draftList.addEventListener("click", event => {
    const btn = event.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const draftId = btn.dataset.draft;
    let result;

    if (act === "confirm") {
      result = R.confirmDraft(store.getState(), draftId);
      if (result.ok) tell("草稿已确认生效。");
      else if (result.status === "conflict") tell("仍有冲突项未处理：请先采纳或忽略，不能直接覆盖。", "warn");
      else if (result.status === "sealed") tell("该潜次已封存，草稿无法确认，请丢弃；封存后的改动只进修订履历。", "warn");
    } else if (act === "discard") {
      result = R.discardDraft(store.getState(), draftId);
      if (result.ok) tell("草稿（含冲突项）已丢弃。");
    } else if (act === "adopt") {
      result = R.adoptConflict(store.getState(), draftId, btn.dataset.conflict);
      if (result.ok) tell("已采纳冲突新值作为草稿，请确认后生效。");
    } else if (act === "ignore") {
      result = R.ignoreConflict(store.getState(), draftId, btn.dataset.conflict);
      if (result.ok) tell("冲突项已忽略，仍保留原草稿。");
    }

    if (result && result.ok) store.commit();
    render();
  });

  sealBtn.onclick = () => {
    const dive = sealSelect.value;
    if (!dive) { tell("请先选择要封存的潜次。", "warn"); return; }
    const state = store.getState();
    const check = R.sealability(state, dive);
    if (!check.ok) {
      if (check.reason === "already-sealed") tell(dive + " 已封存。", "warn");
      else tell("封存前必须清空该潜次草稿：仍有 " + check.blocking.length + " 份待确认。", "warn");
      return;
    }
    const result = R.seal(state, dive, shiftName());
    if (!result.ok) { tell("封存失败：" + result.reason, "warn"); return; }
    store.commit();
    tell(dive + " 已封存；此后改动只进入修订履历，页面与导出沿用封存版。");
    render();
  };

  document.querySelector("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(R.visibleMarks(store.getState()), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dive-marks.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  shiftInput.value = store.getShift();
  shiftInput.oninput = () => store.setShift(shiftInput.value);
  filter.onchange = render;
  view.onchange = render;

  for (let i = 0; i < 7; i++) {
    const rib = document.createElement("div");
    rib.className = "rib";
    rib.style.left = 28 + i * 7 + "%";
    map.appendChild(rib);
  }

  render();
})();
