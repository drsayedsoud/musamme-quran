/**
 * مُسَمِّع - نظام التغذية الصوتية واللمسية ونطق التصحيح (Haptic, Audio & WBW Correction)
 * يدعم:
 * 1. نغمات تنبيه لحظية عبر Web Audio API
 * 2. اهتزاز لمسي في أندرويد
 * 3. الفتح على القارئ بنطق الكلمة الصحيحة بصوت شيخ متقن كلمة بكلمة (Word-by-Word Audio)
 */

class AudioFeedback {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.vibrationEnabled = true;
    this.speakCorrectionEnabled = true; // نطق التصحيح بصوت الشيخ
    this.activeAudio = null;
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
  playMistakeChime() {
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

  /**
   * تشغيل التنبيه والتصحيح (الفتح على القارئ):
   * 1. اهتزاز الهاتف
   * 2. نطق الكلمة الصحيحة بصوت الشيخ كلمة بكلمة
   * 3. أو الرنين الهادئ في حال تعذر الاتصال أو إلغاء الميزة
   */
  async playCorrection(surahId, ayahNumber, wordPosition) {
    // 1. تشغيل الاهتزاز دائماً
    this.vibrate([100, 50, 100]);

    if (!this.soundEnabled) return;

    // إذا كانت ميزة نطق التصحيح بصوت الشيخ مفعّلة
    if (this.speakCorrectionEnabled && surahId && ayahNumber && wordPosition) {
      try {
        await this.playWordAudio(surahId, ayahNumber, wordPosition);
        return;
      } catch (err) {
        console.warn('WBW audio fallback to chime:', err);
      }
    }

    // بديل: تشغيل نغمة الخطأ الهادئة
    this.playMistakeChime();
  }

  // تشغيل ملف صوت الكلمة من مكتبة التلاوة العالمية
  playWordAudio(surahId, ayahNumber, wordPosition) {
    return new Promise((resolve, reject) => {
      try {
        if (this.activeAudio) {
          this.activeAudio.pause();
          this.activeAudio = null;
        }

        const s = String(surahId).padStart(3, '0');
        const a = String(ayahNumber).padStart(3, '0');
        const w = String(wordPosition).padStart(3, '0');
        const url = `https://audio.qurancdn.com/wbw/${s}_${a}_${w}.mp3`;

        const audio = new Audio(url);
        this.activeAudio = audio;

        audio.onended = () => {
          this.activeAudio = null;
          resolve();
        };

        audio.onerror = (e) => {
          this.activeAudio = null;
          reject(e);
        };

        // مؤقت زمني لعدم التعليق في حال بطء الشبكة
        const timeout = setTimeout(() => {
          if (this.activeAudio === audio) {
            this.activeAudio = null;
            reject(new Error('Audio load timeout'));
          }
        }, 2500);

        audio.play().then(() => {
          clearTimeout(timeout);
        }).catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
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
