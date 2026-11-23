// ============================================================
// 随机提示音 v1.1.0 · 主状态机、3D 翻页时钟、专注目标、历史记录与 AI 分析
// ============================================================

(function () {
  const STORAGE_KEY_SETTINGS = "random_chime_settings_v1";
  const STORAGE_KEY_HISTORY = "random_chime_history_v1";
  const STORAGE_KEY_AI_CONFIG = "random_chime_ai_config_v1";
  const STORAGE_KEY_AI_LAST = "random_chime_ai_last_v1";

  const CLOCK_MODES = ["minimal", "flip", "halo"];
  const HALO_CIRCUMFERENCE = 2 * Math.PI * 112;
  const REST_CIRCUMFERENCE = 2 * Math.PI * 96;

  const AI_PRESETS = {
    custom: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
    ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" },
  };

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
  };

  const defaultAiConfig = {
    provider: "custom",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    scope: "today",
  };

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

  function todayKey(d = new Date()) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
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

  const settings = { ...defaultSettings, ...safeParse(STORAGE_KEY_SETTINGS, {}) };
  let history = safeParse(STORAGE_KEY_HISTORY, []);
  if (!Array.isArray(history)) history = [];
  const aiConfig = { ...defaultAiConfig, ...safeParse(STORAGE_KEY_AI_CONFIG, {}) };
  let lastAiReport = safeParse(STORAGE_KEY_AI_LAST, null);

  function saveSettings() {
    safeSave(STORAGE_KEY_SETTINGS, settings);
  }
  function saveHistory() {
    safeSave(STORAGE_KEY_HISTORY, history);
  }
  function saveAiConfig() {
    safeSave(STORAGE_KEY_AI_CONFIG, aiConfig);
  }

  // 运行时状态
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

  // DOM 引用
  const $ = (id) => document.getElementById(id);
  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  const brandDot = $("brandDot");
  const statusPill = $("statusPill");
  const intervalBadge = $("intervalBadge");
  const nextChimeHint = $("nextChimeHint");

  // 目标栏
  const btnAddGoal = $("btnAddGoal");
  const goalEditor = $("goalEditor");
  const inputGoal = $("inputGoal");
  const btnSaveGoal = $("btnSaveGoal");
  const btnCancelGoal = $("btnCancelGoal");
  const goalActive = $("goalActive");
  const goalText = $("goalText");
  const btnClearGoal = $("btnClearGoal");

  // 时钟
  const clockTrigger = $("clockTrigger");
  const minimalDigits = $("minimalDigits");
  const minimalProgress = $("minimalProgress");
  const haloDigits = $("haloDigits");
  const haloArc = $("haloArc");
  const haloSub = $("haloSub");
  const modeDotButtons = Array.from(document.querySelectorAll(".mode-dot"));

  // 控制按钮
  const btnToggle = $("btnToggle");
  const btnToggleLabel = $("btnToggleLabel");
  const btnReset = $("btnReset");
  const btnFinishEarly = $("btnFinishEarly");
  const btnTestRest = $("btnTestRest");

  // 底部统计
  const statsBar = $("statsBar");
  const statSessionRests = $("statSessionRests");
  const statTodayMinutes = $("statTodayMinutes");
  const statTodayRests = $("statTodayRests");

  // 微休息遮罩
  const restOverlay = $("restOverlay");
  const restCountdown = $("restCountdown");
  const restRingFg = $("restRingFg");
  const btnSkipRest = $("btnSkipRest");

  // 结算弹窗
  const completeOverlay = $("completeOverlay");
  const completeBadge = $("completeBadge");
  const completeTitle = $("completeTitle");
  const completeGoalLine = $("completeGoalLine");
  const completeSummary = $("completeSummary");
  const inputSessionNote = $("inputSessionNote");
  const btnCompleteDone = $("btnCompleteDone");
  const btnCompleteAI = $("btnCompleteAI");

  // 标题栏与抽屉
  const btnBrandSettings = $("btnBrandSettings");
  const btnQuickAI = $("btnQuickAI");
  const btnTheme = $("btnTheme");
  const btnPin = $("btnPin");
  const btnFullscreen = $("btnFullscreen");
  const btnSettings = $("btnSettings");
  const btnTray = $("btnTray");
  const btnMin = $("btnMin");
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

  // 设置项
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

  // 历史记录 DOM
  const histTotalSessions = $("histTotalSessions");
  const histTotalMinutes = $("histTotalMinutes");
  const histTotalRests = $("histTotalRests");
  const historyList = $("historyList");
  const btnClearHistory = $("btnClearHistory");

  // AI DOM
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
  // 3D 机械翻页时钟控制器
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

  // ============================================================
  // 专注目标（+ 按钮与内联编辑）
  // ============================================================
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
  }

  function commitGoal() {
    settings.currentGoal = inputGoal.value.trim();
    saveSettings();
    renderGoalBar(false);
  }

  btnAddGoal.addEventListener("click", () => renderGoalBar(true));
  goalText.addEventListener("click", () => renderGoalBar(true));
  btnSaveGoal.addEventListener("click", commitGoal);
  btnCancelGoal.addEventListener("click", () => renderGoalBar(false));
  btnClearGoal.addEventListener("click", () => {
    settings.currentGoal = "";
    saveSettings();
    renderGoalBar(false);
  });
  inputGoal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitGoal();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderGoalBar(false);
    }
  });

  // ============================================================
  // 格式化、时钟渲染与统计
  // ============================================================
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

    if (window.desktopAPI) {
      const label =
        state.phase === "focus"
          ? "随机提示音 · 专注中 " + text
          : state.phase === "rest"
          ? "随机提示音 · 闭眼微休息中"
          : state.phase === "paused"
          ? "随机提示音 · 已暂停 " + text
          : "随机提示音 · 准备专注";
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

    // 只要已经开始专注，就显示「提前结束」按钮
    btnFinishEarly.classList.toggle("hidden", !inSession);

    statusPill.classList.remove("focusing", "resting");
    if (state.phase === "focus") {
      statusPill.textContent = "深度专注中";
      statusPill.classList.add("focusing");
      btnToggleLabel.textContent = "暂停专注";
      haloSub.textContent = "保持专注 · 静候提示音";
    } else if (state.phase === "rest") {
      statusPill.textContent = "闭眼微休息";
      statusPill.classList.add("resting");
      btnToggleLabel.textContent = "微休息中";
      haloSub.textContent = "大脑神经重放中";
    } else if (state.phase === "paused") {
      statusPill.textContent = "已暂停";
      btnToggleLabel.textContent = "继续专注";
      haloSub.textContent = "点击继续专注";
    } else {
      statusPill.textContent = "准备专注";
      btnToggleLabel.textContent = "开始专注";
      haloSub.textContent = "深度专注周期";
    }

    if (window.desktopAPI) {
      window.desktopAPI.setPreventSleep(state.phase === "focus" || state.phase === "rest");
    }
    renderMeta();
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

    statSessionRests.textContent = state.sessionRests + " 次";
    statTodayMinutes.textContent = Math.floor(todaySec / 60) + " 分钟";
    statTodayRests.textContent = todayRests + " 次";
  }

  function applyTheme(theme) {
    settings.theme = theme;
    htmlEl.setAttribute("data-theme", theme);
    if (window.desktopAPI) {
      window.desktopAPI.setThemeBg(theme === "dark");
    }
    saveSettings();
  }

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

  // ============================================================
  // 专注计时、提前结束与结算记录
  // ============================================================
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
      if (history.length > 200) history = history.slice(0, 200);
      saveHistory();
      state.pendingRecord = null;
    }
    completeOverlay.classList.remove("visible");
    completeOverlay.setAttribute("aria-hidden", "true");
    resetTimer();
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

  // ============================================================
  // 专注历史记录面板
  // ============================================================
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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

  btnClearHistory.addEventListener("click", () => {
    if (history.length === 0) return;
    history = [];
    saveHistory();
    renderHistoryPanel();
    renderStats();
  });

  // ============================================================
  // AI 进展分析面板
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
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += "<h4>" + inlineFormat(line.replace(/^#{1,4}\s+/, "")) + "</h4>";
      } else if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += "<li>" + inlineFormat(line.replace(/^([-*•]|\d+\.)\s+/, "")) + "</li>";
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += "<p>" + inlineFormat(line) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    return html || "<p>（无返回内容）</p>";
  }

  function getScopedHistory(scope) {
    const today = todayKey();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (scope === "today") {
      return history.filter((item) => item.date === today);
    }
    if (scope === "7d") {
      return history.filter((item) => (item.endedAt || item.startedAt) >= sevenDaysAgo);
    }
    return history.slice(0, 60);
  }

  async function runAiConnectionTest() {
    if (!window.desktopAPI || !window.desktopAPI.aiChat) {
      setAiStatus("当前环境不支持主进程 AI 请求。", "err");
      return;
    }
    setAiStatus("正在测试模型连接...");
    btnTestAI.disabled = true;
    try {
      const res = await window.desktopAPI.aiChat({
        baseUrl: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        messages: [{ role: "user", content: "请仅回复：连接成功" }],
      });
      if (res.ok) {
        setAiStatus("连接成功，可以开始分析你的专注进展。", "ok");
      } else {
        setAiStatus(res.error || "连接失败", "err");
      }
    } finally {
      btnTestAI.disabled = false;
    }
  }

  async function runAiProgressAnalysis() {
    if (!window.desktopAPI || !window.desktopAPI.aiChat) {
      setAiStatus("当前环境不支持主进程 AI 请求。", "err");
      return;
    }

    const records = getScopedHistory(aiConfig.scope);
    if (records.length === 0) {
      const label = aiConfig.scope === "today" ? "今天" : aiConfig.scope === "7d" ? "近 7 天" : "历史";
      setAiStatus(label + "暂无专注记录，先完成或提前结束一次专注吧。", "err");
      return;
    }

    const totalSec = records.reduce((s, r) => s + (r.actualSeconds || 0), 0);
    const totalRests = records.reduce((s, r) => s + (r.restsCompleted || 0), 0);
    const earlyCount = records.filter((r) => r.endedEarly).length;

    const recordLines = records
      .slice(0, 30)
      .map((r, i) => {
        return (
          (i + 1) +
          ". [" +
          formatDateTime(r.endedAt || r.startedAt) +
          "] 目标：" +
          (r.goal || "自由专注") +
          " | 实际：" +
          formatDurationCN(r.actualSeconds || 0) +
          "（计划 " +
          (r.plannedMinutes || 90) +
          " 分钟，" +
          (r.endedEarly ? "提前结束" : "完整完成") +
          "）| 10秒微休息：" +
          (r.restsCompleted || 0) +
          " 次" +
          (r.note ? " | 备注：" + r.note : "")
        );
      })
      .join("\n");

    const scopeName = aiConfig.scope === "today" ? "今日" : aiConfig.scope === "7d" ? "近 7 天" : "全部";
    const systemPrompt =
      "你是一位精通神经科学（间隙效应 Gap Effect 与超日节律）且温和务实的学习专注教练。请根据用户的专注记录与目标，用简洁清晰的中文输出复盘分析，包含 3 个部分：### 1. 进展与亮点、### 2. 节奏与专注诊断（关注实际时长、提前结束规律、微休息节奏）、### 3. 下一步可执行建议（给出具体时长或目标拆分建议）。避免空洞鸡汤，控制在 350 字以内。";
    const userPrompt =
      "请分析我【" +
      scopeName +
      "】的专注数据：\n" +
      "- 专注次数：" +
      records.length +
      " 次（其中提前结束 " +
      earlyCount +
      " 次）\n" +
      "- 累计专注：" +
      formatDurationCN(totalSec) +
      "\n" +
      "- 累计 10 秒闭眼微休息重放：" +
      totalRests +
      " 次\n" +
      "- 当前设定目标：" +
      (settings.currentGoal || "未设定") +
      "\n\n详细记录：\n" +
      recordLines;

    btnRunAI.disabled = true;
    btnRunAI.textContent = "AI 正在分析你的专注进展...";
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
        aiResultMeta.textContent = scopeName + "进展分析 · " + formatDateTime(lastAiReport.createdAt);
        aiResultBody.innerHTML = renderSimpleMarkdown(res.content);
        btnCopyAI.classList.remove("hidden");
        setAiStatus("分析完成。", "ok");
      } else {
        setAiStatus(res.error || "分析失败，请检查接口配置。", "err");
      }
    } finally {
      btnRunAI.disabled = false;
      btnRunAI.textContent = "分析我的专注进展";
    }
  }

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
  function renderModelDropdown(filterText = "") {
    if (fetchedModels.length === 0) {
      modelDropdown.innerHTML =
        '<div class="model-option-empty">尚未拉取模型，请先点击右上角「拉取模型列表」</div>';
      return;
    }
    const q = filterText.trim().toLowerCase();
    const list = q
      ? fetchedModels.filter((m) => m.toLowerCase().includes(q))
      : fetchedModels;

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

  inputAiModel.addEventListener("input", (e) => {
    aiConfig.model = e.target.value.trim();
    saveAiConfig();
    if (fetchedModels.length > 0) {
      openModelDropdown(false);
    }
  });

  inputAiModel.addEventListener("focus", () => {
    if (fetchedModels.length > 0) {
      openModelDropdown(true);
    }
  });

  btnModelDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
    if (modelDropdown.classList.contains("hidden")) {
      openModelDropdown(true);
    } else {
      closeModelDropdown();
    }
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
    if (!modelCombo.contains(e.target)) {
      closeModelDropdown();
    }
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

  aiScopeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      aiConfig.scope = btn.dataset.scope;
      saveAiConfig();
      syncAiUI();
    });
  });

  btnTestAI.addEventListener("click", runAiConnectionTest);
  btnRunAI.addEventListener("click", runAiProgressAnalysis);
  btnCopyAI.addEventListener("click", async () => {
    if (!lastAiReport || !lastAiReport.content) return;
    try {
      await navigator.clipboard.writeText(lastAiReport.content);
      btnCopyAI.textContent = "已复制";
      setTimeout(() => {
        btnCopyAI.textContent = "复制";
      }, 1500);
    } catch {}
  });

  // ============================================================
  // 抽屉与 Tab 切换
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
    settingsDrawer.classList.add("open");
    drawerBackdrop.classList.add("open");
  }

  function closeDrawer() {
    settingsDrawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
  }

  drawerTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchDrawerTab(tab.dataset.tab));
  });

  btnBrandSettings.addEventListener("click", () => openDrawer("settings"));
  btnQuickAI.addEventListener("click", () => openDrawer("ai"));
  btnSettings.addEventListener("click", () => openDrawer("settings"));
  statsBar.addEventListener("click", () => openDrawer("history"));
  btnCloseSettings.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  // ============================================================
  // 设置项与主操作绑定
  // ============================================================
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
    if (state.phase === "focus" || state.phase === "paused") {
      openFinishDialog(true);
    }
  });
  btnTestRest.addEventListener("click", () => {
    if (state.phase !== "rest") triggerMicroRest(true);
  });
  btnSkipRest.addEventListener("click", () => finishMicroRest(true));
  btnCompleteDone.addEventListener("click", () => savePendingRecord(false));
  btnCompleteAI.addEventListener("click", () => savePendingRecord(true));

  btnTheme.addEventListener("click", () => {
    applyTheme(settings.theme === "cream" ? "dark" : "cream");
  });

  if (window.desktopAPI) {
    btnMin.addEventListener("click", () => window.desktopAPI.minimize());
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
      if (!isFs) bodyEl.classList.remove("ui-idle");
    });

    window.desktopAPI.onTrayToggleTimer(() => toggleFocus());
  }

  let idleTimer = null;
  function bumpFullscreenActivity() {
    if (!bodyEl.classList.contains("is-fullscreen")) return;
    bodyEl.classList.remove("ui-idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (bodyEl.classList.contains("is-fullscreen") && !settingsDrawer.classList.contains("open")) {
        bodyEl.classList.add("ui-idle");
      }
    }, 3000);
  }
  window.addEventListener("mousemove", bumpFullscreenActivity);
  window.addEventListener("mousedown", bumpFullscreenActivity);

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
    if (e.code === "Space") {
      e.preventDefault();
      toggleFocus();
    } else if (e.key === "v" || e.key === "V") {
      cycleClockMode();
    } else if (e.key === "d" || e.key === "D") {
      applyTheme(settings.theme === "cream" ? "dark" : "cream");
    } else if (e.key === "r" || e.key === "R") {
      resetTimer();
    } else if (e.key === "Escape") {
      closeDrawer();
      if (bodyEl.classList.contains("is-fullscreen") && window.desktopAPI) {
        window.desktopAPI.toggleFullscreen();
      }
    }
  });

  // 初始化
  applyTheme(settings.theme);
  applyClockMode(settings.clockMode, false);
  renderGoalBar(false);
  syncSettingsUI();
  syncAiUI();
  renderHistoryPanel();
  renderPhaseUI();
  renderClock(false);
  renderStats();
})();
