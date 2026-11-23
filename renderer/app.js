// ============================================================
// 随机提示音 · 主状态机、3D 翻页时钟控制器与随机微休息调度
// ============================================================

(function () {
  const STORAGE_KEY_SETTINGS = "random_chime_settings_v1";
  const STORAGE_KEY_STATS = "random_chime_stats_v1";

  const CLOCK_MODES = ["minimal", "flip", "halo"];
  const HALO_CIRCUMFERENCE = 2 * Math.PI * 112; // 703.72
  const REST_CIRCUMFERENCE = 2 * Math.PI * 96; // 603.19

  const defaultSettings = {
    theme: "cream", // "cream" | "dark"
    clockMode: "minimal", // "minimal" | "flip" | "halo"
    focusMinutes: 90,
    minGapMinutes: 3,
    maxGapMinutes: 5,
    restSeconds: 10,
    chimePreset: "bowl",
    chimeVolume: 75,
    ambientMode: "none",
    ambientVolume: 30,
    hideNextHint: true,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function loadStats() {
    const key = todayKey();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STATS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === key) return parsed;
      }
    } catch {}
    return { date: key, minutes: 0, rests: 0 };
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
    } catch {}
  }

  const settings = loadSettings();
  let stats = loadStats();

  // 运行时状态
  const state = {
    phase: "idle", // "idle" | "focus" | "paused" | "rest"
    totalMs: settings.focusMinutes * 60 * 1000,
    remainingMs: settings.focusMinutes * 60 * 1000,
    lastTickAt: 0,
    nextRestInMs: 0,
    restRemainingMs: settings.restSeconds * 1000,
    restWasManualTest: false,
    prevPhaseBeforeTest: "idle",
    sessionRests: 0,
    focusedAccumMs: 0,
    tickHandle: null,
  };

  // DOM 引用
  const $ = (id) => document.getElementById(id);
  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  const brandDot = $("brandDot");
  const statusPill = $("statusPill");
  const intervalBadge = $("intervalBadge");
  const nextChimeHint = $("nextChimeHint");

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
  const btnTestRest = $("btnTestRest");

  const statSessionRests = $("statSessionRests");
  const statTodayMinutes = $("statTodayMinutes");
  const statTodayRests = $("statTodayRests");

  const restOverlay = $("restOverlay");
  const restCountdown = $("restCountdown");
  const restRingFg = $("restRingFg");
  const btnSkipRest = $("btnSkipRest");

  const completeOverlay = $("completeOverlay");
  const completeSummary = $("completeSummary");
  const btnCompleteDone = $("btnCompleteDone");

  // 标题栏与设置抽屉
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

  // 设置控件
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
    if (!unit) return;
    if (unit.value === nextChar) return;

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
    // 强制重排以重启 CSS 动画
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
  // 工具函数与渲染同步
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
    const chosenSec = minSec + Math.random() * (maxSec - minSec);
    return Math.round(chosenSec * 1000);
  }

  function renderClock(animateFlip = true) {
    const { text, mStr, sStr } = formatMMSS(state.remainingMs);
    minimalDigits.textContent = text;
    haloDigits.textContent = text;

    // 进度计算
    const progress = state.totalMs > 0 ? Math.min(1, Math.max(0, 1 - state.remainingMs / state.totalMs)) : 0;
    minimalProgress.style.width = (progress * 100).toFixed(2) + "%";
    haloArc.style.strokeDashoffset = (HALO_CIRCUMFERENCE * progress).toFixed(2);

    // 3D 翻页卡片（若分钟 >= 100 如 120 分钟，m1 显示十位以上如 "12"，平滑兼容）
    const m1 = mStr.length > 2 ? mStr.slice(0, mStr.length - 1) : mStr[0];
    const m2 = mStr[mStr.length - 1];
    setFlipDigit("m1", m1, animateFlip);
    setFlipDigit("m2", m2, animateFlip);
    setFlipDigit("s1", sStr[0], animateFlip);
    setFlipDigit("s2", sStr[1], animateFlip);

    // 托盘提示更新
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
    bodyEl.classList.toggle("is-running", running);
    brandDot.classList.toggle("running", running);
    btnToggle.classList.toggle("running", running);

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
    statSessionRests.textContent = state.sessionRests + " 次";
    statTodayMinutes.textContent = Math.floor(stats.minutes) + " 分钟";
    statTodayRests.textContent = stats.rests + " 次";
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
    // 切换至翻页模式时无动画同步当前数字
    renderClock(false);
    if (withFeedback) {
      window.soundEngine.playSoftClick();
    }
    saveSettings();
  }

  function cycleClockMode() {
    const idx = CLOCK_MODES.indexOf(settings.clockMode);
    const next = CLOCK_MODES[(idx + 1) % CLOCK_MODES.length];
    applyClockMode(next, true);
  }

  // ============================================================
  // 计时与随机微休息核心调度
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
      state.nextRestInMs = rollNextRandomIntervalMs();
      state.sessionRests = 0;
      state.focusedAccumMs = 0;
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
    if (state.phase === "focus") {
      pauseFocus();
    } else {
      startFocus();
    }
  }

  function resetTimer() {
    stopTickLoop();
    window.soundEngine.stopAmbient();
    restOverlay.classList.remove("visible");
    completeOverlay.classList.remove("visible");
    state.phase = "idle";
    state.totalMs = settings.focusMinutes * 60 * 1000;
    state.remainingMs = state.totalMs;
    state.nextRestInMs = 0;
    state.sessionRests = 0;
    state.focusedAccumMs = 0;
    renderPhaseUI();
    renderClock(false);
    renderStats();
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
        stats.rests += 1;
        saveStats();
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

    // 正常专注中的微休息结束 -> 抽取下一段随机间隔并继续专注
    state.nextRestInMs = rollNextRandomIntervalMs();
    state.phase = "focus";
    state.lastTickAt = Date.now();
    window.soundEngine.duckAmbient(false);
    renderPhaseUI();
  }

  function finishFocusSession() {
    stopTickLoop();
    window.soundEngine.stopAmbient();
    window.soundEngine.playSessionComplete(settings.chimePreset, settings.chimeVolume / 100);

    state.phase = "idle";
    state.remainingMs = 0;
    renderClock(true);
    renderPhaseUI();

    completeSummary.textContent =
      "本次专注 " +
      settings.focusMinutes +
      " 分钟，穿插完成了 " +
      state.sessionRests +
      " 次大脑重放微休息。建议起身远眺或活动 10–20 分钟，再开启下一轮超日节律。";
    completeOverlay.classList.add("visible");
    completeOverlay.setAttribute("aria-hidden", "false");
  }

  let lastRenderedSec = -1;

  function onTick() {
    const now = Date.now();
    const dt = Math.min(2000, Math.max(0, now - state.lastTickAt));
    state.lastTickAt = now;

    if (state.phase === "focus") {
      state.remainingMs = Math.max(0, state.remainingMs - dt);
      state.nextRestInMs -= dt;
      state.focusedAccumMs += dt;

      // 每累计满 1 分钟写入今日专注统计
      if (state.focusedAccumMs >= 60000) {
        const minsToAdd = Math.floor(state.focusedAccumMs / 60000);
        state.focusedAccumMs -= minsToAdd * 60000;
        if (stats.date !== todayKey()) stats = loadStats();
        stats.minutes += minsToAdd;
        saveStats();
        renderStats();
      }

      const currentSec = Math.ceil(state.remainingMs / 1000);
      if (currentSec !== lastRenderedSec) {
        lastRenderedSec = currentSec;
        renderClock(true);
        renderMeta();
      }

      if (state.remainingMs <= 0) {
        finishFocusSession();
        return;
      }

      // 只有剩余时间大于 25 秒时才触发微休息，避免最后几秒突兀打断
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
  // 设置面板同步与事件绑定
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

  function openDrawer() {
    settingsDrawer.classList.add("open");
    drawerBackdrop.classList.add("open");
  }

  function closeDrawer() {
    settingsDrawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
  }

  // 点击时钟本体切换风格（极简 / 翻页 / 光环）
  clockTrigger.addEventListener("click", cycleClockMode);
  clockTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter") cycleClockMode();
  });

  modeDotButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyClockMode(btn.dataset.mode, true));
  });

  btnToggle.addEventListener("click", toggleFocus);
  btnReset.addEventListener("click", resetTimer);
  btnTestRest.addEventListener("click", () => {
    if (state.phase !== "rest") triggerMicroRest(true);
  });
  btnSkipRest.addEventListener("click", () => finishMicroRest(true));
  btnCompleteDone.addEventListener("click", () => {
    completeOverlay.classList.remove("visible");
    completeOverlay.setAttribute("aria-hidden", "true");
    resetTimer();
  });

  // 标题栏动作
  btnTheme.addEventListener("click", () => {
    applyTheme(settings.theme === "cream" ? "dark" : "cream");
  });

  btnSettings.addEventListener("click", openDrawer);
  btnCloseSettings.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

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

  // 全屏模式下无鼠标移动 3 秒自动淡出控件
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

  // 设置项监听
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

  // 键盘快捷键
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
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
  syncSettingsUI();
  renderPhaseUI();
  renderClock(false);
  renderStats();
})();
