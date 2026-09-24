// 页面操作：地图、表单、草稿箱、封存与导出的交互渲染。
(() => {
  const { domain, store } = window.DiveApp;
  const state = store.load();

  const map = document.querySelector("#map");
  const form = document.querySelector("#form");
  const list = document.querySelector("#list");
  const filter = document.querySelector("#filter");
  const view = document.querySelector("#view");
  const listTitle = document.querySelector("#listTitle");
  const notice = document.querySelector("#notice");
  const shiftInput = document.querySelector("#shift");
  const draftPanel = document.querySelector("#draftPanel");
  const draftList = document.querySelector("#draftList");
  const conflictBox = document.querySelector("#conflictBox");
  const conflictList = document.querySelector("#conflictList");
  const sealDiveSelect = document.querySelector("#sealDive");
  const sealBtn = document.querySelector("#sealBtn");
  const clearDraftsBtn = document.querySelector("#clearDraftsBtn");
  const sealedList = document.querySelector("#sealedList");
  const sealHint = document.querySelector("#sealHint");
  const diveInput = form.elements.dive;

  const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
  const actionNames = { save: "保存", remove: "移除" };
  let pending = null;
  let noticeTimer = null;

  for (let i = 0; i < 7; i++) {
    const rib = document.createElement("div");
    rib.className = "rib";
    rib.style.left = 28 + i * 7 + "%";
    map.appendChild(rib);
  }

  function say(msg) {
    notice.textContent = msg;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
  }

  const shift = () => shiftInput.value.trim() || "未署名";
  const persist = () => store.save(state);
  const fmtTime = at => new Date(at).toLocaleString("zh-CN", { hour12: false });
  const draftedIds = () => new Set(state.drafts.map(d => d.markerId));
  const filteredMarks = () => filter.value ? state.marks.filter(m => m.type === filter.value) : state.marks;

  function render() {
    renderMap();
    renderMain();
    renderDrafts();
    renderSeal();
    renderSealHint();
  }

  function renderMap() {
    map.querySelectorAll(".marker").forEach(el => el.remove());
    const drafted = draftedIds();
    filteredMarks().forEach(mark => {
      const el = document.createElement("button");
      el.className = "marker " + mark.type
        + (mark.id === form.elements.id.value ? " selected" : "")
        + (drafted.has(mark.id) ? " hasDraft" : "");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.textContent = mark.code.slice(0, 2);
      el.onclick = event => { event.stopPropagation(); edit(mark.id); };
      map.appendChild(el);
    });
  }

  function renderMain() {
    const data = filteredMarks();
    if (view.value === "timeline") renderTimeline(data);
    else if (view.value === "revisions") renderRevisions();
    else renderList(data);
  }

  function renderList(data) {
    listTitle.textContent = "标记列表";
    list.className = "list";
    const drafted = draftedIds();
    list.innerHTML = data.map(m =>
      '<div class="item ' + (m.id === form.elements.id.value ? "active" : "") + '" data-id="' + m.id + '">'
      + "<b>" + m.code + "</b> <span class=\"pill\">" + typeNames[m.type] + "</span>"
      + (drafted.has(m.id) ? ' <span class="pill">草稿待确认</span>' : "")
      + '<div class="muted">' + m.dive + " · " + m.depth + " · " + m.orientation + "</div>"
      + "<div>" + m.condition + "</div></div>"
    ).join("");
    list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
  }

  function renderTimeline(data) {
    listTitle.textContent = "潜次时间线";
    list.className = "timeline";
    const groups = data.reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
    list.innerHTML = Object.entries(groups).map(([dive, items]) =>
      '<div class="item"><b>' + dive + "</b> "
      + (domain.isSealed(state, dive) ? '<span class="pill">已封存</span>' : "")
      + '<div class="muted">新增' + items.length + "个标记</div>"
      + items.map(i => "<div>" + i.code + " · " + typeNames[i.type] + "</div>").join("")
      + "</div>"
    ).join("");
  }

  function renderRevisions() {
    listTitle.textContent = "修订履历";
    list.className = "list";
    const items = [...state.revisions].sort((a, b) => b.at - a.at);
    list.innerHTML = items.length ? items.map(r =>
      '<div class="item"><b>' + r.code + '</b> '
      + '<span class="pill">' + actionNames[r.action] + '</span> '
      + '<span class="pill">' + r.by + "</span>"
      + '<div class="muted">' + r.dive + " · " + fmtTime(r.at) + " · 已封存，仅履历</div></div>"
    ).join("") : '<div class="muted">暂无修订履历</div>';
  }

  function draftLabel(d) {
    if (d.action === "remove") return "移除";
    return state.marks.some(m => m.id === d.markerId) ? "保存" : "新增";
  }

  function renderDrafts() {
    draftPanel.hidden = !state.drafts.length && !state.conflicts.length;
    draftList.innerHTML = "";
    state.drafts.forEach(d => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = "<b>" + d.code + '</b> <span class="pill">' + draftLabel(d)
        + '</span> <span class="pill">' + d.by + "</span>"
        + '<div class="muted">' + d.dive + " · " + fmtTime(d.at) + "</div>";
      const row = document.createElement("div");
      row.className = "toolbar";
      const ok = document.createElement("button");
      ok.textContent = "确认";
      ok.onclick = () => { domain.confirmDraft(state, d.id); say("已确认 " + d.code + " 的改动"); persist(); render(); };
      const no = document.createElement("button");
      no.textContent = "放弃";
      no.className = "secondary";
      no.onclick = () => { domain.discardDraft(state, d.id); say("已放弃 " + d.code + " 的草稿"); persist(); render(); };
      row.append(ok, no);
      el.appendChild(row);
      draftList.appendChild(el);
    });

    conflictBox.hidden = !state.conflicts.length;
    conflictList.innerHTML = "";
    state.conflicts.forEach(c => {
      const rival = state.drafts.find(d => d.id === c.against)
        || state.drafts.find(d => d.code === c.code || d.markerId === c.markerId);
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = "<b>" + c.code + '</b> <span class="pill">' + draftLabel(c)
        + '</span> <span class="pill">' + c.by + "</span>"
        + '<div class="muted">与 ' + (rival ? rival.by : "另一班次") + " 的草稿冲突，新值已保留 · "
        + fmtTime(c.at) + "</div>";
      const row = document.createElement("div");
      row.className = "toolbar";
      const adopt = document.createElement("button");
      adopt.textContent = "采用";
      adopt.onclick = () => { domain.adoptConflict(state, c.id); say("已采用冲突值，替换当前草稿"); persist(); render(); };
      const no = document.createElement("button");
      no.textContent = "放弃";
      no.className = "secondary";
      no.onclick = () => { domain.discardConflict(state, c.id); say("已放弃该冲突项"); persist(); render(); };
      row.append(adopt, no);
      el.appendChild(row);
      conflictList.appendChild(el);
    });
  }

  function renderSeal() {
    const dives = [...new Set([...state.marks.map(m => m.dive), ...state.drafts.map(d => d.dive)])]
      .filter(d => d && !domain.isSealed(state, d))
      .sort();
    const current = sealDiveSelect.value;
    sealDiveSelect.innerHTML = dives.map(d => '<option value="' + d + '">' + d + "</option>").join("");
    if (dives.includes(current)) sealDiveSelect.value = current;
    const sealed = Object.entries(state.sealed);
    sealedList.innerHTML = sealed.length
      ? "已封存：" + sealed.map(([d, s]) => '<span class="pill">' + d + " · " + fmtTime(s.at) + "</span>").join(" ")
      : "暂无已封存潜次";
    sealBtn.disabled = !dives.length;
    clearDraftsBtn.disabled = !dives.length;
  }

  function renderSealHint() {
    const dive = diveInput.value.trim();
    const sealed = dive && domain.isSealed(state, dive);
    sealHint.hidden = !sealed;
    if (sealed) sealHint.textContent = "潜次 " + dive + " 已封存，保存/移除只记入修订履历，页面与导出沿用封存版";
  }

  function edit(id) {
    const mark = state.marks.find(m => m.id === id);
    if (!mark) return;
    for (const [key, value] of Object.entries(mark)) if (form.elements[key]) form.elements[key].value = value;
    pending = { x: mark.x, y: mark.y };
    render();
  }

  map.addEventListener("click", event => {
    const rect = map.getBoundingClientRect();
    pending = {
      x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
      y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
    };
    form.reset();
    form.elements.id.value = "";
    const used = new Set([...state.marks.map(m => m.code), ...state.drafts.map(d => d.code)]);
    let n = state.marks.length + 1;
    while (used.has("M-" + String(n).padStart(3, "0"))) n++;
    form.elements.code.value = "M-" + String(n).padStart(3, "0");
    diveInput.value = "DIVE-01";
    render();
  });

  function submitChange(action, mark) {
    const change = domain.makeChange(action, mark, shift(), Date.now());
    const current = state.marks.find(m => m.id === mark.id);
    const touchesSealed = domain.isSealed(state, mark.dive)
      || Boolean(current && domain.isSealed(state, current.dive));
    if (touchesSealed) {
      domain.recordRevision(state, change);
      say("潜次已封存，" + actionNames[action] + "只记入修订履历，页面与导出不变");
      return;
    }
    const res = domain.stageChange(state, change);
    if (res.kind === "conflict") say("编号 " + mark.code + " 已有其他班次的待确认草稿，新值已保留为冲突项");
    else if (res.kind === "restaged") say("已更新你在草稿箱中的那份改动");
    else say("已存入确认草稿，确认后生效");
  }

  form.onsubmit = event => {
    event.preventDefault();
    if (!pending) pending = { x: 50, y: 50 };
    const data = Object.fromEntries(new FormData(form).entries());
    const mark = { ...data, id: data.id || crypto.randomUUID(), ...pending };
    submitChange("save", mark);
    form.reset();
    pending = null;
    persist();
    render();
  };

  document.querySelector("#deleteBtn").onclick = () => {
    const mark = state.marks.find(m => m.id === form.elements.id.value);
    if (!mark) return;
    submitChange("remove", mark);
    form.reset();
    pending = null;
    persist();
    render();
  };

  sealBtn.onclick = () => {
    const dive = sealDiveSelect.value;
    if (!dive) return;
    const res = domain.sealDive(state, dive, Date.now());
    if (res.ok) say("潜次 " + dive + " 已封存，之后的改动只记入修订履历");
    else say("封存失败：" + dive + " 还有 " + (res.drafts.length + res.conflicts.length) + " 条草稿/冲突，请先清空");
    persist();
    render();
  };

  clearDraftsBtn.onclick = () => {
    const dive = sealDiveSelect.value;
    if (!dive) return;
    const n = domain.clearDrafts(state, dive);
    say(n ? "已清空 " + dive + " 的 " + n + " 条草稿/冲突" : dive + " 没有待清理的草稿");
    persist();
    render();
  };

  document.querySelector("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state.marks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dive-marks.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  shiftInput.value = store.loadShift();
  shiftInput.onchange = () => store.saveShift(shiftInput.value.trim());
  diveInput.addEventListener("input", renderSealHint);
  filter.onchange = render;
  view.onchange = render;
  render();
})();
