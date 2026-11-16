/**
 * مُسَمِّع - المتحكم الرئيسي للتطبيق (Application Controller)
 * مع خاصية "الفتح على القارئ" بنطق الكلمة الصحيحة بصوت الشيخ كلمة بكلمة
 */

import { SURAHS } from './quran-data.js';
import { feedback } from './audio-feedback.js';
import { parseAyahIntoWords, isWordMatch, normalizeQuranText } from './quran-matcher.js';
import { SpeechEngine } from './speech-engine.js';

class MusammeApp {
  constructor() {
    this.quranData = null; // سيتم تحميله من quran-uthmani.json
    this.speechEngine = new SpeechEngine();

    // حالة جلسة التسميع الحالية
    this.currentSurah = null;
    this.startAyahNum = 1;
    this.endAyahNum = 7;
    this.recitationMode = 'hafiz'; // 'hafiz' | 'review'

    this.wordsList = [];
    this.currentWordIndex = 0;
    this.mistakesCount = 0;
    this.mistakesList = [];
    this.deferredInstallPrompt = null;
    this.isProcessingMistake = false;

    // عناصر الواجهة
    this.dom = {
      // شاشات
      setupView: document.getElementById('setupView'),
      reciteView: document.getElementById('reciteView'),
      resultsModal: document.getElementById('resultsModal'),

      // أزرار ترويسة
      btnInstall: document.getElementById('btnInstall'),
      btnShareApp: document.getElementById('btnShareApp'),
      btnSoundToggle: document.getElementById('btnSoundToggle'),

      // إعدادات
      surahSelect: document.getElementById('surahSelect'),
      startAyah: document.getElementById('startAyah'),
      endAyah: document.getElementById('endAyah'),
      totalAyahsLabel: document.getElementById('totalAyahsLabel'),
      modeHafizBtn: document.getElementById('modeHafizBtn'),
      modeReviewBtn: document.getElementById('modeReviewBtn'),
      chkSpeakCorrection: document.getElementById('chkSpeakCorrection'),
      chkAudioAlert: document.getElementById('chkAudioAlert'),
      chkVibrateAlert: document.getElementById('chkVibrateAlert'),
      btnStart: document.getElementById('btnStart'),
      quickPills: document.querySelectorAll('.pill-btn[data-range]'),

      // التسميع
      reciteSurahTitle: document.getElementById('reciteSurahTitle'),
      currentAyahBadge: document.getElementById('currentAyahBadge'),
      mistakesCountBadge: document.getElementById('mistakesCountBadge'),
      quranCanvas: document.getElementById('quranCanvas'),
      btnMicToggle: document.getElementById('btnMicToggle'),
      btnRepeatAyah: document.getElementById('btnRepeatAyah'),
      btnListenWord: document.getElementById('btnListenWord'),
      btnExitRecite: document.getElementById('btnExitRecite'),
      btnFinishRecite: document.getElementById('btnFinishRecite'),

      // النتائج
      scorePercent: document.getElementById('scorePercent'),
      resultsSummaryText: document.getElementById('resultsSummaryText'),
      mistakesSection: document.getElementById('mistakesSection'),
      mistakesList: document.getElementById('mistakesList'),
      btnRetry: document.getElementById('btnRetry'),
      btnNextSection: document.getElementById('btnNextSection')
    };

    this.init();
  }

  async init() {
    this.initSurahList();
    this.setupEventListeners();
    this.setupSpeechCallbacks();
    this.setupPwaInstall();
    await this.loadQuranData();
  }

  // تحميل بيانات المصحف كاملة
  async loadQuranData() {
    try {
      const res = await fetch('./quran-uthmani.json');
      this.quranData = await res.json();
      console.log('Quran Data Loaded successfully.');
    } catch (e) {
      console.error('Failed to load Quran data:', e);
      alert('تعذر تحميل بيانات المصحف، يرجى إعادة تحديث الصفحة.');
    }
  }

  // تعبئة قائمة السور الـ 114
  initSurahList() {
    this.dom.surahSelect.innerHTML = '';
    SURAHS.forEach(surah => {
      const opt = document.createElement('option');
      opt.value = surah.id;
      opt.textContent = `${surah.id}. سورة ${surah.name} (${surah.ayahs} آية - ${surah.type})`;
      this.dom.surahSelect.appendChild(opt);
    });

    this.onSurahChanged(1); // البدء بسورة الفاتحة افتراضياً
  }

  onSurahChanged(surahId) {
    const surah = SURAHS.find(s => s.id === parseInt(surahId));
    if (!surah) return;

    this.currentSurah = surah;
    this.dom.totalAyahsLabel.textContent = `${surah.ayahs} آيات`;
    this.dom.startAyah.max = surah.ayahs;
    this.dom.startAyah.value = 1;
    this.dom.endAyah.max = surah.ayahs;
    this.dom.endAyah.value = surah.ayahs;

    // تفعيل حبة "كامل السورة"
    this.dom.quickPills.forEach(p => p.classList.toggle('active', p.dataset.range === 'all'));
  }

  setupEventListeners() {
    // تغيير السورة
    this.dom.surahSelect.addEventListener('change', (e) => {
      this.onSurahChanged(e.target.value);
    });

    // نطاق الاختصارات السريعة
    this.dom.quickPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.dom.quickPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const total = this.currentSurah.ayahs;
        const range = pill.dataset.range;
        if (range === 'all') {
          this.dom.startAyah.value = 1;
          this.dom.endAyah.value = total;
        } else if (range === 'first10') {
          this.dom.startAyah.value = 1;
          this.dom.endAyah.value = Math.min(10, total);
        } else if (range === 'half') {
          this.dom.startAyah.value = 1;
          this.dom.endAyah.value = Math.max(1, Math.floor(total / 2));
        }
      });
    });

    // تبديل نمط التسميع (حافظ / مراجعة)
    this.dom.modeHafizBtn.addEventListener('click', () => {
      this.recitationMode = 'hafiz';
      this.dom.modeHafizBtn.classList.add('active');
      this.dom.modeReviewBtn.classList.remove('active');
    });

    this.dom.modeReviewBtn.addEventListener('click', () => {
      this.recitationMode = 'review';
      this.dom.modeReviewBtn.classList.add('active');
      this.dom.modeHafizBtn.classList.remove('active');
    });

    // خيارات التنبيه ونطق التصحيح
    this.dom.chkSpeakCorrection.addEventListener('change', (e) => {
      feedback.speakCorrectionEnabled = e.target.checked;
    });

    this.dom.chkAudioAlert.addEventListener('change', (e) => {
      feedback.soundEnabled = e.target.checked;
    });

    this.dom.chkVibrateAlert.addEventListener('change', (e) => {
      feedback.vibrationEnabled = e.target.checked;
    });

    this.dom.btnSoundToggle.addEventListener('click', () => {
      feedback.soundEnabled = !feedback.soundEnabled;
      this.dom.chkAudioAlert.checked = feedback.soundEnabled;
      this.dom.btnSoundToggle.textContent = feedback.soundEnabled ? '🔔' : '🔕';
    });

    // زر بدء التسميع
    this.dom.btnStart.addEventListener('click', () => {
      this.startRecitationSession();
    });

    // أزرار شاشة التسميع
    this.dom.btnMicToggle.addEventListener('click', () => {
      if (this.speechEngine.isListening && !this.speechEngine.isPaused) {
        this.speechEngine.pause();
        feedback.playStopChime();
      } else {
        this.speechEngine.resume();
        feedback.playStartChime();
      }
    });

    this.dom.btnRepeatAyah.addEventListener('click', () => {
      this.repeatCurrentAyah();
    });

    // زر الاستماع لنطق الكلمة الحالية بصوت الشيخ
    this.dom.btnListenWord.addEventListener('click', () => {
      this.listenToCurrentWord();
    });

    this.dom.btnExitRecite.addEventListener('click', () => {
      if (confirm('هل تريد إنهاء جلسة التسميع الحالية والعودة للقائمة؟')) {
        this.stopSession();
        this.showView('setupView');
      }
    });

    this.dom.btnFinishRecite.addEventListener('click', () => {
      this.finishSession();
    });

    // أزرار نافذة النتائج
    this.dom.btnRetry.addEventListener('click', () => {
      this.dom.resultsModal.classList.remove('active');
      this.startRecitationSession();
    });

    this.dom.btnNextSection.addEventListener('click', () => {
      this.dom.resultsModal.classList.remove('active');
      this.advanceToNextSection();
    });

    // زر المشاركة
    this.dom.btnShareApp.addEventListener('click', () => {
      this.shareApp();
    });
  }

  // إعداد استجابات التعرف الصوتي
  setupSpeechCallbacks() {
    this.speechEngine.onWordsRecognized = (words) => {
      if (this.isProcessingMistake) return; // عدم التداخل أثناء نطق التصحيح
      this.processSpokenWords(words);
    };

    this.speechEngine.onStateChange = ({ listening, paused }) => {
      if (listening && !paused) {
        this.dom.btnMicToggle.classList.add('listening');
        this.dom.btnMicToggle.textContent = '⏸️';
      } else {
        this.dom.btnMicToggle.classList.remove('listening');
        this.dom.btnMicToggle.textContent = '🎙️';
      }
    };

    this.speechEngine.onError = (err) => {
      console.warn('Speech error notification:', err);
    };
  }

  // بدء جلسة التسميع
  startRecitationSession() {
    if (!this.quranData) {
      alert('بيانات المصحف قيد التحميل، يرجى الانتظار ثانية...');
      return;
    }

    const start = parseInt(this.dom.startAyah.value) || 1;
    const end = parseInt(this.dom.endAyah.value) || this.currentSurah.ayahs;

    if (start < 1 || end < start || end > this.currentSurah.ayahs) {
      alert('يرجى التأكد من صحة نطاق الآيات المختار.');
      return;
    }

    this.startAyahNum = start;
    this.endAyahNum = end;
    this.currentWordIndex = 0;
    this.mistakesCount = 0;
    this.mistakesList = [];
    this.wordsList = [];

    // جمع وتجهيز الكلمات من الآيات المختارة
    for (let a = start; a <= end; a++) {
      const key = `${this.currentSurah.id}:${a}`;
      const text = this.quranData[key];
      if (text) {
        const words = parseAyahIntoWords(text, this.currentSurah.id, a);
        this.wordsList.push(...words);
      }
    }

    if (this.wordsList.length === 0) {
      alert('لم يتم العثور على آيات في هذا النطاق.');
      return;
    }

    // بناء الواجهة للكلمات
    this.renderQuranWords();

    // تحديث بيانات الترويسة
    this.dom.reciteSurahTitle.textContent = `سورة ${this.currentSurah.name}`;
    this.dom.currentAyahBadge.textContent = this.startAyahNum;
    this.dom.mistakesCountBadge.textContent = '0';

    // ضبط نمط العرض
    this.dom.quranCanvas.className = `quran-canvas mode-${this.recitationMode}`;

    // الانتقال لشاشة التسميع وبدء الاستماع
    this.showView('reciteView');
    this.highlightActiveWord();
    
    feedback.playStartChime();
    this.speechEngine.start();
  }

  // رسم كلمات الآيات في لوحة القراءة
  renderQuranWords() {
    this.dom.quranCanvas.innerHTML = '';
    let lastAyah = null;

    this.wordsList.forEach((wordObj, idx) => {
      // وضع علامة نهاية الآية السابقة
      if (lastAyah !== null && wordObj.ayah !== lastAyah) {
        const badge = document.createElement('span');
        badge.className = 'ayah-end-badge';
        badge.textContent = `﴿${lastAyah}﴾`;
        this.dom.quranCanvas.appendChild(badge);
      }

      const span = document.createElement('span');
      span.id = `qword-${idx}`;
      span.className = 'quran-word pending';
      span.textContent = wordObj.uthmani;
      
      // النقر على الكلمة للاستماع إليها مباشرة
      span.addEventListener('click', () => {
        feedback.playWordAudio(wordObj.surah, wordObj.ayah, wordObj.position);
      });

      this.dom.quranCanvas.appendChild(span);

      lastAyah = wordObj.ayah;
    });

    // علامة الآية الأخيرة
    if (lastAyah !== null) {
      const badge = document.createElement('span');
      badge.className = 'ayah-end-badge';
      badge.textContent = `﴿${lastAyah}﴾`;
      this.dom.quranCanvas.appendChild(badge);
    }
  }

  // إبراز الكلمة المتوقعة التالية
  highlightActiveWord() {
    if (this.currentWordIndex >= this.wordsList.length) return;

    // إزالة النشاط السابق
    document.querySelectorAll('.quran-word.active').forEach(el => el.classList.remove('active'));

    const currentEl = document.getElementById(`qword-${this.currentWordIndex}`);
    if (currentEl) {
      currentEl.classList.remove('pending');
      currentEl.classList.add('active');

      // التمرير التلقائي السلس نحو الكلمة
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // تحديث رقم الآية الحالية في الشريط
      const activeWord = this.wordsList[this.currentWordIndex];
      if (activeWord) {
        this.dom.currentAyahBadge.textContent = activeWord.ayah;
      }
    }
  }

  // معالجة تدفق الكلمات المنطوقة من الميكروفون
  async processSpokenWords(spokenTokens) {
    if (this.currentWordIndex >= this.wordsList.length) return;

    for (const spoken of spokenTokens) {
      if (this.currentWordIndex >= this.wordsList.length) break;

      const expected = this.wordsList[this.currentWordIndex];

      // 1. فحص هل الكلمة مطابقة للكلمة المتوقعة الحالية
      if (isWordMatch(spoken, expected.uthmani)) {
        this.markWordCorrect(this.currentWordIndex);
        this.currentWordIndex++;
        this.highlightActiveWord();
        continue;
      }

      // 2. فحص هل القارئ تجاوز كلمة (نسيها) وانتقل للكلمة التي تليها مباشرة!
      if (this.currentWordIndex + 1 < this.wordsList.length) {
        const nextExpected = this.wordsList[this.currentWordIndex + 1];
        if (isWordMatch(spoken, nextExpected.uthmani)) {
          // تسجيل ونطق الكلمة التي تم نسيانها كخطأ وتصحيح
          await this.markWordMistake(this.currentWordIndex, 'نسيان أو تجاوز كلمة');
          
          // تأكيد الكلمة الحالية والانتقال لما بعدها
          this.currentWordIndex++;
          this.markWordCorrect(this.currentWordIndex);
          this.currentWordIndex++;
          this.highlightActiveWord();
          continue;
        }
      }

      // 3. إذا لم تطابق الحالية ولا التالية، وبينهما تشابه بسيط (زلل لفظي)
      const normSpoken = normalizeQuranText(spoken);
      if (normSpoken.length >= 3 && !['في', 'من', 'على', 'ما', 'لا', 'ان'].includes(normSpoken)) {
        // خطأ نطق واضح في الكلمة الحالية
        await this.markWordMistake(this.currentWordIndex, `نطق "${spoken}" بدلاً من "${expected.uthmani}"`);
      }
    }

    // فحص إتمام كامل الآيات
    if (this.currentWordIndex >= this.wordsList.length) {
      this.finishSession();
    }
  }

  // تمييز الكلمة بأنها صحيحة
  markWordCorrect(index) {
    const el = document.getElementById(`qword-${index}`);
    if (el) {
      el.className = 'quran-word correct';
    }
    const wordObj = this.wordsList[index];
    if (wordObj) {
      wordObj.status = 'correct';
      
      // إذا كانت آخر كلمة في الآية، نغمة نجاح خفيفة
      const isLastInAyah = (index === this.wordsList.length - 1) || (this.wordsList[index + 1].ayah !== wordObj.ayah);
      if (isLastInAyah) {
        feedback.playAyahSuccess();
      }
    }
  }

  // تمييز الكلمة كخطأ مع التنبيه ونطق التصحيح بصوت الشيخ
  async markWordMistake(index, reason = '') {
    const wordObj = this.wordsList[index];
    if (!wordObj || wordObj.status === 'mistake') return;

    wordObj.status = 'mistake';
    this.mistakesCount++;
    this.mistakesList.push({
      surah: this.currentSurah.name,
      ayah: wordObj.ayah,
      word: wordObj.uthmani,
      reason: reason
    });

    this.dom.mistakesCountBadge.textContent = this.mistakesCount;

    // 1. التظليل الأحمر البصري
    const el = document.getElementById(`qword-${index}`);
    if (el) {
      el.className = 'quran-word mistake';
      setTimeout(() => {
        if (el && el.classList.contains('mistake')) {
          el.style.boxShadow = 'none';
        }
      }, 2500);
    }

    // 2. إيقاف التعرف الصوتي مؤقتاً أثناء نطق التصحيح لمنع التقاط صوت الهاتف نفسه
    const wasListening = this.speechEngine.isListening && !this.speechEngine.isPaused;
    if (wasListening) {
      this.isProcessingMistake = true;
      this.speechEngine.pause();
    }

    // 3. نطق التصحيح بصوت الشيخ كلمة بكلمة + الاهتزاز
    try {
      await feedback.playCorrection(wordObj.surah, wordObj.ayah, wordObj.position);
    } catch (e) {
      console.warn('Correction playback issue:', e);
    } finally {
      // 4. استئناف الاستماع بعد انتهاء نطق الكلمة
      if (wasListening) {
        setTimeout(() => {
          this.isProcessingMistake = false;
          this.speechEngine.resume();
        }, 300);
      }
    }
  }

  // الاستماع للكلمة الحالية بصوت الشيخ عند الضغط على زر 🔊
  async listenToCurrentWord() {
    if (this.currentWordIndex >= this.wordsList.length) return;
    const wordObj = this.wordsList[this.currentWordIndex];

    const wasListening = this.speechEngine.isListening && !this.speechEngine.isPaused;
    if (wasListening) {
      this.isProcessingMistake = true;
      this.speechEngine.pause();
    }

    try {
      await feedback.playWordAudio(wordObj.surah, wordObj.ayah, wordObj.position);
    } catch (e) {
      console.warn('Word audio error:', e);
    } finally {
      if (wasListening) {
        setTimeout(() => {
          this.isProcessingMistake = false;
          this.speechEngine.resume();
        }, 300);
      }
    }
  }

  // إعادة تسميع الآية الحالية
  repeatCurrentAyah() {
    if (this.wordsList.length === 0) return;
    const currentWord = this.wordsList[Math.min(this.currentWordIndex, this.wordsList.length - 1)];
    const currentAyah = currentWord.ayah;

    // العثور على أول كلمة في هذه الآية
    const firstWordIndex = this.wordsList.findIndex(w => w.ayah === currentAyah);
    if (firstWordIndex !== -1) {
      // إعادة تصفير حالة كلمات الآية من نقطة البداية
      for (let i = firstWordIndex; i <= this.currentWordIndex; i++) {
        const el = document.getElementById(`qword-${i}`);
        if (el) el.className = 'quran-word pending';
        this.wordsList[i].status = 'pending';
      }
      this.currentWordIndex = firstWordIndex;
      this.highlightActiveWord();
      feedback.playStartChime();
    }
  }

  // إتمام الجلسة وعرض النتيجة
  finishSession() {
    this.stopSession();

    const totalWords = this.wordsList.length || 1;
    const correctWords = Math.max(0, totalWords - this.mistakesCount);
    const score = Math.round((correctWords / totalWords) * 100);

    this.dom.scorePercent.textContent = `${score}%`;
    this.dom.resultsSummaryText.textContent = `أتممت تسميع ${this.endAyahNum - this.startAyahNum + 1} آيات (${totalWords} كلمة). الأخطاء: ${this.mistakesCount}`;

    // عرض قائمة الأخطاء للمراجعة
    if (this.mistakesList.length > 0) {
      this.dom.mistakesSection.style.display = 'block';
      this.dom.mistakesList.innerHTML = '';
      this.mistakesList.forEach(m => {
        const row = document.createElement('div');
        row.className = 'mistake-item';
        row.innerHTML = `
          <span>آية ${m.ayah}: <span class="mistake-word">${m.word}</span></span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${m.reason || 'تنبيه'}</span>
        `;
        this.dom.mistakesList.appendChild(row);
      });
    } else {
      this.dom.mistakesSection.style.display = 'none';
    }

    this.dom.resultsModal.classList.add('active');
  }

  // التقدم للآيات التالية تلقائياً
  advanceToNextSection() {
    const rangeSpan = this.endAyahNum - this.startAyahNum + 1;
    let nextStart = this.endAyahNum + 1;
    let nextEnd = nextStart + rangeSpan - 1;

    if (nextStart > this.currentSurah.ayahs) {
      // الانتقال للسورة التالية
      const nextSurahId = this.currentSurah.id + 1;
      if (nextSurahId <= 114) {
        this.dom.surahSelect.value = nextSurahId;
        this.onSurahChanged(nextSurahId);
        nextStart = 1;
        nextEnd = Math.min(rangeSpan, this.currentSurah.ayahs);
      } else {
        alert('مبارك! لقد ختمت القرآن الكريم كاملاً.');
        this.showView('setupView');
        return;
      }
    } else {
      nextEnd = Math.min(nextEnd, this.currentSurah.ayahs);
    }

    this.dom.startAyah.value = nextStart;
    this.dom.endAyah.value = nextEnd;
    this.startRecitationSession();
  }

  stopSession() {
    this.speechEngine.stop();
  }

  showView(viewId) {
    this.dom.setupView.classList.remove('active');
    this.dom.reciteView.classList.remove('active');
    if (this.dom[viewId]) {
      this.dom[viewId].classList.add('active');
    }
  }

  // دعم تثبيت PWA
  setupPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.dom.btnInstall.style.display = 'inline-flex';
    });

    this.dom.btnInstall.addEventListener('click', async () => {
      if (!this.deferredInstallPrompt) return;
      this.deferredInstallPrompt.prompt();
      const { outcome } = await this.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        this.dom.btnInstall.style.display = 'none';
      }
      this.deferredInstallPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
      this.dom.btnInstall.style.display = 'none';
    });
  }

  // مشاركة التطبيق
  async shareApp() {
    const shareData = {
      title: 'تطبيق مُسَمِّع للقرآن الكريم',
      text: 'جرّب تطبيق مُسَمِّع لتسميع القرآن الكريم ومقارنة حفظك لحظياً مع التنبيه والفتح بصوت الشيخ عند الخطأ!',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {}
    } else {
      // نسخ الرابط للحافظة
      try {
        await navigator.clipboard.writeText(window.location.href);
        alert('تم نسخ رابط التطبيق بنجاح لمشاركته مع الآخرين.');
      } catch (e) {
        alert(`رابط التطبيق: ${window.location.href}`);
      }
    }
  }
}

// تشغيل التطبيق عند اكتمال تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
  new MusammeApp();
});
