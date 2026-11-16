/**
 * مُسَمِّع - نظام التغذية الصوتية واللمسية (Haptic & Audio Feedback)
 * يستخدم Web Audio API لتوليد نغمات نقية هادئة وفورية بدون الحاجة لملفات صوت خارجية
 */

class AudioFeedback {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.vibrationEnabled = true;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // اهتزاز الهاتف (يعمل في أندرويد ويدعم المتصفحات الحديثة)
  vibrate(pattern = [120]) {
    if (!this.vibrationEnabled) return;
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('Vibration not permitted:', e);
      }
    }
  }

  // نغمة الخطأ أو النسيان (صوت رنين هادئ دافئ غير مزعج)
  playMistakeAlert() {
    // 1. تشغيل الاهتزاز
    this.vibrate([100, 50, 100]);

    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // مذبذب رئيسي (نغمة خفيضة مريحة)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle'; // صوت ناعم كالماريمبا أو الآلات الخشبية
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }

  // نغمة نجاح خفيفة عند إتمام آية بشكل صحيح
  playAyahSuccess() {
    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      // تناغم هادئ (نغمتين متناسقتين)
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc2.frequency.setValueAtTime(659.25, now); // E5

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn('Ayah success chime error:', e);
    }
  }

  // نغمة بدء الاستماع
  playStartChime() {
    this.vibrate([50]);
    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.15); // A4 -> D5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  // نغمة إيقاف الاستماع
  playStopChime() {
    this.vibrate([40]);
    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.18);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }
}

export const feedback = new AudioFeedback();
