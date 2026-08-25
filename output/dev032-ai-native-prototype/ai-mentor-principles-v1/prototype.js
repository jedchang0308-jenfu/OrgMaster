const documentView = document.getElementById("documentView");
const listView = document.getElementById("listView");
const documentActions = document.getElementById("documentActions");
const listButton = document.getElementById("listButton");
const methodSearch = document.getElementById("methodSearch");
const emptySearch = document.getElementById("emptySearch");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const saveState = document.getElementById("saveState");
const editButton = document.getElementById("editButton");
let lastDrawerTrigger = null;
let activeDrawer = null;
let editing = false;
let saveTimer = null;

function showView(name) {
  const showDocument = name === "document";
  documentView.hidden = !showDocument;
  listView.hidden = showDocument;
  documentActions.hidden = !showDocument;
  closeDrawer();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (showDocument) {
    document.getElementById("methodTitle").focus?.();
  } else {
    methodSearch.focus();
  }
}

function openDrawer(drawer, trigger) {
  closeDrawer(false);
  lastDrawerTrigger = trigger;
  activeDrawer = drawer;
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  drawer.classList.add("is-open");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    drawer.querySelector("button, input, a[href]")?.focus();
  });
}

function closeDrawer(returnFocus = true) {
  if (!activeDrawer) return;
  activeDrawer.classList.remove("is-open");
  activeDrawer.setAttribute("aria-hidden", "true");
  activeDrawer.hidden = true;
  drawerBackdrop.hidden = true;
  document.body.style.overflow = "";
  const trigger = lastDrawerTrigger;
  activeDrawer = null;
  lastDrawerTrigger = null;
  if (returnFocus) trigger?.focus();
}

function setEditing(nextState) {
  if (window.matchMedia("(max-width: 760px)").matches) return;
  editing = nextState;
  const targets = [...document.querySelectorAll(
    "[data-editable-block] > p, [data-editable-block] li, [data-editable-block] dd, .prompt-sheet section:not(.restricted-block) > p"
  )];
  for (const target of targets) {
    target.contentEditable = editing ? "true" : "false";
    target.classList.toggle("editable-target", editing);
  }
  editButton.textContent = editing ? "完成編輯" : "編輯文件";
  editButton.setAttribute("aria-pressed", String(editing));
  saveState.hidden = !editing;
  saveState.textContent = editing ? "編輯模式" : "已儲存";
  if (editing) targets[0]?.focus();
}

function queuePrototypeSave() {
  saveState.textContent = "未儲存";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveState.textContent = "儲存中";
    window.setTimeout(() => {
      saveState.textContent = "已儲存（原型）";
    }, 420);
  }, 650);
}

listButton.addEventListener("click", () => showView("list"));

document.querySelectorAll(".method-row").forEach((row) => {
  row.addEventListener("click", () => {
    if (row.dataset.target) {
      window.location.href = row.dataset.target;
      return;
    }
    showView("document");
  });
});

methodSearch.addEventListener("input", () => {
  const query = methodSearch.value.trim().toLocaleLowerCase("zh-Hant");
  let visibleCount = 0;
  document.querySelectorAll(".method-row").forEach((row) => {
    const matches = !query || row.dataset.search.toLocaleLowerCase("zh-Hant").includes(query);
    row.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  emptySearch.hidden = visibleCount > 0;
});

document.getElementById("tocButton").addEventListener("click", (event) => {
  openDrawer(document.getElementById("tocDrawer"), event.currentTarget);
});

document.getElementById("dutyButton").addEventListener("click", (event) => {
  openDrawer(document.getElementById("dutyDrawer"), event.currentTarget);
});

document.querySelectorAll("[data-close-drawer]").forEach((button) => {
  button.addEventListener("click", () => closeDrawer());
});

document.querySelectorAll(".toc-nav a").forEach((link) => {
  link.addEventListener("click", () => closeDrawer(false));
});

drawerBackdrop.addEventListener("click", () => closeDrawer());

editButton.addEventListener("click", () => setEditing(!editing));

document.getElementById("editableDocument").addEventListener("input", (event) => {
  if (editing && event.target.matches("[contenteditable='true']")) {
    queuePrototypeSave();
  }
});

document.getElementById("selectDutyContext").addEventListener("click", () => {
  document.getElementById("dutyPrototypeNote").hidden = false;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDrawer) {
    event.preventDefault();
    closeDrawer();
    return;
  }
  if (event.key !== "Tab" || !activeDrawer) return;
  const focusables = [...activeDrawer.querySelectorAll(
    "a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])"
  )].filter((element) => !element.hidden);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

showView("document");
