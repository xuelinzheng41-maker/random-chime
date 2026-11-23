// ============================================================
// Anew 日新 v2.0.0 · 全能待办工作台 + 随机提示音专注舱 + OpenAI 兼容 AI 助手
// ============================================================

(function () {
  const STORAGE_KEY_SETTINGS = "random_chime_settings_v1";
  const STORAGE_KEY_HISTORY = "random_chime_history_v1";
  const STORAGE_KEY_AI_CONFIG = "random_chime_ai_config_v1";
  const STORAGE_KEY_AI_LAST = "random_chime_ai_last_v1";
  const STORAGE_KEY_LISTS = "anew_lists_v1";
  const STORAGE_KEY_TASKS = "anew_tasks_v1";

  const CLOCK_MODES = ["minimal", "flip", "halo"];
  const HALO_CIRCUMFERENCE = 2 * Math.PI * 112;
  const REST_CIRCUMFERENCE = 2 * Math.PI * 96;

  const AI_PRESETS = {
    custom: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
    ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" },
  };

  const PRIORITY_WEIGHT = { p1: 1, p2: 2, p3: 3, p4: 4 };
  const PRIORITY_LABEL = { p1: "P1 重要紧急", p2: "P2 重要不紧急", p3: "P3 紧急不重要", p4: "P4 日常" };

  const defaultSettings = {
    theme: "cream",
    clockMode: "minimal",
    focusMinutes: 90,
    minGapMinutes: 3,
    maxGapMinutes: 5,
    restSeconds: 10,
    chimePreset: "bowl",
    chimeVolume: 75,
    ambientMode: "none",
    ambientVolume: 30,
    hideNextHint: true,
    currentGoal: "",
    boundTaskId: "",
    fullscreenScale: 1,
    sidebarCollapsed: false,
    lightTheme: "cream",
    darkTheme: "dark",
    followSystem: false,
  };

  const defaultAiConfig = {
    provider: "custom",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    scope: "today",
  };

  const defaultLists = [
    { id: "list_research", name: "学术科研", icon: "🎓" },
    { id: "list_code", name: "编程开发", icon: "💻" },
    { id: "list_study", name: "阅读学习", icon: "📖" },
    { id: "list_life", name: "生活日常", icon: "🌿" },
  ];

  function todayKey(d = new Date()) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function addDaysKey(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return todayKey(d);
  }

  function safeParse(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function safeSave(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    return md + " " + hm;
  }

  function formatDurationCN(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) return secs + " 秒";
    if (secs === 0) return mins + " 分钟";
    return mins + " 分 " + secs + " 秒";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const settings = { ...defaultSettings, ...safeParse(STORAGE_KEY_SETTINGS, {}) };
  let history = safeParse(STORAGE_KEY_HISTORY, []);
  if (!Array.isArray(history)) history = [];
  const aiConfig = { ...defaultAiConfig, ...safeParse(STORAGE_KEY_AI_CONFIG, {}) };
  let lastAiReport = safeParse(STORAGE_KEY_AI_LAST, null);

  let customLists = safeParse(STORAGE_KEY_LISTS, null);
  if (!Array.isArray(customLists) || customLists.length === 0) {
    customLists = defaultLists;
    safeSave(STORAGE_KEY_LISTS, customLists);
  }

  let tasks = safeParse(STORAGE_KEY_TASKS, null);
  if (!Array.isArray(tasks)) {
    const tKey = todayKey();
    tasks = [
      {
        id: "task_welcome_1",
        title: "体验 Anew 日新：点击右侧「▶ 专注」开启 90 分钟随机提示音专注",
        listId: "list_study",
        priority: "p1",
        status: "todo",
        dueDate: tKey,
        estMinutes: 90,
        focusedSeconds: 0,
        focusSessions: 0,
        subtasks: [
          { id: "sub_1", title: "在专注舱点击倒计时切换 3D 翻页时钟与呼吸光环", done: false },
          { id: "sub_2", title: "按 F11 体验纯享全屏时钟与鼠标滚轮缩放", done: false },
        ],
        note: "Anew（日新）将待办清单与神经科学 Gap Effect 随机微休息无缝打通。",
        createdAt: Date.now() - 3600000,
        completedAt: null,
      },
      {
        id: "task_welcome_2",
        title: "试用四象限矩阵与看板视图规划本周核心任务",
        listId: "list_research",
        priority: "p2",
        status: "in_progress",
        dueDate: tKey,
        estMinutes: 45,
        focusedSeconds: 0,
        focusSessions: 0,
        subtasks: [
          { id: "sub_3", title: "在详情面板点击「✦ AI 拆解步骤」自动生成子任务", done: false },
        ],
        note: "",
        createdAt: Date.now() - 1800000,
        completedAt: null,
      },
    ];
    safeSave(STORAGE_KEY_TASKS, tasks);
  }

  function saveSettings() { safeSave(STORAGE_KEY_SETTINGS, settings); }
  function saveHistory() { safeSave(STORAGE_KEY_HISTORY, history); }
  function saveAiConfig() { safeSave(STORAGE_KEY_AI_CONFIG, aiConfig); }
  function saveLists() { safeSave(STORAGE_KEY_LISTS, customLists); }
  function saveTasks() { safeSave(STORAGE_KEY_TASKS, tasks); }

  // 工作区视图与计时状态
  const appView = {
    currentView: "tasks", // "tasks" | "matrix" | "kanban" | "calendar" | "focus"
    taskFilter: "today", // "today" | "next7" | "all" | "inbox" | "completed" | listId
    priorityFilter: "all",
    sortBy: "priority",
    searchQuery: "",
    completedFolded: false,
    selectedTaskId: null,
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(), // 0-11
    calSelectedDate: todayKey(),
  };

  const state = {
    phase: "idle", // "idle" | "focus" | "paused" | "rest"
    totalMs: settings.focusMinutes * 60 * 1000,
    remainingMs: settings.focusMinutes * 60 * 1000,
    sessionElapsedMs: 0,
    sessionStartedAt: 0,
    lastTickAt: 0,
    nextRestInMs: 0,
    restRemainingMs: settings.restSeconds * 1000,
    restWasManualTest: false,
    prevPhaseBeforeTest: "idle",
    sessionRests: 0,
    tickHandle: null,
    pendingRecord: null,
  };

  const $ = (id) => document.getElementById(id);
  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  // 标题栏与侧边栏 DOM
  const btnToggleSidebar = $("btnToggleSidebar");
  const brandDot = $("brandDot");
  const statusPill = $("statusPill");
  const inputGlobalSearch = $("inputGlobalSearch");
  const badgeToday = $("badgeToday");
  const badgeNext7 = $("badgeNext7");
  const badgeAll = $("badgeAll");
  const badgeInbox = $("badgeInbox");
  const badgeCompleted = $("badgeCompleted");
  const badgeFocusTimer = $("badgeFocusTimer");
  const btnShowAddList = $("btnShowAddList");
  const newListBox = $("newListBox");
  const inputNewListName = $("inputNewListName");
  const customListsNav = $("customListsNav");
  const sidebarFooter = $("sidebarFooter");
  const sfDoneCount = $("sfDoneCount");
  const sfProgressFill = $("sfProgressFill");
  const sfFocusMin = $("sfFocusMin");
  const sfRestCount = $("sfRestCount");

  // 模块视图容器
  const moduleViews = {
    tasks: $("viewTasks"),
    matrix: $("viewMatrix"),
    kanban: $("viewKanban"),
    calendar: $("viewCalendar"),
    focus: $("viewFocus"),
  };

  // 清单视图 DOM
  const currentListTitle = $("currentListTitle");
  const currentListSub = $("currentListSub");
  const selectFilterPriority = $("selectFilterPriority");
  const selectSortTasks = $("selectSortTasks");
  const inputQuickTask = $("inputQuickTask");
  const btnQuickAiBreakdown = $("btnQuickAiBreakdown");
  const btnAddQuickTask = $("btnAddQuickTask");
  const qcSelectList = $("qcSelectList");
  const qcSelectPriority = $("qcSelectPriority");
  const qcInputDate = $("qcInputDate");
  const qcSelectEst = $("qcSelectEst");
  const pendingTasksList = $("pendingTasksList");
  const completedFoldSection = $("completedFoldSection");
  const btnToggleCompletedFold = $("btnToggleCompletedFold");
  const completedFoldArrow = $("completedFoldArrow");
  const completedFoldCount = $("completedFoldCount");
  const completedTasksList = $("completedTasksList");

  // 四象限 DOM
  const mqLists = {
    p1: $("mqListP1"),
    p2: $("mqListP2"),
    p3: $("mqListP3"),
    p4: $("mqListP4"),
  };
  const mqCounts = {
    p1: $("mqCountP1"),
    p2: $("mqCountP2"),
    p3: $("mqCountP3"),
    p4: $("mqCountP4"),
  };

  // 看板 DOM
  const kbListTodo = $("kbListTodo");
  const kbListProgress = $("kbListProgress");
  const kbListDone = $("kbListDone");
  const kbCountTodo = $("kbCountTodo");
  const kbCountProgress = $("kbCountProgress");
  const kbCountDone = $("kbCountDone");

  // 日历 DOM
  const calMonthTitle = $("calMonthTitle");
  const btnCalPrev = $("btnCalPrev");
  const btnCalToday = $("btnCalToday");
  const btnCalNext = $("btnCalNext");
  const calDaysGrid = $("calDaysGrid");
  const calSelectedDateLabel = $("calSelectedDateLabel");
  const calSelectedFocusBadge = $("calSelectedFocusBadge");
  const inputCalDayTask = $("inputCalDayTask");
  const calDayTasksList = $("calDayTasksList");

  // 右侧任务检查器 DOM
  const inspectorPane = $("inspectorPane");
  const inspCheckbox = $("inspCheckbox");
  const inspStatusSelect = $("inspStatusSelect");
  const btnInspDelete = $("btnInspDelete");
  const btnCloseInspector = $("btnCloseInspector");
  const inspTitleInput = $("inspTitleInput");
  const inspFocusStats = $("inspFocusStats");
  const btnInspStartFocus = $("btnInspStartFocus");
  const inspListSelect = $("inspListSelect");
  const inspPrioritySelect = $("inspPrioritySelect");
  const inspDateInput = $("inspDateInput");
  const inspEstSelect = $("inspEstSelect");
  const inspSubtaskCount = $("inspSubtaskCount");
  const btnInspAiSubtasks = $("btnInspAiSubtasks");
  const inspSubtaskList = $("inspSubtaskList");
  const inputNewSubtask = $("inputNewSubtask");
  const inspNoteInput = $("inspNoteInput");

  // 迷你专注悬浮条 DOM
  const miniFocusBar = $("miniFocusBar");
  const mfbGoal = $("mfbGoal");
  const mfbTime = $("mfbTime");
  const mfbBtnToggle = $("mfbBtnToggle");
  const mfbBtnFinish = $("mfbBtnFinish");
  const mfbBtnExpand = $("mfbBtnExpand");

  // 专注舱 DOM
  const intervalBadge = $("intervalBadge");
  const nextChimeHint = $("nextChimeHint");
  const btnAddGoal = $("btnAddGoal");
  const goalEditor = $("goalEditor");
  const inputGoal = $("inputGoal");
  const btnSaveGoal = $("btnSaveGoal");
  const btnCancelGoal = $("btnCancelGoal");
  const goalActive = $("goalActive");
  const goalText = $("goalText");
  const btnClearGoal = $("btnClearGoal");
  const boundTaskSubtasks = $("boundTaskSubtasks");

  const clockTrigger = $("clockTrigger");
  const minimalDigits = $("minimalDigits");
  const minimalProgress = $("minimalProgress");
  const haloDigits = $("haloDigits");
  const haloArc = $("haloArc");
  const haloSub = $("haloSub");
  const modeDotButtons = Array.from(document.querySelectorAll(".mode-dot"));

  const btnToggle = $("btnToggle");
  const btnToggleLabel = $("btnToggleLabel");
  const btnReset = $("btnReset");
  const btnFinishEarly = $("btnFinishEarly");
  const btnTestRest = $("btnTestRest");

  const statsBar = $("statsBar");
  const statSessionRests = $("statSessionRests");
  const statTodayMinutes = $("statTodayMinutes");
  const statTodayRests = $("statTodayRests");

  const fsDock = $("fsDock");
  const fsBtnToggle = $("fsBtnToggle");
  const fsBtnFinish = $("fsBtnFinish");
  const fsScaleDown = $("fsScaleDown");
  const fsScaleLabel = $("fsScaleLabel");
  const fsScaleUp = $("fsScaleUp");
  const fsBtnMode = $("fsBtnMode");
  const fsBtnTheme = $("fsBtnTheme");
  const fsBtnExit = $("fsBtnExit");

  const restOverlay = $("restOverlay");
  const restCountdown = $("restCountdown");
  const restRingFg = $("restRingFg");
  const btnSkipRest = $("btnSkipRest");

  const completeOverlay = $("completeOverlay");
  const completeBadge = $("completeBadge");
  const completeTitle = $("completeTitle");
  const completeGoalLine = $("completeGoalLine");
  const completeSummary = $("completeSummary");
  const completeTaskCheckWrap = $("completeTaskCheckWrap");
  const checkboxCompleteBoundTask = $("checkboxCompleteBoundTask");
  const inputSessionNote = $("inputSessionNote");
  const btnCompleteDone = $("btnCompleteDone");
  const btnCompleteAI = $("btnCompleteAI");

  const btnBrandSettings = $("btnBrandSettings");
  const btnQuickAI = $("btnQuickAI");
  const btnTheme = $("btnTheme");
  const btnPin = $("btnPin");
  const btnFullscreen = $("btnFullscreen");
  const btnSettings = $("btnSettings");
  const btnTray = $("btnTray");
  const btnMin = $("btnMin");
  const btnMax = $("btnMax");
  const btnClose = $("btnClose");
  const drawerBackdrop = $("drawerBackdrop");
  const settingsDrawer = $("settingsDrawer");
  const btnCloseSettings = $("btnCloseSettings");
  const drawerTabs = Array.from(document.querySelectorAll(".drawer-tab"));
  const tabPanels = {
    settings: $("panelSettings"),
    history: $("panelHistory"),
    ai: $("panelAI"),
  };

  const inputFocusMinutes = $("inputFocusMinutes");
  const valFocusMinutes = $("valFocusMinutes");
  const focusPresetBtns = Array.from(document.querySelectorAll("#focusPresets .pill"));
  const inputMinGap = $("inputMinGap");
  const inputMaxGap = $("inputMaxGap");
  const valRandomRange = $("valRandomRange");
  const inputRestSeconds = $("inputRestSeconds");
  const valRestSeconds = $("valRestSeconds");
  const selectChime = $("selectChime");
  const btnPreviewChime = $("btnPreviewChime");
  const inputChimeVolume = $("inputChimeVolume");
  const valChimeVolume = $("valChimeVolume");
  const selectAmbient = $("selectAmbient");
  const inputAmbientVolume = $("inputAmbientVolume");
  const valAmbientVolume = $("valAmbientVolume");
  const toggleHideNext = $("toggleHideNext");

  const histTotalSessions = $("histTotalSessions");
  const histTotalMinutes = $("histTotalMinutes");
  const histTotalRests = $("histTotalRests");
  const historyList = $("historyList");
  const btnExportMarkdown = $("btnExportMarkdown");
  const btnClearHistory = $("btnClearHistory");

  const aiProviderBtns = Array.from(document.querySelectorAll("#aiProviderPresets .pill"));
  const inputAiBaseUrl = $("inputAiBaseUrl");
  const aiEndpointPreview = $("aiEndpointPreview");
  const inputAiModel = $("inputAiModel");
  const modelCombo = $("modelCombo");
  const btnModelDropdown = $("btnModelDropdown");
  const modelDropdown = $("modelDropdown");
  const btnFetchModels = $("btnFetchModels");
  let fetchedModels = [];
  const inputAiKey = $("inputAiKey");
  const btnToggleKeyVis = $("btnToggleKeyVis");
  const btnTestAI = $("btnTestAI");
  const aiStatusMsg = $("aiStatusMsg");
  const aiScopeBtns = Array.from(document.querySelectorAll("#aiScopePills .scope-pill"));
  const btnRunAI = $("btnRunAI");
  const aiResultMeta = $("aiResultMeta");
  const aiResultBody = $("aiResultBody");
  const btnCopyAI = $("btnCopyAI");

  // ============================================================
  // 视图导航与侧边栏渲染
  // ============================================================
  function getListName(listId) {
    if (!listId || listId === "inbox") return "📥 收集箱";
    const found = customLists.find((l) => l.id === listId);
    return found ? (found.icon || "📂") + " " + found.name : "📥 收集箱";
  }

  function populateListSelects() {
    const optionsHtml =
      '<option value="inbox">📥 收集箱</option>' +
      customLists
        .map((l) => '<option value="' + escapeHtml(l.id) + '">' + escapeHtml((l.icon || "📂") + " " + l.name) + "</option>")
        .join("");
    qcSelectList.innerHTML = optionsHtml;
    inspListSelect.innerHTML = optionsHtml;
    if (
      appView.taskFilter &&
      !["today", "next7", "all", "inbox", "completed"].includes(appView.taskFilter)
    ) {
      qcSelectList.value = appView.taskFilter;
    }
  }

  function renderSidebar() {
    const tKey = todayKey();
    const n7Key = addDaysKey(7);

    const activeTasks = tasks.filter((t) => t.status !== "done");
    const doneTasks = tasks.filter((t) => t.status === "done");

    const todayCount = activeTasks.filter((t) => !t.dueDate || t.dueDate <= tKey).length;
    const next7Count = activeTasks.filter((t) => t.dueDate && t.dueDate <= n7Key).length;
    const inboxCount = activeTasks.filter((t) => !t.listId || t.listId === "inbox").length;

    badgeToday.textContent = String(todayCount);
    badgeNext7.textContent = String(next7Count);
    badgeAll.textContent = String(activeTasks.length);
    badgeInbox.textContent = String(inboxCount);
    badgeCompleted.textContent = String(doneTasks.length);

    customListsNav.innerHTML = customLists
      .map((l) => {
        const count = activeTasks.filter((t) => t.listId === l.id).length;
        const isActive = appView.currentView === "tasks" && appView.taskFilter === l.id;
        return (
          '<button class="nav-item' +
          (isActive ? " active" : "") +
          '" data-view="tasks" data-filter="' +
          escapeHtml(l.id) +
          '">' +
          '<span class="nav-icon">' +
          escapeHtml(l.icon || "📂") +
          "</span>" +
          '<span class="nav-label">' +
          escapeHtml(l.name) +
          "</span>" +
          '<span class="nav-badge">' +
          count +
          "</span>" +
          '<span class="nav-list-del" data-del-list="' +
          escapeHtml(l.id) +
          '" title="删除清单">×</span>' +
          "</button>"
        );
      })
      .join("");

    // 高亮当前导航项
    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
      const v = btn.getAttribute("data-view");
      const f = btn.getAttribute("data-filter");
      if (v === "tasks") {
        btn.classList.toggle("active", appView.currentView === "tasks" && appView.taskFilter === f);
      } else {
        btn.classList.toggle("active", appView.currentView === v);
      }
    });

    // 今日完成度与专注概览
    const todayDone = doneTasks.filter((t) => !t.dueDate || t.dueDate === tKey || (t.completedAt && todayKey(new Date(t.completedAt)) === tKey)).length;
    const todayTotal = todayCount + todayDone;
    sfDoneCount.textContent = todayDone + " / " + todayTotal + " 完成";
    const pct = todayTotal > 0 ? Math.min(100, Math.round((todayDone / todayTotal) * 100)) : 0;
    sfProgressFill.style.width = pct + "%";
  }

  function switchMainView(viewName, filterName = null) {
    appView.currentView = viewName;
    if (filterName) {
      appView.taskFilter = filterName;
    }
    Object.keys(moduleViews).forEach((k) => {
      moduleViews[k].classList.toggle("active", k === viewName);
    });
    populateListSelects();
    renderAllViews();
    updateMiniFocusBar();
  }

  // 侧边栏点击委托
  $("sidebar").addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-del-list]");
    if (delBtn) {
      e.stopPropagation();
      const listId = delBtn.getAttribute("data-del-list");
      customLists = customLists.filter((l) => l.id !== listId);
      tasks.forEach((t) => {
        if (t.listId === listId) t.listId = "inbox";
      });
      saveLists();
      saveTasks();
      if (appView.taskFilter === listId) appView.taskFilter = "all";
      populateListSelects();
      renderAllViews();
      return;
    }

    const navBtn = e.target.closest(".nav-item");
    if (!navBtn) return;
    const v = navBtn.getAttribute("data-view");
    const f = navBtn.getAttribute("data-filter");
    switchMainView(v, f);
  });

  btnToggleSidebar.addEventListener("click", () => {
    settings.sidebarCollapsed = !settings.sidebarCollapsed;
    bodyEl.classList.toggle("sidebar-collapsed", settings.sidebarCollapsed);
    saveSettings();
  });

  btnShowAddList.addEventListener("click", () => {
    newListBox.classList.toggle("hidden");
    if (!newListBox.classList.contains("hidden")) {
      inputNewListName.value = "";
      inputNewListName.focus();
    }
  });

  inputNewListName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const name = inputNewListName.value.trim();
      if (name) {
        const icons = ["📂", "🎯", "🚀", "💡", "🔬", "🎨", "📝"];
        const icon = icons[customLists.length % icons.length];
        const newList = { id: "list_" + Date.now(), name, icon };
        customLists.push(newList);
        saveLists();
        newListBox.classList.add("hidden");
        populateListSelects();
        switchMainView("tasks", newList.id);
      }
    } else if (e.key === "Escape") {
      newListBox.classList.add("hidden");
    }
  });

  // ============================================================
  // 任务增删改查 & 视图渲染
  // ============================================================
  function createTask({ title, listId, priority, status, dueDate, estMinutes, subtasks }) {
    const newTask = {
      id: "task_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      title: title.trim(),
      listId: listId || "inbox",
      priority: priority || "p2",
      status: status || "todo",
      dueDate: dueDate || todayKey(),
      estMinutes: Number(estMinutes) || 90,
      focusedSeconds: 0,
      focusSessions: 0,
      subtasks: Array.isArray(subtasks) ? subtasks : [],
      note: "",
      createdAt: Date.now(),
      completedAt: status === "done" ? Date.now() : null,
    };
    tasks.unshift(newTask);
    saveTasks();
    renderAllViews();
    return newTask;
  }

  function toggleTaskDone(taskId, checked) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.status = checked ? "done" : "todo";
    t.completedAt = checked ? Date.now() : null;
    saveTasks();
    renderAllViews();
    if (appView.selectedTaskId === taskId) renderInspector();
  }

  function startFocusForTask(taskId) {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    settings.boundTaskId = t.id;
    settings.currentGoal = t.title;
    if (state.phase === "idle" && t.estMinutes) {
      settings.focusMinutes = Number(t.estMinutes) || 90;
      state.totalMs = settings.focusMinutes * 60 * 1000;
      state.remainingMs = state.totalMs;
    }
    if (t.status === "todo") {
      t.status = "in_progress";
      saveTasks();
    }
    saveSettings();
    renderGoalBar(false);
    syncSettingsUI();
    switchMainView("focus");
    if (state.phase !== "focus") {
      startFocus();
    }
  }

  function matchesSearch(task) {
    const q = appView.searchQuery.trim().toLowerCase();
    if (!q) return true;
    if (task.title.toLowerCase().includes(q)) return true;
    if (task.note && task.note.toLowerCase().includes(q)) return true;
    if (Array.isArray(task.subtasks) && task.subtasks.some((s) => s.title.toLowerCase().includes(q))) return true;
    return false;
  }

  function getFilteredTasks() {
    const tKey = todayKey();
    const n7Key = addDaysKey(7);
    return tasks
      .filter((t) => {
        if (!matchesSearch(t)) return false;
        if (appView.priorityFilter !== "all" && t.priority !== appView.priorityFilter) return false;
        const f = appView.taskFilter;
        if (f === "today") return !t.dueDate || t.dueDate <= tKey;
        if (f === "next7") return t.dueDate && t.dueDate <= n7Key;
        if (f === "all") return true;
        if (f === "inbox") return !t.listId || t.listId === "inbox";
        if (f === "completed") return t.status === "done";
        return t.listId === f;
      })
      .sort((a, b) => {
        if (appView.sortBy === "priority") {
          const pw = (PRIORITY_WEIGHT[a.priority] || 4) - (PRIORITY_WEIGHT[b.priority] || 4);
          if (pw !== 0) return pw;
        } else if (appView.sortBy === "dueDate") {
          const da = a.dueDate || "9999-99-99";
          const db = b.dueDate || "9999-99-99";
          if (da !== db) return da.localeCompare(db);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function renderTaskRowHtml(t) {
    const isDone = t.status === "done";
    const isSelected = appView.selectedTaskId === t.id;
    const subTotal = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
    const subDone = subTotal > 0 ? t.subtasks.filter((s) => s.done).length : 0;
    const focusMin = Math.round((t.focusedSeconds || 0) / 60);

    return (
      '<div class="task-row' +
      (isDone ? " done" : "") +
      (isSelected ? " selected" : "") +
      '" data-task-id="' +
      escapeHtml(t.id) +
      '">' +
      '<div class="task-row-left">' +
      '<input type="checkbox" class="task-checkbox" data-check-id="' +
      escapeHtml(t.id) +
      '"' +
      (isDone ? " checked" : "") +
      " />" +
      '<span class="priority-dot ' +
      escapeHtml(t.priority || "p4") +
      '"></span>' +
      '<div class="task-main-info">' +
      '<div class="task-title">' +
      escapeHtml(t.title) +
      "</div>" +
      '<div class="task-badges">' +
      '<span class="t-badge ' +
      escapeHtml(t.priority || "p4") +
      '">' +
      escapeHtml(PRIORITY_LABEL[t.priority] || "P4 日常") +
      "</span>" +
      '<span class="t-badge">' +
      escapeHtml(getListName(t.listId)) +
      "</span>" +
      (t.dueDate ? '<span class="t-badge">📅 ' + escapeHtml(t.dueDate) + "</span>" : "") +
      (subTotal > 0 ? '<span class="t-badge">☑ ' + subDone + "/" + subTotal + "</span>" : "") +
      (focusMin > 0 || (t.focusSessions || 0) > 0
        ? '<span class="t-badge focus-stat">⏱ 已专注 ' + focusMin + "m</span>"
        : "") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="task-row-actions">' +
      '<button class="btn-task-focus" data-focus-id="' +
      escapeHtml(t.id) +
      '" title="带着此任务进入随机提示音专注舱">▶ 专注</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderTasksView() {
    const titles = {
      today: ["☀️ 今日日新", "苟日新，日日新，又日新 · 聚焦今天最重要的事"],
      next7: ["📅 最近 7 天", "未来一周的计划与节点安排"],
      all: ["📌 全部待办", "所有清单中的任务全景"],
      inbox: ["📥 收集箱", "临时记录的灵感与未分类待办"],
      completed: ["✅ 已完成归档", "所有已完成的任务沉淀"],
    };
    if (titles[appView.taskFilter]) {
      currentListTitle.textContent = titles[appView.taskFilter][0];
      currentListSub.textContent = titles[appView.taskFilter][1];
    } else {
      currentListTitle.textContent = getListName(appView.taskFilter);
      currentListSub.textContent = "自定义主题清单";
    }

    const list = getFilteredTasks();
    if (appView.taskFilter === "completed") {
      pendingTasksList.innerHTML =
        list.length > 0
          ? list.map(renderTaskRowHtml).join("")
          : '<div class="empty-state">还没有已完成的任务。</div>';
      completedFoldSection.classList.add("hidden");
      return;
    }

    const pending = list.filter((t) => t.status !== "done");
    const completed = list.filter((t) => t.status === "done");

    pendingTasksList.innerHTML =
      pending.length > 0
        ? pending.map(renderTaskRowHtml).join("")
        : '<div class="empty-state">当前清单没有待办事项，在上方输入框添加一件新任务吧！</div>';

    if (completed.length > 0) {
      completedFoldSection.classList.remove("hidden");
      completedFoldCount.textContent = String(completed.length);
      completedFoldArrow.textContent = appView.completedFolded ? "▸" : "▾";
      completedTasksList.innerHTML = appView.completedFolded ? "" : completed.map(renderTaskRowHtml).join("");
    } else {
      completedFoldSection.classList.add("hidden");
    }
  }

  function renderMatrixView() {
    ["p1", "p2", "p3", "p4"].forEach((p) => {
      const list = tasks.filter((t) => t.status !== "done" && (t.priority || "p4") === p && matchesSearch(t));
      mqCounts[p].textContent = String(list.length);
      mqLists[p].innerHTML =
        list.length > 0
          ? list.map(renderTaskRowHtml).join("")
          : '<div class="empty-state">暂无此象限待办</div>';
    });
  }

  function renderKanbanView() {
    const cols = {
      todo: tasks.filter((t) => t.status === "todo" && matchesSearch(t)),
      in_progress: tasks.filter((t) => t.status === "in_progress" && matchesSearch(t)),
      done: tasks.filter((t) => t.status === "done" && matchesSearch(t)),
    };
    kbCountTodo.textContent = String(cols.todo.length);
    kbCountProgress.textContent = String(cols.in_progress.length);
    kbCountDone.textContent = String(cols.done.length);

    const renderCard = (t) => {
      const subTotal = Array.isArray(t.subtasks) ? t.subtasks.length : 0;
      const subDone = subTotal > 0 ? t.subtasks.filter((s) => s.done).length : 0;
      const focusMin = Math.round((t.focusedSeconds || 0) / 60);
      return (
        '<div class="kb-card" data-task-id="' +
        escapeHtml(t.id) +
        '">' +
        '<div class="kb-card-top">' +
        '<span class="kb-card-title">' +
        escapeHtml(t.title) +
        "</span>" +
        '<span class="priority-dot ' +
        escapeHtml(t.priority || "p4") +
        '"></span>' +
        "</div>" +
        '<div class="task-badges">' +
        '<span class="t-badge">' +
        escapeHtml(getListName(t.listId)) +
        "</span>" +
        (subTotal > 0 ? '<span class="t-badge">☑ ' + subDone + "/" + subTotal + "</span>" : "") +
        (focusMin > 0 ? '<span class="t-badge focus-stat">⏱ ' + focusMin + "m</span>" : "") +
        "</div>" +
        '<div class="kb-card-footer">' +
        '<div class="kb-move-btns">' +
        (t.status !== "todo"
          ? '<button class="kb-move-btn" data-kb-move="' + escapeHtml(t.id) + '" data-kb-to="' + (t.status === "done" ? "in_progress" : "todo") + '">←</button>'
          : "") +
        (t.status !== "done"
          ? '<button class="kb-move-btn" data-kb-move="' + escapeHtml(t.id) + '" data-kb-to="' + (t.status === "todo" ? "in_progress" : "done") + '">→</button>'
          : "") +
        "</div>" +
        '<button class="btn-task-focus" data-focus-id="' +
        escapeHtml(t.id) +
        '">▶ 专注</button>' +
        "</div>" +
        "</div>"
      );
    };

    kbListTodo.innerHTML = cols.todo.length ? cols.todo.map(renderCard).join("") : '<div class="empty-state">暂无待办</div>';
    kbListProgress.innerHTML = cols.in_progress.length ? cols.in_progress.map(renderCard).join("") : '<div class="empty-state">暂无进行中</div>';
    kbListDone.innerHTML = cols.done.length ? cols.done.map(renderCard).join("") : '<div class="empty-state">暂无已完成</div>';
  }

  function renderCalendarView() {
    const y = appView.calYear;
    const m = appView.calMonth;
    calMonthTitle.textContent = "🗓️ " + y + "年 " + (m + 1) + "月";

    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // 周一为0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const tKey = todayKey();

    let cellsHtml = "";
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(y, m, 1 - startOffset + i);
      const dKey = todayKey(cellDate);
      const isCurrentMonth = cellDate.getMonth() === m;
      const isToday = dKey === tKey;
      const isSelected = dKey === appView.calSelectedDate;

      const dayTasks = tasks.filter((t) => t.dueDate === dKey);
      const dayFocusSec = history
        .filter((h) => h.date === dKey)
        .reduce((s, h) => s + (h.actualSeconds || 0), 0);
      const dayFocusMin = Math.round(dayFocusSec / 60);

      cellsHtml +=
        '<div class="cal-day-cell' +
        (!isCurrentMonth ? " other-month" : "") +
        (isToday ? " today" : "") +
        (isSelected ? " selected" : "") +
        '" data-cal-date="' +
        dKey +
        '">' +
        '<div class="cal-day-top">' +
        "<span>" +
        cellDate.getDate() +
        "</span>" +
        (dayFocusMin > 0 ? '<span class="cal-focus-dot">⏱' + dayFocusMin + "m</span>" : "") +
        "</div>" +
        '<div class="cal-day-dots">' +
        dayTasks
          .slice(0, 3)
          .map((t) => '<div class="cal-mini-task">' + escapeHtml((t.status === "done" ? "✓ " : "") + t.title) + "</div>")
          .join("") +
        "</div>" +
        "</div>";
    }
    calDaysGrid.innerHTML = cellsHtml;

    // 右侧所选日期详情
    calSelectedDateLabel.textContent = appView.calSelectedDate + (appView.calSelectedDate === tKey ? " (今天)" : "");
    const selFocusSec = history
      .filter((h) => h.date === appView.calSelectedDate)
      .reduce((s, h) => s + (h.actualSeconds || 0), 0);
    calSelectedFocusBadge.textContent = "专注 " + Math.round(selFocusSec / 60) + " 分钟";

    const selTasks = tasks.filter((t) => t.dueDate === appView.calSelectedDate);
    calDayTasksList.innerHTML =
      selTasks.length > 0
        ? selTasks.map(renderTaskRowHtml).join("")
        : '<div class="empty-state">当天暂无排期任务，可在上方输入框直接添加。</div>';
  }

  function renderBoundTaskSubtasks() {
    if (!settings.boundTaskId) {
      boundTaskSubtasks.classList.add("hidden");
      boundTaskSubtasks.innerHTML = "";
      return;
    }
    const t = tasks.find((x) => x.id === settings.boundTaskId);
    if (!t || !Array.isArray(t.subtasks) || t.subtasks.length === 0) {
      boundTaskSubtasks.classList.add("hidden");
      boundTaskSubtasks.innerHTML = "";
      return;
    }
    boundTaskSubtasks.classList.remove("hidden");
    boundTaskSubtasks.innerHTML = t.subtasks
      .map((s) => {
        return (
          '<label class="bts-chip' +
          (s.done ? " done" : "") +
          '" data-bts-sub="' +
          escapeHtml(s.id) +
          '">' +
          '<input type="checkbox" ' +
          (s.done ? "checked" : "") +
          " />" +
          "<span>" +
          escapeHtml(s.title) +
          "</span>" +
          "</label>"
        );
      })
      .join("");
  }

  boundTaskSubtasks.addEventListener("change", (e) => {
    const chip = e.target.closest("[data-bts-sub]");
    if (!chip || !settings.boundTaskId) return;
    const subId = chip.getAttribute("data-bts-sub");
    const t = tasks.find((x) => x.id === settings.boundTaskId);
    if (!t || !Array.isArray(t.subtasks)) return;
    const sub = t.subtasks.find((s) => s.id === subId);
    if (sub) {
      sub.done = e.target.checked;
      saveTasks();
      renderBoundTaskSubtasks();
      if (appView.selectedTaskId === t.id) renderInspector();
    }
  });

  function renderInspector() {
    if (!appView.selectedTaskId) {
      inspectorPane.classList.add("hidden");
      return;
    }
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (!t) {
      appView.selectedTaskId = null;
      inspectorPane.classList.add("hidden");
      return;
    }

    inspectorPane.classList.remove("hidden");
    inspCheckbox.checked = t.status === "done";
    inspStatusSelect.value = t.status || "todo";
    inspTitleInput.value = t.title || "";
    inspFocusStats.textContent =
      Math.round((t.focusedSeconds || 0) / 60) + " 分钟 · " + (t.focusSessions || 0) + " 轮";
    inspListSelect.value = t.listId || "inbox";
    inspPrioritySelect.value = t.priority || "p2";
    inspDateInput.value = t.dueDate || "";
    inspEstSelect.value = String(t.estMinutes || 90);
    inspNoteInput.value = t.note || "";

    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const doneCount = subs.filter((s) => s.done).length;
    inspSubtaskCount.textContent = doneCount + "/" + subs.length;

    inspSubtaskList.innerHTML = subs
      .map((s) => {
        return (
          '<div class="subtask-item' +
          (s.done ? " done" : "") +
          '">' +
          '<input type="checkbox" data-sub-check="' +
          escapeHtml(s.id) +
          '" ' +
          (s.done ? "checked" : "") +
          " />" +
          "<span>" +
          escapeHtml(s.title) +
          "</span>" +
          '<button class="subtask-del" data-sub-del="' +
          escapeHtml(s.id) +
          '">×</button>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderAllViews() {
    renderSidebar();
    renderTasksView();
    renderMatrixView();
    renderKanbanView();
    renderCalendarView();
    renderBoundTaskSubtasks();
    renderInspector();
    renderStats();
  }

  // 主工作区任务点击、勾选、启动专注事件委托
  $("mainPane").addEventListener("click", (e) => {
    const checkEl = e.target.closest("[data-check-id]");
    if (checkEl) {
      e.stopPropagation();
      toggleTaskDone(checkEl.getAttribute("data-check-id"), checkEl.checked);
      return;
    }

    const focusBtn = e.target.closest("[data-focus-id]");
    if (focusBtn) {
      e.stopPropagation();
      startFocusForTask(focusBtn.getAttribute("data-focus-id"));
      return;
    }

    const kbMoveBtn = e.target.closest("[data-kb-move]");
    if (kbMoveBtn) {
      e.stopPropagation();
      const tid = kbMoveBtn.getAttribute("data-kb-move");
      const toStatus = kbMoveBtn.getAttribute("data-kb-to");
      const t = tasks.find((x) => x.id === tid);
      if (t) {
        t.status = toStatus;
        t.completedAt = toStatus === "done" ? Date.now() : null;
        saveTasks();
        renderAllViews();
      }
      return;
    }

    const calCell = e.target.closest("[data-cal-date]");
    if (calCell) {
      appView.calSelectedDate = calCell.getAttribute("data-cal-date");
      renderCalendarView();
      return;
    }

    const taskEl = e.target.closest("[data-task-id]");
    if (taskEl) {
      appView.selectedTaskId = taskEl.getAttribute("data-task-id");
      renderAllViews();
    }
  });

  // 快速添加任务
  function handleQuickAddTask() {
    const title = inputQuickTask.value.trim();
    if (!title) return;
    const created = createTask({
      title,
      listId: qcSelectList.value || "inbox",
      priority: qcSelectPriority.value || "p2",
      dueDate: qcInputDate.value || todayKey(),
      estMinutes: Number(qcSelectEst.value) || 90,
    });
    inputQuickTask.value = "";
    appView.selectedTaskId = created.id;
    renderAllViews();
  }

  btnAddQuickTask.addEventListener("click", handleQuickAddTask);
  inputQuickTask.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleQuickAddTask();
  });

  selectFilterPriority.addEventListener("change", (e) => {
    appView.priorityFilter = e.target.value;
    renderTasksView();
  });

  selectSortTasks.addEventListener("change", (e) => {
    appView.sortBy = e.target.value;
    renderTasksView();
  });

  inputGlobalSearch.addEventListener("input", (e) => {
    appView.searchQuery = e.target.value;
    renderAllViews();
  });

  btnToggleCompletedFold.addEventListener("click", () => {
    appView.completedFolded = !appView.completedFolded;
    renderTasksView();
  });

  // 四象限与看板内联添加
  document.querySelectorAll(".mq-input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && inp.value.trim()) {
        createTask({
          title: inp.value.trim(),
          priority: inp.getAttribute("data-mq-priority") || "p2",
          dueDate: todayKey(),
        });
        inp.value = "";
      }
    });
  });

  document.querySelectorAll(".kb-input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && inp.value.trim()) {
        createTask({
          title: inp.value.trim(),
          status: inp.getAttribute("data-kb-status") || "todo",
          dueDate: todayKey(),
        });
        inp.value = "";
      }
    });
  });

  // 日历控制
  btnCalPrev.addEventListener("click", () => {
    appView.calMonth -= 1;
    if (appView.calMonth < 0) {
      appView.calMonth = 11;
      appView.calYear -= 1;
    }
    renderCalendarView();
  });
  btnCalNext.addEventListener("click", () => {
    appView.calMonth += 1;
    if (appView.calMonth > 11) {
      appView.calMonth = 0;
      appView.calYear += 1;
    }
    renderCalendarView();
  });
  btnCalToday.addEventListener("click", () => {
    const now = new Date();
    appView.calYear = now.getFullYear();
    appView.calMonth = now.getMonth();
    appView.calSelectedDate = todayKey(now);
    renderCalendarView();
  });
  inputCalDayTask.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inputCalDayTask.value.trim()) {
      createTask({
        title: inputCalDayTask.value.trim(),
        dueDate: appView.calSelectedDate,
      });
      inputCalDayTask.value = "";
    }
  });

  // 检查器事件
  btnCloseInspector.addEventListener("click", () => {
    appView.selectedTaskId = null;
    renderAllViews();
  });

  inspCheckbox.addEventListener("change", () => {
    if (appView.selectedTaskId) toggleTaskDone(appView.selectedTaskId, inspCheckbox.checked);
  });

  inspStatusSelect.addEventListener("change", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (!t) return;
    t.status = inspStatusSelect.value;
    t.completedAt = t.status === "done" ? Date.now() : null;
    saveTasks();
    renderAllViews();
  });

  btnInspDelete.addEventListener("click", () => {
    if (!appView.selectedTaskId) return;
    const id = appView.selectedTaskId;
    tasks = tasks.filter((x) => x.id !== id);
    if (settings.boundTaskId === id) settings.boundTaskId = "";
    appView.selectedTaskId = null;
    saveTasks();
    saveSettings();
    renderAllViews();
  });

  inspTitleInput.addEventListener("input", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (!t) return;
    t.title = inspTitleInput.value;
    if (settings.boundTaskId === t.id) {
      settings.currentGoal = t.title;
      saveSettings();
      renderGoalBar(false);
    }
    saveTasks();
    renderTasksView();
    renderMatrixView();
    renderKanbanView();
  });

  btnInspStartFocus.addEventListener("click", () => {
    if (appView.selectedTaskId) startFocusForTask(appView.selectedTaskId);
  });

  inspListSelect.addEventListener("change", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (t) { t.listId = inspListSelect.value; saveTasks(); renderAllViews(); }
  });
  inspPrioritySelect.addEventListener("change", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (t) { t.priority = inspPrioritySelect.value; saveTasks(); renderAllViews(); }
  });
  inspDateInput.addEventListener("change", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (t) { t.dueDate = inspDateInput.value; saveTasks(); renderAllViews(); }
  });
  inspEstSelect.addEventListener("change", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (t) { t.estMinutes = Number(inspEstSelect.value); saveTasks(); renderAllViews(); }
  });
  inspNoteInput.addEventListener("input", () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (t) { t.note = inspNoteInput.value; saveTasks(); }
  });

  inputNewSubtask.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inputNewSubtask.value.trim()) {
      const t = tasks.find((x) => x.id === appView.selectedTaskId);
      if (!t) return;
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      t.subtasks.push({
        id: "sub_" + Date.now() + "_" + Math.floor(Math.random() * 999),
        title: inputNewSubtask.value.trim(),
        done: false,
      });
      inputNewSubtask.value = "";
      saveTasks();
      renderAllViews();
    }
  });

  inspSubtaskList.addEventListener("click", (e) => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (!t || !Array.isArray(t.subtasks)) return;

    const check = e.target.closest("[data-sub-check]");
    if (check) {
      const sub = t.subtasks.find((s) => s.id === check.getAttribute("data-sub-check"));
      if (sub) {
        sub.done = check.checked;
        saveTasks();
        renderAllViews();
      }
      return;
    }

    const del = e.target.closest("[data-sub-del]");
    if (del) {
      const sid = del.getAttribute("data-sub-del");
      t.subtasks = t.subtasks.filter((s) => s.id !== sid);
      saveTasks();
      renderAllViews();
    }
  });

  // ============================================================
  // 3D 机械翻页时钟控制器 & 随机提示音专注舱
  // ============================================================
  const flipUnits = {};
  document.querySelectorAll(".flip-unit").forEach((el) => {
    const key = el.dataset.unit;
    flipUnits[key] = {
      el,
      value: el.querySelector(".card-top span").textContent,
      top: el.querySelector(".card-top span"),
      bottom: el.querySelector(".card-bottom span"),
      flipTop: el.querySelector(".card-flip-top span"),
      flipBottom: el.querySelector(".card-flip-bottom span"),
      timer: null,
    };
  });

  function setFlipDigit(key, nextChar, animate = true) {
    const unit = flipUnits[key];
    if (!unit || unit.value === nextChar) return;
    const prevChar = unit.value;
    unit.value = nextChar;

    if (!animate || settings.clockMode !== "flip") {
      unit.top.textContent = nextChar;
      unit.bottom.textContent = nextChar;
      unit.flipTop.textContent = nextChar;
      unit.flipBottom.textContent = nextChar;
      unit.el.classList.remove("flipping");
      return;
    }

    if (unit.timer) clearTimeout(unit.timer);
    unit.el.classList.remove("flipping");
    void unit.el.offsetWidth;

    unit.top.textContent = nextChar;
    unit.bottom.textContent = prevChar;
    unit.flipTop.textContent = prevChar;
    unit.flipBottom.textContent = nextChar;

    unit.el.classList.add("flipping");
    unit.timer = setTimeout(() => {
      unit.bottom.textContent = nextChar;
      unit.flipTop.textContent = nextChar;
      unit.el.classList.remove("flipping");
      unit.timer = null;
    }, 500);
  }

  function renderGoalBar(editing = false) {
    if (editing) {
      btnAddGoal.classList.add("hidden");
      goalActive.classList.add("hidden");
      goalEditor.classList.remove("hidden");
      inputGoal.value = settings.currentGoal || "";
      setTimeout(() => {
        inputGoal.focus();
        inputGoal.select();
      }, 20);
      return;
    }

    goalEditor.classList.add("hidden");
    if (settings.currentGoal && settings.currentGoal.trim()) {
      btnAddGoal.classList.add("hidden");
      goalActive.classList.remove("hidden");
      goalText.textContent = settings.currentGoal.trim();
    } else {
      goalActive.classList.add("hidden");
      btnAddGoal.classList.remove("hidden");
    }
    renderBoundTaskSubtasks();
  }

  function commitGoal() {
    settings.currentGoal = inputGoal.value.trim();
    saveSettings();
    renderGoalBar(false);
    updateMiniFocusBar();
  }

  btnAddGoal.addEventListener("click", () => renderGoalBar(true));
  goalText.addEventListener("click", () => renderGoalBar(true));
  btnSaveGoal.addEventListener("click", commitGoal);
  btnCancelGoal.addEventListener("click", () => renderGoalBar(false));
  btnClearGoal.addEventListener("click", () => {
    settings.currentGoal = "";
    settings.boundTaskId = "";
    saveSettings();
    renderGoalBar(false);
    updateMiniFocusBar();
  });
  inputGoal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commitGoal(); }
    else if (e.key === "Escape") { e.preventDefault(); renderGoalBar(false); }
  });

  function formatMMSS(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return {
      text: String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0"),
      mStr: String(mins).padStart(2, "0"),
      sStr: String(secs).padStart(2, "0"),
    };
  }

  function rollNextRandomIntervalMs() {
    const minSec = settings.minGapMinutes * 60;
    const maxSec = Math.max(minSec, settings.maxGapMinutes * 60);
    return Math.round((minSec + Math.random() * (maxSec - minSec)) * 1000);
  }

  function updateMiniFocusBar() {
    const inSession = state.phase === "focus" || state.phase === "paused" || state.phase === "rest";
    const { text } = formatMMSS(state.remainingMs);

    badgeFocusTimer.classList.toggle("hidden", !inSession);
    badgeFocusTimer.textContent = text;

    const showMini = inSession && appView.currentView !== "focus";
    miniFocusBar.classList.toggle("hidden", !showMini);
    if (showMini) {
      mfbGoal.textContent = (settings.currentGoal || "").trim() || "自由专注中";
      mfbTime.textContent = text;
      mfbBtnToggle.textContent = state.phase === "focus" ? "暂停" : "继续";
    }
  }

  function renderClock(animateFlip = true) {
    const { text, mStr, sStr } = formatMMSS(state.remainingMs);
    minimalDigits.textContent = text;
    haloDigits.textContent = text;

    const progress = state.totalMs > 0 ? Math.min(1, Math.max(0, 1 - state.remainingMs / state.totalMs)) : 0;
    minimalProgress.style.width = (progress * 100).toFixed(2) + "%";
    haloArc.style.strokeDashoffset = (HALO_CIRCUMFERENCE * progress).toFixed(2);

    const m1 = mStr.length > 2 ? mStr.slice(0, mStr.length - 1) : mStr[0];
    const m2 = mStr[mStr.length - 1];
    setFlipDigit("m1", m1, animateFlip);
    setFlipDigit("m2", m2, animateFlip);
    setFlipDigit("s1", sStr[0], animateFlip);
    setFlipDigit("s2", sStr[1], animateFlip);

    updateMiniFocusBar();

    if (window.desktopAPI) {
      const label =
        state.phase === "focus"
          ? "Anew 日新 · 专注中 " + text
          : state.phase === "rest"
          ? "Anew 日新 · 闭眼微休息中"
          : state.phase === "paused"
          ? "Anew 日新 · 已暂停 " + text
          : "Anew 日新 · 准备专注";
      window.desktopAPI.updateTrayTooltip(label);
    }
  }

  function renderMeta() {
    intervalBadge.textContent =
      "随机微休息 · " +
      settings.minGapMinutes +
      "–" +
      settings.maxGapMinutes +
      " 分钟 / 闭眼 " +
      settings.restSeconds +
      " 秒";

    if (!settings.hideNextHint && (state.phase === "focus" || state.phase === "paused") && state.nextRestInMs > 0) {
      nextChimeHint.classList.remove("hidden");
      nextChimeHint.textContent = "下次提示约 " + formatMMSS(state.nextRestInMs).text;
    } else {
      nextChimeHint.classList.add("hidden");
    }
  }

  function renderPhaseUI() {
    const running = state.phase === "focus";
    const inSession = state.phase === "focus" || state.phase === "paused";
    bodyEl.classList.toggle("is-running", running);
    brandDot.classList.toggle("running", running);
    btnToggle.classList.toggle("running", running);
    btnFinishEarly.classList.toggle("hidden", !inSession);
    fsBtnFinish.classList.toggle("hidden", !inSession);
    fsBtnToggle.classList.toggle("running", running);

    statusPill.classList.remove("focusing", "resting");
    if (state.phase === "focus") {
      statusPill.textContent = "深度专注中";
      statusPill.classList.add("focusing");
      btnToggleLabel.textContent = "暂停专注";
      fsBtnToggle.textContent = "暂停专注";
      haloSub.textContent = "保持专注 · 静候提示音";
    } else if (state.phase === "rest") {
      statusPill.textContent = "闭眼微休息";
      statusPill.classList.add("resting");
      btnToggleLabel.textContent = "微休息中";
      fsBtnToggle.textContent = "微休息中";
      haloSub.textContent = "大脑神经重放中";
    } else if (state.phase === "paused") {
      statusPill.textContent = "已暂停";
      btnToggleLabel.textContent = "继续专注";
      fsBtnToggle.textContent = "继续专注";
      haloSub.textContent = "点击继续专注";
    } else {
      statusPill.textContent = "准备专注";
      btnToggleLabel.textContent = "开始专注";
      fsBtnToggle.textContent = "开始专注";
      haloSub.textContent = "深度专注周期";
    }

    if (window.desktopAPI) {
      window.desktopAPI.setPreventSleep(state.phase === "focus" || state.phase === "rest");
    }
    renderMeta();
    updateMiniFocusBar();
  }

  function renderStats() {
    const today = todayKey();
    let todaySec = Math.floor(state.sessionElapsedMs / 1000);
    let todayRests = state.sessionRests;

    history.forEach((item) => {
      if (item.date === today) {
        todaySec += item.actualSeconds || 0;
        todayRests += item.restsCompleted || 0;
      }
    });

    const minVal = Math.floor(todaySec / 60);
    statSessionRests.textContent = state.sessionRests + " 次";
    statTodayMinutes.textContent = minVal + " 分钟";
    statTodayRests.textContent = todayRests + " 次";
    sfFocusMin.textContent = String(minVal);
    sfRestCount.textContent = String(todayRests);
  }

  const THEMES = [{"id":"snow","name":"纯净白","mode":"light","bg":"#ffffff","side":"#f7f8fa","text":"#1f2328","acc":"#2f6feb"},{"id":"cream","name":"宣纸米白","mode":"light","bg":"#f6f3ec","side":"#f0ece2","text":"#2d2a26","acc":"#c47b5a"},{"id":"mist","name":"雾霾蓝","mode":"light","bg":"#eef2f6","side":"#e6ecf2","text":"#1e2a36","acc":"#4a7bab"},{"id":"mint","name":"薄荷绿","mode":"light","bg":"#eef4f0","side":"#e5efe8","text":"#1f2d25","acc":"#3d8b63"},{"id":"sakura","name":"樱花粉","mode":"light","bg":"#f8f1f2","side":"#f3e8ea","text":"#33262a","acc":"#c9677f"},{"id":"dark","name":"暖灰夜间","mode":"dark","bg":"#141413","side":"#191816","text":"#ede9e0","acc":"#d48c6a"},{"id":"graphite","name":"石墨深灰","mode":"dark","bg":"#17181b","side":"#1b1c20","text":"#e6e8eb","acc":"#6b9cf5"},{"id":"midnight","name":"午夜深蓝","mode":"dark","bg":"#0f1623","side":"#121a28","text":"#e3e9f3","acc":"#7aa2f7"},{"id":"oled","name":"纯黑 OLED","mode":"dark","bg":"#000000","side":"#060606","text":"#ededed","acc":"#6f8cff"}];
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function findTheme(id) { return THEMES.find((t) => t.id === id) || THEMES[1]; }

  function applyTheme(themeId) {
    const t = findTheme(themeId);
    settings.theme = t.id;
    if (t.mode === "dark") settings.darkTheme = t.id; else settings.lightTheme = t.id;
    htmlEl.setAttribute("data-theme", t.id);
    htmlEl.setAttribute("data-mode", t.mode);
    if (window.desktopAPI) window.desktopAPI.setThemeBg(t.bg);
    saveSettings();
    renderThemePickers();
  }

  function toggleThemeMode() {
    settings.followSystem = false;
    const cur = findTheme(settings.theme);
    applyTheme(cur.mode === "dark" ? settings.lightTheme || "cream" : settings.darkTheme || "dark");
  }

  function applySystemTheme() {
    if (!settings.followSystem || !systemDark) return;
    applyTheme(systemDark.matches ? settings.darkTheme || "dark" : settings.lightTheme || "cream");
  }
  if (systemDark) systemDark.addEventListener("change", applySystemTheme);

  function renderThemePickers() {
    document.querySelectorAll("[data-theme-grid]").forEach((grid) => {
      const mode = grid.getAttribute("data-theme-grid");
      grid.innerHTML = THEMES.filter((t) => t.mode === mode).map((t) =>
        '<button type="button" class="theme-swatch' + (t.id === settings.theme ? " active" : "") + '" data-theme-id="' + t.id + '">' +
        '<div class="swatch-preview" style="background:' + t.bg + '">' +
        '<div class="swatch-side" style="background:' + t.side + '"></div>' +
        '<div class="swatch-main"><div class="swatch-line" style="background:' + t.text + ';width:70%;opacity:.75"></div>' +
        '<div class="swatch-line" style="background:' + t.acc + ';width:45%"></div></div></div>' +
        '<div class="swatch-name">' + t.name + "</div></button>").join("");
    });
    const nameEl = document.getElementById("valThemeName");
    if (nameEl) nameEl.textContent = findTheme(settings.theme).name;
    const fsT = document.getElementById("toggleFollowSystem");
    if (fsT) fsT.checked = Boolean(settings.followSystem);
  }

  document.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-theme-id]");
    const pop = document.getElementById("themePopover");
    if (sw) {
      settings.followSystem = false;
      applyTheme(sw.getAttribute("data-theme-id"));
      return;
    }
    if (pop && !pop.classList.contains("hidden") && !pop.contains(e.target)) pop.classList.add("hidden");
  });

  function applyClockMode(mode, withFeedback = false) {
    if (!CLOCK_MODES.includes(mode)) mode = "minimal";
    settings.clockMode = mode;
    htmlEl.setAttribute("data-clock-mode", mode);
    modeDotButtons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderClock(false);
    if (withFeedback) window.soundEngine.playSoftClick();
    saveSettings();
  }

  function cycleClockMode() {
    const idx = CLOCK_MODES.indexOf(settings.clockMode);
    applyClockMode(CLOCK_MODES[(idx + 1) % CLOCK_MODES.length], true);
  }

  // 计时循环
  function startTickLoop() {
    if (state.tickHandle) return;
    state.lastTickAt = Date.now();
    state.tickHandle = setInterval(onTick, 200);
  }

  function stopTickLoop() {
    if (state.tickHandle) {
      clearInterval(state.tickHandle);
      state.tickHandle = null;
    }
  }

  function startFocus() {
    window.soundEngine.ensureContext();
    if (state.phase === "idle") {
      state.totalMs = settings.focusMinutes * 60 * 1000;
      state.remainingMs = state.totalMs;
      state.sessionElapsedMs = 0;
      state.sessionStartedAt = Date.now();
      state.nextRestInMs = rollNextRandomIntervalMs();
      state.sessionRests = 0;
    }
    state.phase = "focus";
    state.lastTickAt = Date.now();
    window.soundEngine.startAmbient(settings.ambientMode, settings.ambientVolume / 100);
    renderPhaseUI();
    renderClock(false);
    startTickLoop();
  }

  function pauseFocus() {
    if (state.phase !== "focus") return;
    state.phase = "paused";
    stopTickLoop();
    window.soundEngine.stopAmbient();
    renderPhaseUI();
  }

  function toggleFocus() {
    if (state.phase === "rest") {
      finishMicroRest(true);
      return;
    }
    if (state.phase === "focus") pauseFocus();
    else startFocus();
  }

  function resetTimer() {
    stopTickLoop();
    window.soundEngine.stopAmbient();
    restOverlay.classList.remove("visible");
    completeOverlay.classList.remove("visible");
    state.phase = "idle";
    state.totalMs = settings.focusMinutes * 60 * 1000;
    state.remainingMs = state.totalMs;
    state.sessionElapsedMs = 0;
    state.sessionStartedAt = 0;
    state.nextRestInMs = 0;
    state.sessionRests = 0;
    state.pendingRecord = null;
    renderPhaseUI();
    renderClock(false);
    renderStats();
  }

  function openFinishDialog(endedEarly) {
    stopTickLoop();
    window.soundEngine.stopAmbient();
    restOverlay.classList.remove("visible");

    const actualSeconds = Math.max(1, Math.round(state.sessionElapsedMs / 1000));
    const goal = (settings.currentGoal || "").trim();

    state.pendingRecord = {
      id: "rec_" + Date.now(),
      date: todayKey(),
      startedAt: state.sessionStartedAt || Date.now() - actualSeconds * 1000,
      endedAt: Date.now(),
      goal: goal || "自由专注",
      boundTaskId: settings.boundTaskId || "",
      plannedMinutes: settings.focusMinutes,
      actualSeconds,
      restsCompleted: state.sessionRests,
      endedEarly: Boolean(endedEarly),
      note: "",
    };

    if (!endedEarly) {
      window.soundEngine.playSessionComplete(settings.chimePreset, settings.chimeVolume / 100);
    } else {
      window.soundEngine.playRestEnd(settings.chimePreset, settings.chimeVolume / 100);
    }

    state.phase = "idle";
    renderPhaseUI();

    completeBadge.textContent = endedEarly ? "提前结束" : "周期完成";
    completeTitle.textContent = endedEarly ? "已记录本次专注" : "完成了一次深度专注";
    if (goal) {
      completeGoalLine.textContent = "目标：" + goal;
      completeGoalLine.classList.remove("hidden");
    } else {
      completeGoalLine.classList.add("hidden");
    }

    const boundTask = settings.boundTaskId ? tasks.find((t) => t.id === settings.boundTaskId) : null;
    if (boundTask && boundTask.status !== "done") {
      completeTaskCheckWrap.classList.remove("hidden");
      checkboxCompleteBoundTask.checked = !endedEarly;
    } else {
      completeTaskCheckWrap.classList.add("hidden");
      checkboxCompleteBoundTask.checked = false;
    }

    completeSummary.textContent =
      "本次实际专注 " +
      formatDurationCN(actualSeconds) +
      "（计划 " +
      settings.focusMinutes +
      " 分钟），完成 " +
      state.sessionRests +
      " 次大脑重放微休息。";

    inputSessionNote.value = "";
    completeOverlay.classList.add("visible");
    completeOverlay.setAttribute("aria-hidden", "false");
  }

  function savePendingRecord(openAiAfter = false) {
    if (state.pendingRecord) {
      state.pendingRecord.note = inputSessionNote.value.trim();
      history.unshift(state.pendingRecord);
      if (history.length > 250) history = history.slice(0, 250);
      saveHistory();

      // 将专注时长与轮次同步累加到绑定的 Todo 任务
      if (state.pendingRecord.boundTaskId) {
        const t = tasks.find((x) => x.id === state.pendingRecord.boundTaskId);
        if (t) {
          t.focusedSeconds = (t.focusedSeconds || 0) + (state.pendingRecord.actualSeconds || 0);
          t.focusSessions = (t.focusSessions || 0) + 1;
          if (checkboxCompleteBoundTask.checked) {
            t.status = "done";
            t.completedAt = Date.now();
          }
          saveTasks();
        }
      }
      state.pendingRecord = null;
    }
    completeOverlay.classList.remove("visible");
    completeOverlay.setAttribute("aria-hidden", "true");
    resetTimer();
    renderAllViews();
    renderHistoryPanel();
    if (openAiAfter) {
      openDrawer("ai");
    }
  }

  function triggerMicroRest(isManualTest = false) {
    state.restWasManualTest = isManualTest;
    state.prevPhaseBeforeTest = state.phase;
    state.phase = "rest";
    state.restRemainingMs = settings.restSeconds * 1000;
    state.lastTickAt = Date.now();

    window.soundEngine.duckAmbient(true);
    window.soundEngine.playRestStart(settings.chimePreset, settings.chimeVolume / 100);

    restOverlay.classList.add("visible");
    restOverlay.setAttribute("aria-hidden", "false");
    updateRestOverlayVisual();
    renderPhaseUI();
    startTickLoop();
  }

  function updateRestOverlayVisual() {
    const total = settings.restSeconds * 1000;
    const secLeft = Math.max(0, Math.ceil(state.restRemainingMs / 1000));
    restCountdown.textContent = String(secLeft);
    const ratio = total > 0 ? Math.min(1, Math.max(0, 1 - state.restRemainingMs / total)) : 1;
    restRingFg.style.strokeDashoffset = (REST_CIRCUMFERENCE * ratio).toFixed(2);
  }

  function finishMicroRest(skipped = false) {
    restOverlay.classList.remove("visible");
    restOverlay.setAttribute("aria-hidden", "true");

    if (!skipped) {
      window.soundEngine.playRestEnd(settings.chimePreset, settings.chimeVolume / 100);
      if (!state.restWasManualTest) {
        state.sessionRests += 1;
        renderStats();
      }
    }

    if (state.restWasManualTest) {
      state.restWasManualTest = false;
      if (state.prevPhaseBeforeTest === "focus") {
        state.phase = "focus";
        state.lastTickAt = Date.now();
        window.soundEngine.duckAmbient(false);
      } else {
        state.phase = state.prevPhaseBeforeTest;
        stopTickLoop();
      }
      renderPhaseUI();
      return;
    }

    state.nextRestInMs = rollNextRandomIntervalMs();
    state.phase = "focus";
    state.lastTickAt = Date.now();
    window.soundEngine.duckAmbient(false);
    renderPhaseUI();
  }

  let lastRenderedSec = -1;
  let lastRenderedMin = -1;

  function onTick() {
    const now = Date.now();
    const dt = Math.min(2000, Math.max(0, now - state.lastTickAt));
    state.lastTickAt = now;

    if (state.phase === "focus") {
      state.remainingMs = Math.max(0, state.remainingMs - dt);
      state.sessionElapsedMs += dt;
      state.nextRestInMs -= dt;

      const currentSec = Math.ceil(state.remainingMs / 1000);
      if (currentSec !== lastRenderedSec) {
        lastRenderedSec = currentSec;
        renderClock(true);
        renderMeta();
      }

      const elapsedMin = Math.floor(state.sessionElapsedMs / 60000);
      if (elapsedMin !== lastRenderedMin) {
        lastRenderedMin = elapsedMin;
        renderStats();
      }

      if (state.remainingMs <= 0) {
        openFinishDialog(false);
        return;
      }

      if (state.nextRestInMs <= 0 && state.remainingMs > 25000) {
        triggerMicroRest(false);
      }
    } else if (state.phase === "rest") {
      state.restRemainingMs = Math.max(0, state.restRemainingMs - dt);
      updateRestOverlayVisual();
      if (state.restRemainingMs <= 0) {
        finishMicroRest(false);
      }
    }
  }

  // 迷你专注悬浮条按钮
  mfbBtnToggle.addEventListener("click", toggleFocus);
  mfbBtnFinish.addEventListener("click", () => {
    if (state.phase === "focus" || state.phase === "paused") openFinishDialog(true);
  });
  mfbBtnExpand.addEventListener("click", () => switchMainView("focus"));

  // ============================================================
  // 专注历史记录 & Markdown 日报导出
  // ============================================================
  function renderHistoryPanel() {
    const totalSessions = history.length;
    const totalSec = history.reduce((sum, r) => sum + (r.actualSeconds || 0), 0);
    const totalRests = history.reduce((sum, r) => sum + (r.restsCompleted || 0), 0);

    histTotalSessions.textContent = String(totalSessions);
    histTotalMinutes.textContent = Math.round(totalSec / 60) + "m";
    histTotalRests.textContent = String(totalRests);

    if (history.length === 0) {
      historyList.innerHTML =
        '<div class="empty-state">还没有专注记录，完成或提前结束一次专注后会自动保存在这里。</div>';
      return;
    }

    historyList.innerHTML = history
      .map((item) => {
        const badge = item.endedEarly
          ? '<span class="history-badge early">提前结束</span>'
          : '<span class="history-badge">完整完成</span>';
        const noteHtml = item.note
          ? '<div class="history-note">' + escapeHtml(item.note) + "</div>"
          : "";
        return (
          '<div class="history-item">' +
          '<div class="history-item-top">' +
          '<div class="history-goal">' + escapeHtml(item.goal || "自由专注") + "</div>" +
          '<button class="history-del" data-del-id="' + escapeHtml(item.id) + '" title="删除此条">×</button>' +
          "</div>" +
          '<div class="history-meta">' +
          badge +
          "<span>" + formatDurationCN(item.actualSeconds || 0) + " / 计划 " + (item.plannedMinutes || 90) + " 分钟</span>" +
          "<span>· 重放 " + (item.restsCompleted || 0) + " 次</span>" +
          "<span>· " + formatDateTime(item.endedAt || item.startedAt) + "</span>" +
          "</div>" +
          noteHtml +
          "</div>"
        );
      })
      .join("");
  }

  historyList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-del-id");
    history = history.filter((item) => item.id !== id);
    saveHistory();
    renderHistoryPanel();
    renderStats();
  });

  btnExportMarkdown.addEventListener("click", async () => {
    const tKey = todayKey();
    const todayHist = history.filter((h) => h.date === tKey);
    const doneToday = tasks.filter((t) => t.status === "done" && (!t.dueDate || t.dueDate === tKey));
    const pendingToday = tasks.filter((t) => t.status !== "done" && (!t.dueDate || t.dueDate <= tKey));

    const md = [
      "# Anew 日新 · 每日效率与专注日报 (" + tKey + ")",
      "",
      "## 已完成任务 (" + doneToday.length + ")",
      ...(doneToday.length ? doneToday.map((t) => "- [x] " + t.title) : ["- 暂无"]),
      "",
      "## 待推进任务 (" + pendingToday.length + ")",
      ...(pendingToday.length ? pendingToday.map((t) => "- [ ] [" + (t.priority || "p2").toUpperCase() + "] " + t.title) : ["- 暂无"]),
      "",
      "## 随机提示音专注记录 (" + todayHist.length + " 轮)",
      ...(todayHist.length
        ? todayHist.map((h) => "- " + h.goal + "：" + formatDurationCN(h.actualSeconds) + "（微休息 " + h.restsCompleted + " 次）")
        : ["- 暂无"]),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(md);
      btnExportMarkdown.textContent = "已复制日报";
      setTimeout(() => { btnExportMarkdown.textContent = "导出日报"; }, 1600);
    } catch {}
  });

  btnClearHistory.addEventListener("click", () => {
    if (history.length === 0) return;
    history = [];
    saveHistory();
    renderHistoryPanel();
    renderStats();
  });

  // ============================================================
  // AI 日新助手（任务拆解 + 待办&专注双维复盘）
  // ============================================================
  function computeEndpointPreview(url) {
    const cleaned = String(url || "").trim().replace(/\/+$/, "");
    if (!cleaned) return "";
    if (cleaned.endsWith("/chat/completions")) return "实际请求：" + cleaned;
    if (/\/v\d+$/i.test(cleaned)) return "实际请求：" + cleaned + "/chat/completions";
    return "实际请求：" + cleaned + "/v1/chat/completions";
  }

  function syncAiUI() {
    inputAiBaseUrl.value = aiConfig.baseUrl || "";
    aiEndpointPreview.textContent = computeEndpointPreview(aiConfig.baseUrl);
    inputAiModel.value = aiConfig.model || "";
    inputAiKey.value = aiConfig.apiKey || "";
    aiProviderBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.provider === aiConfig.provider);
    });
    aiScopeBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.scope === aiConfig.scope);
    });
    if (lastAiReport && lastAiReport.content) {
      aiResultMeta.textContent = "上次分析 · " + formatDateTime(lastAiReport.createdAt);
      aiResultBody.innerHTML = renderSimpleMarkdown(lastAiReport.content);
      btnCopyAI.classList.remove("hidden");
    }
  }

  function setAiStatus(text, type = "") {
    aiStatusMsg.textContent = text;
    aiStatusMsg.className = "ai-status-msg" + (type ? " " + type : "");
  }

  function renderSimpleMarkdown(md) {
    const lines = escapeHtml(md).split(/\r?\n/);
    let html = "";
    let inList = false;

    const inlineFormat = (s) =>
      s
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inList) { html += "</ul>"; inList = false; }
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<h4>" + inlineFormat(line.replace(/^#{1,4}\s+/, "")) + "</h4>";
      } else if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inlineFormat(line.replace(/^([-*•]|\d+\.)\s+/, "")) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<p>" + inlineFormat(line) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    return html || "<p>（无返回内容）</p>";
  }

  // 调用 AI 将任务拆解为 3-6 条可执行子任务
  async function requestAiSubtasksForTitle(taskTitle) {
    if (!window.desktopAPI || !window.desktopAPI.aiChat) return null;
    const prompt =
      "请把以下任务拆解为 3 到 5 个具体、可立即执行的子步骤，每行只输出一个步骤标题（不要编号、不要多余解释）：\n任务：" +
      taskTitle;
    const res = await window.desktopAPI.aiChat({
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      messages: [
        { role: "system", content: "你是一个极简高效的任务拆解助手。只按行输出具体的执行步骤，每行一条，不要序号和额外说明。" },
        { role: "user", content: prompt },
      ],
    });
    if (!res.ok) {
      openDrawer("ai");
      setAiStatus(res.error || "AI 拆解失败，请先配置 OpenAI 兼容接口。", "err");
      return null;
    }
    const lines = res.content
      .split(/\r?\n/)
      .map((l) => l.replace(/^([-*•]|\d+[.、)])\s*/, "").trim())
      .filter((l) => l.length > 0 && l.length <= 80)
      .slice(0, 6);
    return lines.map((title, idx) => ({
      id: "sub_" + Date.now() + "_" + idx,
      title,
      done: false,
    }));
  }

  btnQuickAiBreakdown.addEventListener("click", async () => {
    const title = inputQuickTask.value.trim();
    if (!title) {
      inputQuickTask.focus();
      return;
    }
    btnQuickAiBreakdown.disabled = true;
    btnQuickAiBreakdown.textContent = "✦ 拆解中...";
    try {
      const subtasks = await requestAiSubtasksForTitle(title);
      if (subtasks) {
        const created = createTask({
          title,
          listId: qcSelectList.value || "inbox",
          priority: qcSelectPriority.value || "p2",
          dueDate: qcInputDate.value || todayKey(),
          estMinutes: Number(qcSelectEst.value) || 90,
          subtasks,
        });
        inputQuickTask.value = "";
        appView.selectedTaskId = created.id;
        renderAllViews();
      }
    } finally {
      btnQuickAiBreakdown.disabled = false;
      btnQuickAiBreakdown.textContent = "✦ AI 拆解";
    }
  });

  btnInspAiSubtasks.addEventListener("click", async () => {
    const t = tasks.find((x) => x.id === appView.selectedTaskId);
    if (!t) return;
    btnInspAiSubtasks.disabled = true;
    btnInspAiSubtasks.textContent = "✦ 拆解中...";
    try {
      const subtasks = await requestAiSubtasksForTitle(t.title);
      if (subtasks && subtasks.length > 0) {
        if (!Array.isArray(t.subtasks)) t.subtasks = [];
        t.subtasks.push(...subtasks);
        saveTasks();
        renderAllViews();
      }
    } finally {
      btnInspAiSubtasks.disabled = false;
      btnInspAiSubtasks.textContent = "✦ AI 拆解步骤";
    }
  });

  function renderModelDropdown(filterText = "") {
    if (fetchedModels.length === 0) {
      modelDropdown.innerHTML =
        '<div class="model-option-empty">尚未拉取模型，请先点击右上角「拉取模型列表」</div>';
      return;
    }
    const q = filterText.trim().toLowerCase();
    const list = q ? fetchedModels.filter((m) => m.toLowerCase().includes(q)) : fetchedModels;
    if (list.length === 0) {
      modelDropdown.innerHTML = '<div class="model-option-empty">没有匹配的模型，可直接回车使用当前输入</div>';
      return;
    }
    modelDropdown.innerHTML = list
      .map((id) => {
        const selected = id === aiConfig.model ? " selected" : "";
        return (
          '<button type="button" class="model-option' +
          selected +
          '" data-model-id="' +
          escapeHtml(id) +
          '">' +
          escapeHtml(id) +
          "</button>"
        );
      })
      .join("");
  }

  function openModelDropdown(showAll = false) {
    renderModelDropdown(showAll ? "" : inputAiModel.value);
    modelDropdown.classList.remove("hidden");
  }

  function closeModelDropdown() {
    modelDropdown.classList.add("hidden");
  }

  inputAiBaseUrl.addEventListener("input", (e) => {
    aiConfig.baseUrl = e.target.value.trim();
    aiEndpointPreview.textContent = computeEndpointPreview(aiConfig.baseUrl);
    saveAiConfig();
  });

  btnFetchModels.addEventListener("click", async () => {
    if (!window.desktopAPI || !window.desktopAPI.aiModels) return;
    setAiStatus("正在拉取可用模型列表...", "");
    btnFetchModels.disabled = true;
    try {
      const res = await window.desktopAPI.aiModels({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
      });
      if (res.ok && res.models.length > 0) {
        fetchedModels = res.models;
        setAiStatus("已拉取 " + res.models.length + " 个模型，可在下方直接点选或输入筛选。", "ok");
        openModelDropdown(true);
      } else if (res.ok) {
        setAiStatus("接口未返回模型列表，请直接手动输入模型名。", "");
      } else {
        setAiStatus(res.error || "拉取模型失败，请手动输入模型名。", "err");
      }
    } finally {
      btnFetchModels.disabled = false;
    }
  });

  inputAiModel.addEventListener("input", (e) => {
    aiConfig.model = e.target.value.trim();
    saveAiConfig();
    if (fetchedModels.length > 0) openModelDropdown(false);
  });

  inputAiModel.addEventListener("focus", () => {
    if (fetchedModels.length > 0) openModelDropdown(true);
  });

  btnModelDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
    if (modelDropdown.classList.contains("hidden")) openModelDropdown(true);
    else closeModelDropdown();
  });

  modelDropdown.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-model-id]");
    if (!opt) return;
    const id = opt.getAttribute("data-model-id");
    aiConfig.model = id;
    inputAiModel.value = id;
    saveAiConfig();
    closeModelDropdown();
  });

  document.addEventListener("click", (e) => {
    if (modelCombo && !modelCombo.contains(e.target)) closeModelDropdown();
  });

  inputAiKey.addEventListener("input", (e) => {
    aiConfig.apiKey = e.target.value.trim();
    saveAiConfig();
  });

  btnToggleKeyVis.addEventListener("click", () => {
    const isPwd = inputAiKey.type === "password";
    inputAiKey.type = isPwd ? "text" : "password";
    btnToggleKeyVis.textContent = isPwd ? "隐藏" : "显示";
  });

  aiProviderBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.provider;
      aiConfig.provider = p;
      if (AI_PRESETS[p]) {
        aiConfig.baseUrl = AI_PRESETS[p].baseUrl;
        aiConfig.model = AI_PRESETS[p].model;
      }
      saveAiConfig();
      syncAiUI();
      setAiStatus("已切换为 " + btn.textContent + " 预设，请确认 API Key。", "");
    });
  });

  aiScopeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      aiConfig.scope = btn.dataset.scope;
      saveAiConfig();
      syncAiUI();
    });
  });

  btnTestAI.addEventListener("click", async () => {
    if (!window.desktopAPI || !window.desktopAPI.aiChat) return;
    setAiStatus("正在测试模型连接...");
    btnTestAI.disabled = true;
    try {
      const res = await window.desktopAPI.aiChat({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        messages: [{ role: "user", content: "请仅回复：连接成功" }],
      });
      if (res.ok) setAiStatus("连接成功，AI 日新助手已就绪。", "ok");
      else setAiStatus(res.error || "连接失败", "err");
    } finally {
      btnTestAI.disabled = false;
    }
  });

  btnRunAI.addEventListener("click", async () => {
    if (!window.desktopAPI || !window.desktopAPI.aiChat) return;
    const today = todayKey();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const records =
      aiConfig.scope === "today"
        ? history.filter((item) => item.date === today)
        : aiConfig.scope === "7d"
        ? history.filter((item) => (item.endedAt || item.startedAt) >= sevenDaysAgo)
        : history.slice(0, 60);

    const pendingTasks = tasks.filter((t) => t.status !== "done");
    const doneTasks = tasks.filter((t) => t.status === "done");

    if (records.length === 0 && tasks.length === 0) {
      setAiStatus("当前暂无待办与专注数据，请先添加任务或完成一次专注。", "err");
      return;
    }

    const totalSec = records.reduce((s, r) => s + (r.actualSeconds || 0), 0);
    const totalRests = records.reduce((s, r) => s + (r.restsCompleted || 0), 0);

    const todoLines = pendingTasks
      .slice(0, 20)
      .map((t, i) => (i + 1) + ". [" + (t.priority || "p2").toUpperCase() + "] " + t.title + " (已专注 " + Math.round((t.focusedSeconds || 0) / 60) + "m)")
      .join("\n");

    const doneLines = doneTasks
      .slice(0, 15)
      .map((t, i) => (i + 1) + ". [已完成] " + t.title + " (投入 " + Math.round((t.focusedSeconds || 0) / 60) + "m)")
      .join("\n");

    const recordLines = records
      .slice(0, 20)
      .map((r, i) => (i + 1) + ". [" + formatDateTime(r.endedAt || r.startedAt) + "] " + r.goal + " | 专注 " + formatDurationCN(r.actualSeconds || 0) + " | 微休息 " + (r.restsCompleted || 0) + "次" + (r.note ? " | 备注：" + r.note : ""))
      .join("\n");

    const scopeName = aiConfig.scope === "today" ? "今日" : aiConfig.scope === "7d" ? "近 7 天" : "全部";
    const systemPrompt =
      "你是 Anew（日新）的 AI 效率与神经科学专注教练。请结合用户的【待办任务清单（含四象限优先级）】与【随机提示音专注记录】，用简洁温暖的中文输出 3 个部分：### 1. 日新进展与完成度亮点、### 2. 专注节奏与任务投入诊断、### 3. 接下来最值得优先专注的 1-3 件事与拆解建议。控制在 400 字以内。";

    const userPrompt =
      "请复盘我【" + scopeName + "】的待办与专注进展：\n" +
      "- 待办未完成：" + pendingTasks.length + " 项 | 已完成：" + doneTasks.length + " 项\n" +
      "- 专注轮次：" + records.length + " 次 | 累计专注时长：" + formatDurationCN(totalSec) + " | 10秒微休息重放：" + totalRests + " 次\n\n" +
      "【当前未完成待办】：\n" + (todoLines || "无") + "\n\n" +
      "【已完成任务】：\n" + (doneLines || "无") + "\n\n" +
      "【随机提示音专注明细】：\n" + (recordLines || "暂无专注记录");

    btnRunAI.disabled = true;
    btnRunAI.textContent = "AI 正在生成日新规划与复盘...";
    setAiStatus("正在请求模型分析...", "");

    try {
      const res = await window.desktopAPI.aiChat({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      if (res.ok) {
        lastAiReport = { createdAt: Date.now(), scope: scopeName, content: res.content };
        safeSave(STORAGE_KEY_AI_LAST, lastAiReport);
        aiResultMeta.textContent = scopeName + "日新复盘 · " + formatDateTime(lastAiReport.createdAt);
        aiResultBody.innerHTML = renderSimpleMarkdown(res.content);
        btnCopyAI.classList.remove("hidden");
        setAiStatus("分析完成。", "ok");
      } else {
        setAiStatus(res.error || "分析失败，请检查接口配置。", "err");
      }
    } finally {
      btnRunAI.disabled = false;
      btnRunAI.textContent = "生成 AI 日新规划与专注复盘";
    }
  });

  btnCopyAI.addEventListener("click", async () => {
    if (!lastAiReport || !lastAiReport.content) return;
    try {
      await navigator.clipboard.writeText(lastAiReport.content);
      btnCopyAI.textContent = "已复制";
      setTimeout(() => { btnCopyAI.textContent = "复制"; }, 1500);
    } catch {}
  });

  // ============================================================
  // 侧滑抽屉、全屏控制与设置绑定
  // ============================================================
  function switchDrawerTab(tabName) {
    drawerTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].classList.toggle("active", key === tabName);
    });
    if (tabName === "history") renderHistoryPanel();
    if (tabName === "ai") syncAiUI();
  }

  function openDrawer(tabName = "settings") {
    switchDrawerTab(tabName);
    bodyEl.classList.add("drawer-open");
    settingsDrawer.classList.add("open");
    drawerBackdrop.classList.add("open");
  }

  function closeDrawer() {
    bodyEl.classList.remove("drawer-open");
    settingsDrawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
    closeModelDropdown();
  }

  drawerTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchDrawerTab(tab.dataset.tab));
  });

  btnBrandSettings.addEventListener("click", () => openDrawer("settings"));
  btnQuickAI.addEventListener("click", () => openDrawer("ai"));
  btnSettings.addEventListener("click", () => openDrawer("settings"));
  statsBar.addEventListener("click", () => openDrawer("history"));
  sidebarFooter.addEventListener("click", () => openDrawer("history"));
  btnCloseSettings.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  function syncSettingsUI() {
    inputFocusMinutes.value = settings.focusMinutes;
    valFocusMinutes.textContent = settings.focusMinutes + " 分钟";
    focusPresetBtns.forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.min) === settings.focusMinutes);
    });

    inputMinGap.value = settings.minGapMinutes;
    inputMaxGap.value = settings.maxGapMinutes;
    valRandomRange.textContent = settings.minGapMinutes + " – " + settings.maxGapMinutes + " 分钟";

    inputRestSeconds.value = settings.restSeconds;
    valRestSeconds.textContent = settings.restSeconds + " 秒";

    selectChime.value = settings.chimePreset;
    inputChimeVolume.value = settings.chimeVolume;
    valChimeVolume.textContent = settings.chimeVolume + "%";

    selectAmbient.value = settings.ambientMode;
    inputAmbientVolume.value = settings.ambientVolume;
    valAmbientVolume.textContent = settings.ambientVolume + "%";

    toggleHideNext.checked = settings.hideNextHint;
    renderMeta();
  }

  clockTrigger.addEventListener("click", cycleClockMode);
  clockTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter") cycleClockMode();
  });
  modeDotButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyClockMode(btn.dataset.mode, true));
  });

  btnToggle.addEventListener("click", toggleFocus);
  btnReset.addEventListener("click", resetTimer);
  btnFinishEarly.addEventListener("click", () => {
    if (state.phase === "focus" || state.phase === "paused") openFinishDialog(true);
  });
  btnTestRest.addEventListener("click", () => {
    if (state.phase !== "rest") triggerMicroRest(true);
  });
  btnSkipRest.addEventListener("click", () => finishMicroRest(true));
  btnCompleteDone.addEventListener("click", () => savePendingRecord(false));
  btnCompleteAI.addEventListener("click", () => savePendingRecord(true));

  btnTheme.addEventListener("click", () => {
    toggleThemeMode();
  });

  if (window.desktopAPI) {
    btnMin.addEventListener("click", () => window.desktopAPI.minimize());
    if (btnMax && window.desktopAPI.toggleMaximize) {
      btnMax.addEventListener("click", () => window.desktopAPI.toggleMaximize());
    }
    btnTray.addEventListener("click", () => window.desktopAPI.hideToTray());
    btnClose.addEventListener("click", () => window.desktopAPI.closeApp());
    btnFullscreen.addEventListener("click", () => window.desktopAPI.toggleFullscreen());
    btnPin.addEventListener("click", async () => {
      const pinned = await window.desktopAPI.togglePin();
      btnPin.classList.toggle("active", pinned);
    });

    window.desktopAPI.onFullscreenChanged((isFs) => {
      bodyEl.classList.toggle("is-fullscreen", isFs);
      btnFullscreen.classList.toggle("active", isFs);
      if (isFs) {
        closeDrawer();
        bodyEl.classList.remove("fs-dock-visible");
      } else {
        bodyEl.classList.remove("fs-dock-visible");
      }
    });

    window.desktopAPI.onTrayToggleTimer(() => toggleFocus());
  }

  function applyFullscreenScale(nextScale) {
    const clamped = Math.round(Math.max(0.6, Math.min(1.7, nextScale)) * 100) / 100;
    settings.fullscreenScale = clamped;
    htmlEl.style.setProperty("--fs-scale", String(clamped));
    fsScaleLabel.textContent = Math.round(clamped * 100) + "%";
    saveSettings();
  }

  let fsDockTimer = null;
  let fsDockHovered = false;

  function scheduleHideFsDock() {
    if (fsDockTimer) clearTimeout(fsDockTimer);
    fsDockTimer = setTimeout(() => {
      if (bodyEl.classList.contains("is-fullscreen") && !fsDockHovered) {
        bodyEl.classList.remove("fs-dock-visible");
      }
    }, 2400);
  }

  function showFsDock() {
    if (!bodyEl.classList.contains("is-fullscreen")) return;
    bodyEl.classList.add("fs-dock-visible");
    scheduleHideFsDock();
  }

  window.addEventListener("mousemove", showFsDock);
  window.addEventListener("mousedown", showFsDock);
  window.addEventListener(
    "wheel",
    (e) => {
      if (!bodyEl.classList.contains("is-fullscreen")) return;
      if (settingsDrawer.classList.contains("open")) return;
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      applyFullscreenScale((settings.fullscreenScale || 1) + delta);
      showFsDock();
    },
    { passive: true }
  );

  fsDock.addEventListener("mouseenter", () => {
    fsDockHovered = true;
    if (fsDockTimer) clearTimeout(fsDockTimer);
  });
  fsDock.addEventListener("mouseleave", () => {
    fsDockHovered = false;
    scheduleHideFsDock();
  });

  fsBtnToggle.addEventListener("click", () => { toggleFocus(); showFsDock(); });
  fsBtnFinish.addEventListener("click", () => {
    if (state.phase === "focus" || state.phase === "paused") openFinishDialog(true);
  });
  fsScaleDown.addEventListener("click", () => { applyFullscreenScale((settings.fullscreenScale || 1) - 0.1); showFsDock(); });
  fsScaleUp.addEventListener("click", () => { applyFullscreenScale((settings.fullscreenScale || 1) + 0.1); showFsDock(); });
  fsScaleLabel.addEventListener("click", () => { applyFullscreenScale(1); showFsDock(); });
  fsBtnMode.addEventListener("click", () => { cycleClockMode(); showFsDock(); });
  fsBtnTheme.addEventListener("click", () => {
    toggleThemeMode();
    showFsDock();
  });
  fsBtnExit.addEventListener("click", () => {
    if (window.desktopAPI) window.desktopAPI.toggleFullscreen();
  });

  function updateFocusMinutes(min) {
    settings.focusMinutes = min;
    saveSettings();
    if (state.phase === "idle") {
      state.totalMs = min * 60 * 1000;
      state.remainingMs = state.totalMs;
      renderClock(false);
    }
    syncSettingsUI();
  }

  inputFocusMinutes.addEventListener("input", (e) => updateFocusMinutes(Number(e.target.value)));
  focusPresetBtns.forEach((btn) => {
    btn.addEventListener("click", () => updateFocusMinutes(Number(btn.dataset.min)));
  });

  inputMinGap.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    settings.minGapMinutes = v;
    if (settings.maxGapMinutes < v) settings.maxGapMinutes = v;
    saveSettings();
    syncSettingsUI();
  });

  inputMaxGap.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    settings.maxGapMinutes = v;
    if (settings.minGapMinutes > v) settings.minGapMinutes = v;
    saveSettings();
    syncSettingsUI();
  });

  inputRestSeconds.addEventListener("input", (e) => {
    settings.restSeconds = Number(e.target.value);
    saveSettings();
    syncSettingsUI();
  });

  selectChime.addEventListener("change", (e) => {
    settings.chimePreset = e.target.value;
    saveSettings();
    window.soundEngine.playRestStart(settings.chimePreset, settings.chimeVolume / 100);
  });

  btnPreviewChime.addEventListener("click", () => {
    window.soundEngine.playRestStart(settings.chimePreset, settings.chimeVolume / 100);
  });

  inputChimeVolume.addEventListener("input", (e) => {
    settings.chimeVolume = Number(e.target.value);
    saveSettings();
    syncSettingsUI();
  });

  selectAmbient.addEventListener("change", (e) => {
    settings.ambientMode = e.target.value;
    saveSettings();
    if (state.phase === "focus") {
      window.soundEngine.startAmbient(settings.ambientMode, settings.ambientVolume / 100);
    }
  });

  inputAmbientVolume.addEventListener("input", (e) => {
    settings.ambientVolume = Number(e.target.value);
    saveSettings();
    window.soundEngine.setAmbientVolume(settings.ambientVolume / 100);
    syncSettingsUI();
  });

  toggleHideNext.addEventListener("change", (e) => {
    settings.hideNextHint = e.target.checked;
    saveSettings();
    renderMeta();
  });

  window.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.code === "Space" && (appView.currentView === "focus" || bodyEl.classList.contains("is-fullscreen"))) {
      e.preventDefault();
      toggleFocus();
    } else if (e.key === "v" || e.key === "V") {
      cycleClockMode();
    } else if (e.key === "d" || e.key === "D") {
      toggleThemeMode();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      btnToggleSidebar.click();
    } else if (e.key === "Escape") {
      closeDrawer();
      if (bodyEl.classList.contains("is-fullscreen") && window.desktopAPI) {
        window.desktopAPI.toggleFullscreen();
      }
    }
  });

  btnTheme.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    document.getElementById("themePopover").classList.toggle("hidden");
  });
  document.getElementById("toggleFollowSystem").addEventListener("change", (e) => {
    settings.followSystem = e.target.checked;
    saveSettings();
    applySystemTheme();
  });

  // 初始化
  qcInputDate.value = todayKey();
  bodyEl.classList.toggle("sidebar-collapsed", Boolean(settings.sidebarCollapsed));
  applyTheme(settings.theme);
  applySystemTheme();
  applyClockMode(settings.clockMode, false);
  applyFullscreenScale(settings.fullscreenScale || 1);
  populateListSelects();
  renderGoalBar(false);
  syncSettingsUI();
  syncAiUI();
  renderHistoryPanel();
  renderPhaseUI();
  renderClock(false);
  renderAllViews();
})();
