/**
 * مُسَمِّع - محرك التعرف الصوتي (Speech Recognition Engine)
 * يدعم الاستماع المستمر وإعادة الاتصال التلقائي في أندرويد وآيفون
 */

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isPaused = false;
    this.lastProcessedIndex = 0;
    this.processedWordsSet = new Set();
    
    // Callbacks
    this.onWordsRecognized = null;
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
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStateChange) this.onStateChange({ listening: true, paused: this.isPaused });
    };

    this.recognition.onresult = (event) => {
      if (this.isPaused) return;

      const results = event.results;
      let newSpokenWords = [];

      for (let i = event.resultIndex; i < results.length; i++) {
        const item = results[i];
        const transcript = item[0].transcript.trim();
        
        // استخراج الكلمات الجديدة
        const words = transcript.split(/\s+/).filter(w => w.length > 0);

        if (item.isFinal) {
          newSpokenWords.push(...words);
        } else {
          // نتائج مؤقتة للكلمة الأخيرة أثناء النطق
          if (words.length > 0) {
            newSpokenWords.push(words[words.length - 1]);
          }
        }
      }

      if (newSpokenWords.length > 0 && this.onWordsRecognized) {
        this.onWordsRecognized(newSpokenWords);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech recognition event error:', event.error);
      
      // أخطاء الصمت أو عدم التقاط الصوت طبيعية وتحدث عند التوقف للتنفس
      if (event.error === 'no-speech') {
        return;
      }

      if (this.onError) {
        this.onError(event.error);
      }
    };

    this.recognition.onend = () => {
      // إعادة التشغيل التلقائي إذا كان المفترض أن يستمر الاستماع
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

  start() {
    if (!this.recognition) return false;
    this.isPaused = false;
    this.lastProcessedIndex = 0;
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
