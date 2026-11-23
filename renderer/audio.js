// ============================================================
// 纯 Web Audio API 疗愈提示音 & 环境音合成引擎（零外部音频依赖）
// ============================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ambientNodes = null;
    this.ambientGain = null;
    this.ambientMode = "none";
    this.ambientBaseVolume = 0.3;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * 播放「开始闭眼微休息」提示音（柔和下行/低沉空灵）
   */
  playRestStart(preset = "bowl", volume = 0.75) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime + 0.02;
    const vol = Math.max(0.05, Math.min(1, volume));

    if (preset === "bowl") {
      this._playBowl(ctx, now, 261.63, vol * 0.42, 3.8); // C4 颂钵
      this._playBowl(ctx, now + 0.08, 392.0, vol * 0.18, 3.2); // G4 泛音
    } else if (preset === "chime") {
      this._playChimeNote(ctx, now, 880, vol * 0.25, 2.2);
      this._playChimeNote(ctx, now + 0.22, 659.25, vol * 0.24, 2.6);
    } else if (preset === "piano") {
      this._playPianoNote(ctx, now, 392.0, vol * 0.28, 2.6);
      this._playPianoNote(ctx, now + 0.16, 329.63, vol * 0.26, 2.8);
      this._playPianoNote(ctx, now + 0.32, 261.63, vol * 0.3, 3.2);
    } else {
      this._playWood(ctx, now, 520, vol * 0.48);
      this._playWood(ctx, now + 0.28, 420, vol * 0.38);
    }
  }

  /**
   * 播放「10 秒结束，睁眼继续」提示音（清澈上扬）
   */
  playRestEnd(preset = "bowl", volume = 0.75) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime + 0.02;
    const vol = Math.max(0.05, Math.min(1, volume));

    if (preset === "bowl") {
      this._playBowl(ctx, now, 392.0, vol * 0.34, 2.8); // G4
      this._playBowl(ctx, now + 0.16, 523.25, vol * 0.36, 3.2); // C5
    } else if (preset === "chime") {
      this._playChimeNote(ctx, now, 659.25, vol * 0.22, 1.8);
      this._playChimeNote(ctx, now + 0.18, 880, vol * 0.26, 2.4);
      this._playChimeNote(ctx, now + 0.36, 1046.5, vol * 0.22, 2.6);
    } else if (preset === "piano") {
      this._playPianoNote(ctx, now, 261.63, vol * 0.24, 2.2);
      this._playPianoNote(ctx, now + 0.14, 329.63, vol * 0.26, 2.4);
      this._playPianoNote(ctx, now + 0.28, 392.0, vol * 0.28, 2.8);
    } else {
      this._playWood(ctx, now, 680, vol * 0.46);
    }
  }

  /**
   * 播放「完整 90 分钟周期完成」温暖和弦
   */
  playSessionComplete(preset = "bowl", volume = 0.75) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime + 0.03;
    const vol = Math.max(0.08, Math.min(1, volume));
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, idx) => {
      this._playBowl(ctx, now + idx * 0.22, freq, vol * 0.28, 4.2);
    });
  }

  /**
   * 极轻机械翻页声（用于翻页模式切换或手动交互反馈，非常克制）
   */
  playSoftClick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  _playBowl(ctx, startTime, baseFreq, volume, duration) {
    // 主基频 + 轻微拍频 + 金属颂钵泛音比例 (1, 2.756)
    const partials = [
      { ratio: 1.0, amp: 1.0, detune: 0 },
      { ratio: 1.003, amp: 0.45, detune: 2.2 },
      { ratio: 2.756, amp: 0.22, detune: 0 },
    ];

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq * p.ratio, startTime);
      if (p.detune) osc.detune.setValueAtTime(p.detune, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(volume * p.amp, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  _playChimeNote(ctx, startTime, freq, volume, duration) {
    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();
    const oGain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(freq * 2.0, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oGain.gain.setValueAtTime(0.0001, startTime);
    oGain.gain.linearRampToValueAtTime(volume * 0.25, startTime + 0.01);
    oGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6);

    osc.connect(gain);
    overtone.connect(oGain);
    gain.connect(ctx.destination);
    oGain.connect(ctx.destination);

    osc.start(startTime);
    overtone.start(startTime);
    osc.stop(startTime + duration + 0.05);
    overtone.stop(startTime + duration + 0.05);
  }

  _playPianoNote(ctx, startTime, freq, volume, duration) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 4, startTime);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.4, startTime + duration * 0.7);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  _playWood(ctx, startTime, freq, volume) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.78, startTime + 0.14);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, startTime);
    filter.Q.setValueAtTime(4.5, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.26);
  }

  // ============================================================
  // 伴随环境音（柔和粉红噪音 / 40Hz 轻双耳节拍）
  // ============================================================
  startAmbient(mode, volume = 0.3) {
    this.stopAmbient();
    this.ambientMode = mode;
    this.ambientBaseVolume = volume;
    if (mode === "none") return;

    const ctx = this.ensureContext();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(volume * 0.18, ctx.currentTime + 1.2);
    masterGain.connect(ctx.destination);
    this.ambientGain = masterGain;

    if (mode === "pink") {
      const bufferSize = ctx.sampleRate * 4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
        b6 = white * 0.115926;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 950;

      source.connect(filter);
      filter.connect(masterGain);
      source.start();
      this.ambientNodes = [source];
    } else if (mode === "binaural40") {
      const leftOsc = ctx.createOscillator();
      const rightOsc = ctx.createOscillator();
      const leftPan = ctx.createStereoPanner();
      const rightPan = ctx.createStereoPanner();

      leftOsc.type = "sine";
      rightOsc.type = "sine";
      leftOsc.frequency.value = 200;
      rightOsc.frequency.value = 240; // 40Hz 差频
      leftPan.pan.value = -0.8;
      rightPan.pan.value = 0.8;

      leftOsc.connect(leftPan);
      rightOsc.connect(rightPan);
      leftPan.connect(masterGain);
      rightPan.connect(masterGain);

      leftOsc.start();
      rightOsc.start();
      this.ambientNodes = [leftOsc, rightOsc];
    }
  }

  duckAmbient(ducked) {
    if (!this.ctx || !this.ambientGain || this.ambientMode === "none") return;
    const now = this.ctx.currentTime;
    const target = ducked ? this.ambientBaseVolume * 0.025 : this.ambientBaseVolume * 0.18;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.35);
  }

  setAmbientVolume(volume) {
    this.ambientBaseVolume = volume;
    if (!this.ctx || !this.ambientGain || this.ambientMode === "none") return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.setTargetAtTime(Math.max(0.0001, volume * 0.18), now, 0.2);
  }

  stopAmbient() {
    if (this.ambientNodes) {
      this.ambientNodes.forEach((node) => {
        try { node.stop(); } catch (_) {}
      });
      this.ambientNodes = null;
    }
    if (this.ambientGain) {
      try { this.ambientGain.disconnect(); } catch (_) {}
      this.ambientGain = null;
    }
  }
}

window.soundEngine = new SoundEngine();
