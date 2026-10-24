/* =========================================================
   TaskFlow – Task Manager & Productivity Tracker
   Plain JavaScript (ES6+), no libraries, no backend.
   Everything is saved in the browser with localStorage.
   ========================================================= */

const STORAGE_KEY = "taskflow.tasks.v1";
const THEME_KEY = "taskflow.theme";

// ---------- Grab the elements we need ----------
const form = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const categorySelect = document.getElementById("categorySelect");
const prioritySelect = document.getElementById("prioritySelect");
const dueInput = document.getElementById("dueInput");

const statusTabs = document.getElementById("statusTabs");
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("searchInput");

const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const emptyTitle = document.getElementById("emptyTitle");
const emptyText = document.getElementById("emptyText");

const leftCount = document.getElementById("leftCount");
const clearBtn = document.getElementById("clearCompleted");
const themeBtn = document.getElementById("themeBtn");
const toastEl = document.getElementById("toast");

// ---------- App state ----------
const CATEGORY_ICONS = {
  Work: "💼",
  Personal: "🏠",
  Study: "📚",
  Health: "💪",
  Other: "✨",
};

let tasks = loadFromLocalStorage(); // the main array that holds every task
let currentFilter = "all";          // all | active | completed
let currentCategory = "all";
let searchText = "";
let editingId = null;               // id of the task being edited (if any)
let justCompletedId = null;         // used to play the "done" animation once
let draggedId = null;

// =========================================================
//  localStorage helpers
// =========================================================
function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error("Could not save tasks:", err);
    showToast("⚠️ Couldn't save – storage may be full or blocked");
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return getStarterTasks(); // first visit only
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Could not read saved tasks:", err);
    return [];
  }
}

// A few example tasks so the app doesn't look empty the first time
function getStarterTasks() {
  return [
    makeTask("Finish internship Task 2 project", "Work", "high", dateOffset(1)),
    makeTask("Revise JavaScript array methods", "Study", "medium", dateOffset(2)),
    makeTask("Evening walk – 30 minutes", "Health", "low", ""),
    makeTask("Call family", "Personal", "low", dateOffset(-1)),
  ];
}

// =========================================================
//  Small utilities
// =========================================================
function makeTask(title, category, priority, dueDate) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    title: title,
    category: category,
    priority: priority,
    dueDate: dueDate || "",
    completed: false,
    createdAt: Date.now(),
  };
}

// returns a yyyy-mm-dd string, N days from today
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

function toInputDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// number of days between today and a due date (negative = overdue)
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return Math.round((due - today) / 86400000);
}

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function isOverdue(task) {
  return !task.completed && task.dueDate && daysUntil(task.dueDate) < 0;
}

// =========================================================
//  CRUD operations
// =========================================================

// CREATE
function addTask(title, category, priority, dueDate) {
  const task = makeTask(title.trim(), category, priority, dueDate);
  tasks.unshift(task); // newest on top
  saveToLocalStorage();
  render();
  showToast("✅ Task added");
}

// UPDATE – toggle complete
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  justCompletedId = task.completed ? id : null;
  saveToLocalStorage();
  render();
  if (task.completed) showToast("🎉 Nice work!");
}

// UPDATE – rename
function updateTaskTitle(id, newTitle) {
  const task = tasks.find((t) => t.id === id);
  const clean = newTitle.trim();
  if (task && clean && clean !== task.title) {
    task.title = clean;
    saveToLocalStorage();
    showToast("✏️ Task updated");
  }
  editingId = null;
  render();
}

// DELETE (play the exit animation first)
function deleteTask(id) {
  const li = taskList.querySelector(`[data-id="${id}"]`);
  const finish = () => {
    tasks = tasks.filter((t) => t.id !== id);
    saveToLocalStorage();
    render();
    showToast("🗑️ Task deleted");
  };
  if (li) {
    li.classList.add("removing");
    setTimeout(finish, 270);
  } else {
    finish();
  }
}

function clearCompleted() {
  const doneCount = tasks.filter((t) => t.completed).length;
  if (doneCount === 0) {
    showToast("Nothing to clear yet");
    return;
  }
  tasks = tasks.filter((t) => !t.completed);
  saveToLocalStorage();
  render();
  showToast(`🧹 Cleared ${doneCount} completed task${doneCount > 1 ? "s" : ""}`);
}

// =========================================================
//  Filtering
// =========================================================
function getVisibleTasks() {
  return tasks.filter((task) => {
    if (currentFilter === "active" && task.completed) return false;
    if (currentFilter === "completed" && !task.completed) return false;
    if (currentCategory !== "all" && task.category !== currentCategory) return false;
    if (searchText && !task.title.toLowerCase().includes(searchText)) return false;
    return true;
  });
}

// =========================================================
//  Rendering
// =========================================================
function render() {
  const visible = getVisibleTasks();

  taskList.innerHTML = "";
  visible.forEach((task) => taskList.appendChild(createTaskElement(task)));

  renderEmptyState(visible.length);
  renderStats();

  justCompletedId = null; // animation only plays once
}

function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task" + (task.completed ? " completed" : "");
  if (task.id === justCompletedId) li.classList.add("just-done");
  li.dataset.id = task.id;
  li.dataset.cat = task.category;
  li.draggable = editingId !== task.id;

  // drag handle
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⋮⋮";
  handle.title = "Drag to reorder";

  // checkbox
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "check";
  check.checked = task.completed;
  check.title = task.completed ? "Mark as active" : "Mark as done";
  check.addEventListener("change", () => toggleTask(task.id));

  // title (or edit box)
  const body = document.createElement("div");
  body.className = "task-body";

  if (editingId === task.id) {
    const editBox = document.createElement("input");
    editBox.type = "text";
    editBox.className = "edit-input";
    editBox.value = task.title;
    editBox.maxLength = 120;
    editBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter") updateTaskTitle(task.id, editBox.value);
      if (e.key === "Escape") {
        editingId = null;
        render();
      }
    });
    editBox.addEventListener("blur", () => {
      if (editingId === task.id) updateTaskTitle(task.id, editBox.value);
    });
    body.appendChild(editBox);
    setTimeout(() => {
      editBox.focus();
      editBox.select();
    }, 0);
  } else {
    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.title; // textContent keeps user input safe from HTML injection
    title.title = "Double-click to edit";
    title.addEventListener("dblclick", () => startEditing(task.id));
    body.appendChild(title);
  }

  body.appendChild(createMeta(task));

  // action buttons
  const actions = document.createElement("div");
  actions.className = "actions";

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn";
  editBtn.textContent = "✏️";
  editBtn.title = "Edit";
  editBtn.addEventListener("click", () => startEditing(task.id));

  const delBtn = document.createElement("button");
  delBtn.className = "icon-btn del";
  delBtn.textContent = "🗑️";
  delBtn.title = "Delete";
  delBtn.addEventListener("click", () => deleteTask(task.id));

  actions.append(editBtn, delBtn);

  li.append(handle, check, body, actions);
  addDragEvents(li, task.id);
  return li;
}

function createMeta(task) {
  const meta = document.createElement("div");
  meta.className = "meta";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = `${CATEGORY_ICONS[task.category] || ""} ${task.category}`;
  meta.appendChild(badge);

  const pr = document.createElement("span");
  pr.className = "pill " + task.priority;
  pr.textContent = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  meta.appendChild(pr);

  if (task.dueDate) {
    const due = document.createElement("span");
    const diff = daysUntil(task.dueDate);
    due.className = "pill";

    if (task.completed) {
      due.textContent = `📅 ${prettyDate(task.dueDate)}`;
    } else if (diff < 0) {
      due.classList.add("overdue");
      due.textContent = `⚠️ Overdue · ${prettyDate(task.dueDate)}`;
    } else if (diff === 0) {
      due.classList.add("soon");
      due.textContent = "⏰ Due today";
    } else if (diff === 1) {
      due.classList.add("soon");
      due.textContent = "⏰ Due tomorrow";
    } else {
      due.textContent = `📅 ${prettyDate(task.dueDate)}`;
    }
    meta.appendChild(due);
  }
  return meta;
}

function renderEmptyState(visibleCount) {
  if (visibleCount > 0) {
    emptyState.classList.add("hidden");
    return;
  }
  emptyState.classList.remove("hidden");

  if (tasks.length === 0) {
    emptyTitle.textContent = "No tasks yet";
    emptyText.textContent = "Add your first task above and get moving!";
  } else if (searchText) {
    emptyTitle.textContent = "No matches found";
    emptyText.textContent = `Nothing matches "${searchText}". Try another keyword.`;
  } else if (currentFilter === "completed") {
    emptyTitle.textContent = "Nothing completed yet";
    emptyText.textContent = "Finish a task and it will show up here.";
  } else if (currentFilter === "active") {
    emptyTitle.textContent = "All caught up! 🎉";
    emptyText.textContent = "You have no active tasks. Enjoy the break.";
  } else {
    emptyTitle.textContent = "No tasks in this category";
    emptyText.textContent = "Pick another category or add a new task.";
  }
}

function renderStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const active = total - done;
  const overdue = tasks.filter(isOverdue).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statActive").textContent = active;
  document.getElementById("statDone").textContent = done;
  document.getElementById("statOverdue").textContent = overdue;
  document.getElementById("progressBar").style.width = percent + "%";
  document.getElementById("progressText").textContent = `${percent}% complete`;
  leftCount.textContent = `${active} task${active === 1 ? "" : "s"} left`;
}

function startEditing(id) {
  editingId = id;
  render();
}

// =========================================================
//  Drag & drop reordering
// =========================================================
function addDragEvents(li, id) {
  li.addEventListener("dragstart", (e) => {
    draggedId = id;
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id); // Firefox needs this
  });

  li.addEventListener("dragend", () => {
    draggedId = null;
    li.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });

  li.addEventListener("dragover", (e) => {
    e.preventDefault(); // required to allow dropping
    if (id !== draggedId) li.classList.add("drag-over");
  });

  li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

  li.addEventListener("drop", (e) => {
    e.preventDefault();
    li.classList.remove("drag-over");
    if (!draggedId || draggedId === id) return;
    reorderTasks(draggedId, id);
  });
}

// moves the dragged task to the position of the task it was dropped on
function reorderTasks(fromId, toId) {
  const fromIndex = tasks.findIndex((t) => t.id === fromId);
  const toIndex = tasks.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return;

  const [moved] = tasks.splice(fromIndex, 1);
  tasks.splice(toIndex, 0, moved);
  saveToLocalStorage();
  render();
}

// =========================================================
//  Dark mode
// =========================================================
function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

themeBtn.addEventListener("click", () => {
  const next = document.body.classList.contains("dark") ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {
    /* ignore – theme just won't persist */
  }
});

// =========================================================
//  Event listeners
// =========================================================
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;

  addTask(title, categorySelect.value, prioritySelect.value, dueInput.value);

  taskInput.value = "";
  dueInput.value = "";
  taskInput.focus();
});

statusTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  statusTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  render();
});

categoryFilter.addEventListener("change", () => {
  currentCategory = categoryFilter.value;
  render();
});

searchInput.addEventListener("input", () => {
  searchText = searchInput.value.trim().toLowerCase();
  render();
});

clearBtn.addEventListener("click", clearCompleted);

// =========================================================
//  Start the app
// =========================================================
(function init() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(THEME_KEY);
  } catch (e) {}
  if (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    savedTheme = "dark";
  }
  applyTheme(savedTheme || "light");

  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Save once so the starter tasks are stored from the very first visit
  saveToLocalStorage();
  render();
})();
