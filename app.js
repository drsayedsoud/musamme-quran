/**
 * مُسَمِّع - المتحكم الرئيسي للتطبيق (Application Controller)
 * مع إدارة محرك الذكاء الاصطناعي المزدوج (سحابي / محلي أوفلاين)
 */

import { SURAHS } from './quran-data.js';
import { feedback } from './audio-feedback.js';
import { parseAyahIntoWords, isWordMatch, normalizeQuranText } from './quran-matcher.js';
import { SpeechEngine } from './speech-engine.js';
import { offlineAIService } from './offline-ai-service.js';

class MusammeApp {
  constructor() {
    this.quranData = null;
    this.speechEngine = new SpeechEngine();

    // حالة جلسة التسميع الحالية
    this.currentSurah = null;
    this.startAyahNum = 1;
    this.endAyahNum = 7;
    this.recitationMode = 'hafiz';

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
      settingsModal: document.getElementById('settingsModal'),

      // أزرار ترويسة
      btnInstall: document.getElementById('btnInstall'),
      btnOpenSettings: document.getElementById('btnOpenSettings'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      btnSaveSettings: document.getElementById('btnSaveSettings'),
      btnShareApp: document.getElementById('btnShareApp'),
      btnSoundToggle: document.getElementById('btnSoundToggle'),
      activeEngineBadge: document.getElementById('activeEngineBadge'),

      // خيارات محرك الذكاء الاصطناعي
      optEngineCloud: document.getElementById('optEngineCloud'),
      optEngineOffline: document.getElementById('optEngineOffline'),
      offlineModelStatusBadge: document.getElementById('offlineModelStatusBadge'),
      btnDownloadModel: document.getElementById('btnDownloadModel'),
      btnDeleteModel: document.getElementById('btnDeleteModel'),
      downloadProgressContainer: document.getElementById('downloadProgressContainer'),
      progressStatusText: document.getElementById('progressStatusText'),
      progressPercentText: document.getElementById('progressPercentText'),
      progressBarFill: document.getElementById('progressBarFill'),

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
    await this.checkOfflineModelStatus();
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

    this.dom.quickPills.forEach(p => p.classList.toggle('active', p.dataset.range === 'all'));
  }

  // التحقق من حالة حزمة الذكاء الاصطناعي الأوفلاين
  async checkOfflineModelStatus() {
    const isCached = await offlineAIService.isModelCached();
    if (isCached) {
      this.dom.offlineModelStatusBadge.textContent = 'جاهز ومثبت ✅';
      this.dom.offlineModelStatusBadge.className = 'engine-badge offline';
      this.dom.btnDownloadModel.style.display = 'none';
      this.dom.btnDeleteModel.style.display = 'inline-flex';
    } else {
      this.dom.offlineModelStatusBadge.textContent = 'غير محمل';
      this.dom.offlineModelStatusBadge.className = 'engine-badge';
      this.dom.btnDownloadModel.style.display = 'inline-flex';
      this.dom.btnDeleteModel.style.display = 'none';
      if (this.speechEngine.engineMode === 'offline') {
        this.setEngineMode('cloud');
      }
    }

    this.updateEngineUI();
  }

  updateEngineUI() {
    const mode = this.speechEngine.engineMode;
    if (mode === 'offline') {
      this.dom.activeEngineBadge.textContent = '📴 الذكاء الاصطناعي المحلي (أوفلاين)';
      this.dom.activeEngineBadge.className = 'engine-badge offline';
      this.dom.optEngineOffline.classList.add('selected');
      this.dom.optEngineCloud.classList.remove('selected');
    } else {
      this.dom.activeEngineBadge.textContent = '🌐 المحرك السحابي السريع';
      this.dom.activeEngineBadge.className = 'engine-badge cloud';
      this.dom.optEngineCloud.classList.add('selected');
      this.dom.optEngineOffline.classList.remove('selected');
    }
  }

  setEngineMode(mode) {
    this.speechEngine.setEngineMode(mode);
    this.updateEngineUI();
  }

  setupEventListeners() {
    // نافذة الإعدادات
    this.dom.btnOpenSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('active');
    });

    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('active');
    });

    this.dom.btnSaveSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('active');
    });

    // اختيار المحرك السحابي
    this.dom.optEngineCloud.addEventListener('click', () => {
      this.setEngineMode('cloud');
    });

    // اختيار المحرك المحلي الأوفلاين
    this.dom.optEngineOffline.addEventListener('click', async () => {
      const isCached = await offlineAIService.isModelCached();
      if (!isCached) {
        if (confirm('حزمة الذكاء الاصطناعي المحلي لم يتم تحميلها بعد. هل تريد بدء تحميل الحزمة الآن (39MB) لتعمل بدون إنترنت للأبد؟')) {
          this.startModelDownload();
        }
      } else {
        this.setEngineMode('offline');
      }
    });

    // زر تنزيل النموذج المحلي
    this.dom.btnDownloadModel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startModelDownload();
    });

    // زر حذف النموذج
    this.dom.btnDeleteModel.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('هل أنت متأكد من حذف حزمة الذكاء الاصطناعي وتفريغ 39 ميجابايت من هاتفك؟ سيعود التطبيق لاستخدام المحرك السحابي.')) {
        await offlineAIService.deleteModelFromCache();
        this.setEngineMode('cloud');
        await this.checkOfflineModelStatus();
        alert('تم حذف الحزمة وتفريغ المساحة بنجاح.');
      }
    });

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

  // تنزيل نموذج الذكاء الاصطناعي مع شريط التقدم
  async startModelDownload() {
    this.dom.downloadProgressContainer.style.display = 'flex';
    this.dom.btnDownloadModel.disabled = true;
    this.dom.progressStatusText.textContent = 'جاري التنزيل وحفظ الحزمة في هاتفك...';

    try {
      await offlineAIService.downloadAndInitModel((percent, file) => {
        this.dom.progressPercentText.textContent = `${percent}%`;
        this.dom.progressBarFill.style.width = `${percent}%`;
      });

      this.dom.downloadProgressContainer.style.display = 'none';
      await this.checkOfflineModelStatus();
      this.setEngineMode('offline');
      alert('مبروك! تم تنزيل حزمة الذكاء الاصطناعي بنجاح، التطبيق الآن يتعرف على صوتك بصفر إنترنت تماماً.');
    } catch (err) {
      this.dom.downloadProgressContainer.style.display = 'none';
      this.dom.btnDownloadModel.disabled = false;
      alert('حدث خطأ أثناء تنزيل الحزمة، يرجى التأكد من اتصال الإنترنت والمحاولة ثانية.');
    }
  }

  // إعداد استجابات التعرف الصوتي
  setupSpeechCallbacks() {
    this.speechEngine.onWordRecognized = (token) => {
      if (this.isProcessingMistake) return;
      this.handleSpokenToken(token);
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

    this.renderQuranWords();

    this.dom.reciteSurahTitle.textContent = `سورة ${this.currentSurah.name}`;
    this.dom.currentAyahBadge.textContent = this.startAyahNum;
    this.dom.mistakesCountBadge.textContent = '0';
    this.dom.quranCanvas.className = `quran-canvas mode-${this.recitationMode}`;

    this.showView('reciteView');
    this.highlightActiveWord();
    
    feedback.playStartChime();
    setTimeout(() => {
      this.speechEngine.start();
    }, 350);
  }

  // رسم كلمات الآيات في لوحة القراءة
  renderQuranWords() {
    this.dom.quranCanvas.innerHTML = '';
    let lastAyah = null;

    this.wordsList.forEach((wordObj, idx) => {
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
      
      span.addEventListener('click', () => {
        feedback.playWordAudio(wordObj.surah, wordObj.ayah, wordObj.position);
      });

      this.dom.quranCanvas.appendChild(span);
      lastAyah = wordObj.ayah;
    });

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

    document.querySelectorAll('.quran-word.active').forEach(el => el.classList.remove('active'));

    const currentEl = document.getElementById(`qword-${this.currentWordIndex}`);
    if (currentEl) {
      currentEl.classList.remove('pending');
      currentEl.classList.add('active');
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const activeWord = this.wordsList[this.currentWordIndex];
      if (activeWord) {
        this.dom.currentAyahBadge.textContent = activeWord.ayah;
      }
    }
  }

  // المعالجة الدقيقة للكلمة المنطوقة
  async handleSpokenToken(token) {
    if (this.currentWordIndex >= this.wordsList.length) return;

    const spoken = token.text;
    const expected = this.wordsList[this.currentWordIndex];

    // 1. هل الكلمة مطابقة للكلمة الحالية؟
    if (isWordMatch(spoken, expected.uthmani)) {
      this.markWordCorrect(this.currentWordIndex);
      this.currentWordIndex++;
      this.highlightActiveWord();

      if (this.currentWordIndex >= this.wordsList.length) {
        setTimeout(() => this.finishSession(), 500);
      }
      return;
    }

    // 2. هل القارئ تجاوز كلمة (نسيها) وانتقل للتالية؟
    if (this.currentWordIndex + 1 < this.wordsList.length) {
      const nextExpected = this.wordsList[this.currentWordIndex + 1];
      if (isWordMatch(spoken, nextExpected.uthmani)) {
        await this.markWordMistake(this.currentWordIndex, 'نسيان أو تجاوز كلمة');
        
        this.currentWordIndex++;
        this.markWordCorrect(this.currentWordIndex);
        this.currentWordIndex++;
        this.highlightActiveWord();

        if (this.currentWordIndex >= this.wordsList.length) {
          setTimeout(() => this.finishSession(), 500);
        }
        return;
      }
    }
  }

  // تمييز الكلمة صحيحة
  markWordCorrect(index) {
    const el = document.getElementById(`qword-${index}`);
    if (el) {
      el.className = 'quran-word correct';
    }
    const wordObj = this.wordsList[index];
    if (wordObj) {
      wordObj.status = 'correct';
      
      const isLastInAyah = (index === this.wordsList.length - 1) || (this.wordsList[index + 1].ayah !== wordObj.ayah);
      if (isLastInAyah) {
        feedback.playAyahSuccess();
        this.speechEngine.clearBuffer();
      }
    }
  }

  // تمييز الكلمة كخطأ مع التنبيه ونطق التصحيح
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

    const el = document.getElementById(`qword-${index}`);
    if (el) {
      el.className = 'quran-word mistake';
      setTimeout(() => {
        if (el && el.classList.contains('mistake')) {
          el.style.boxShadow = 'none';
        }
      }, 2500);
    }

    const wasListening = this.speechEngine.isListening && !this.speechEngine.isPaused;
    if (wasListening) {
      this.isProcessingMistake = true;
      this.speechEngine.pause();
    }

    try {
      await feedback.playCorrection(wordObj.surah, wordObj.ayah, wordObj.position);
    } catch (e) {
      console.warn('Correction playback issue:', e);
    } finally {
      if (wasListening) {
        setTimeout(() => {
          this.isProcessingMistake = false;
          this.speechEngine.resume();
        }, 300);
      }
    }
  }

  // الاستماع للكلمة الحالية بصوت الشيخ
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

    const firstWordIndex = this.wordsList.findIndex(w => w.ayah === currentAyah);
    if (firstWordIndex !== -1) {
      this.speechEngine.clearBuffer();

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
