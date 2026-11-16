/**
 * مُسَمِّع - محرك التعرف الصوتي (Speech Recognition Engine)
 * يدعم الاستماع المستمر وفلترة الكلمات المكررة ومنع التنبيهات الكاذبة
 */

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isPaused = false;
    this.processedCounts = {}; // تتبع عدد الكلمات التي تمت معالجتها لكل جملة
    
    // Callbacks
    this.onWordRecognized = null; // نرسل كلمة واحدة مع حالة التأكيد { text, isFinal }
    this.onStateChange = null;
    this.onError = null;

    this.initRecognition();
  }

  isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  initRecognition() {
    if (!this.isSupported()) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'ar-SA'; // اللغة العربية الفصحى
    this.recognition.maxAlternatives = 2;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStateChange) this.onStateChange({ listening: true, paused: this.isPaused });
    };

    this.recognition.onresult = (event) => {
      if (this.isPaused) return;

      const results = event.results;

      for (let i = event.resultIndex; i < results.length; i++) {
        const item = results[i];
        const isFinal = item.isFinal;
        const transcript = item[0].transcript.trim();
        const words = transcript.split(/\s+/).filter(w => w.length > 0);

        if (isFinal) {
          // استخراج الكلمات المؤكدة النهائية التي لم تُعالج بعد
          const processedSoFar = this.processedCounts[i] || 0;
          const newFinalWords = words.slice(processedSoFar);
          this.processedCounts[i] = words.length;

          for (const w of newFinalWords) {
            if (this.onWordRecognized) {
              this.onWordRecognized({ text: w, isFinal: true });
            }
          }
        } else {
          // نتائج مؤقتة أثناء استمرار النطق (تُرسل فقط للمطابقة الإيجابية دون تسجيل أخطاء)
          if (words.length > 0) {
            const currentCandidate = words[words.length - 1];
            if (this.onWordRecognized) {
              this.onWordRecognized({ text: currentCandidate, isFinal: false });
            }
          }
        }
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      console.warn('Speech recognition warning:', event.error);
      if (this.onError) this.onError(event.error);
    };

    this.recognition.onend = () => {
      if (this.isListening && !this.isPaused) {
        try {
          this.recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isListening && !this.isPaused) {
              try { this.recognition.start(); } catch (err) {}
            }
          }, 300);
        }
      } else {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange({ listening: false, paused: this.isPaused });
      }
    };
  }

  clearBuffer() {
    this.processedCounts = {};
  }

  start() {
    if (!this.recognition) return false;
    this.isPaused = false;
    this.clearBuffer();
    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e) {
      console.warn('Start recognition error:', e);
      return false;
    }
  }

  stop() {
    this.isListening = false;
    this.isPaused = false;
    this.clearBuffer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    if (this.onStateChange) this.onStateChange({ listening: false, paused: false });
  }

  pause() {
    this.isPaused = true;
    if (this.onStateChange) this.onStateChange({ listening: this.isListening, paused: true });
  }

  resume() {
    this.isPaused = false;
    if (!this.isListening) {
      this.start();
    } else {
      if (this.onStateChange) this.onStateChange({ listening: true, paused: false });
    }
  }
}
