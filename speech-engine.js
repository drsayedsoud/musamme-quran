/**
 * مُسَمِّع - محرك التعرف الصوتي المزدوج (Dual Speech Recognition Engine)
 * يدعم نمطين:
 * 1. المحرك السحابي السريع (Web Speech API) - خفيف وبدون تنزيل ملفات
 * 2. الذكاء الاصطناعي المحلي (On-Device Whisper WASM) - بصفر إنترنت 100%
 */

import { offlineAIService } from './offline-ai-service.js';

export class SpeechEngine {
  constructor() {
    this.engineMode = localStorage.getItem('musamme_engine_mode') || 'cloud'; // 'cloud' | 'offline'
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioContext = null;
    
    this.isListening = false;
    this.isPaused = false;
    this.processedCounts = {};
    
    // Callbacks
    this.onWordRecognized = null;
    this.onStateChange = null;
    this.onError = null;

    this.initCloudRecognition();
  }

  isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window || !!navigator.mediaDevices;
  }

  setEngineMode(mode) {
    if (this.engineMode === mode) return;
    const wasListening = this.isListening;
    this.stop();
    this.engineMode = mode;
    localStorage.setItem('musamme_engine_mode', mode);
    if (wasListening) {
      this.start();
    }
  }

  initCloudRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'ar-SA';
    this.recognition.maxAlternatives = 2;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStateChange) this.onStateChange({ listening: true, paused: this.isPaused, mode: this.engineMode });
    };

    this.recognition.onresult = (event) => {
      if (this.isPaused || this.engineMode !== 'cloud') return;

      const results = event.results;
      for (let i = event.resultIndex; i < results.length; i++) {
        const item = results[i];
        const isFinal = item.isFinal;
        const transcript = item[0].transcript.trim();
        const words = transcript.split(/\s+/).filter(w => w.length > 0);

        if (isFinal) {
          const processedSoFar = this.processedCounts[i] || 0;
          const newFinalWords = words.slice(processedSoFar);
          this.processedCounts[i] = words.length;

          for (const w of newFinalWords) {
            if (this.onWordRecognized) {
              this.onWordRecognized({ text: w, isFinal: true });
            }
          }
        } else {
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
      if (this.isListening && !this.isPaused && this.engineMode === 'cloud') {
        try {
          this.recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isListening && !this.isPaused && this.engineMode === 'cloud') {
              try { this.recognition.start(); } catch (err) {}
            }
          }, 300);
        }
      } else if (this.engineMode === 'cloud') {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange({ listening: false, paused: this.isPaused, mode: this.engineMode });
      }
    };
  }

  // بدء التسجيل الصوتي للذكاء الاصطناعي المحلي أوفلاين
  async startOfflineRecording() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      let pcmBuffer = [];
      const CHUNK_DURATION = 2.5; // معالجة كل ثانيتين ونصف
      const SAMPLES_TARGET = 16000 * CHUNK_DURATION;

      processor.onaudioprocess = async (e) => {
        if (this.isPaused || this.engineMode !== 'offline') return;

        const inputData = e.inputBuffer.getChannelData(0);
        pcmBuffer.push(...inputData);

        if (pcmBuffer.length >= SAMPLES_TARGET) {
          const chunk = new Float32Array(pcmBuffer);
          pcmBuffer = [];

          try {
            const text = await offlineAIService.transcribe(chunk);
            if (text) {
              const words = text.split(/\s+/).filter(w => w.length > 0);
              for (const w of words) {
                if (this.onWordRecognized) {
                  this.onWordRecognized({ text: w, isFinal: true });
                }
              }
            }
          } catch (err) {
            console.warn('Offline transcribe cycle error:', err);
          }
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      this.isListening = true;
      if (this.onStateChange) this.onStateChange({ listening: true, paused: this.isPaused, mode: this.engineMode });
    } catch (e) {
      console.error('Offline mic capture error:', e);
      if (this.onError) this.onError(e);
      // الرجوع للمحرك السحابي في حال تعذر
      this.setEngineMode('cloud');
    }
  }

  clearBuffer() {
    this.processedCounts = {};
  }

  start() {
    this.isPaused = false;
    this.clearBuffer();

    if (this.engineMode === 'offline') {
      return this.startOfflineRecording();
    } else {
      if (!this.recognition) return false;
      try {
        this.recognition.start();
        this.isListening = true;
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  stop() {
    this.isListening = false;
    this.isPaused = false;
    this.clearBuffer();

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }

    if (this.onStateChange) this.onStateChange({ listening: false, paused: false, mode: this.engineMode });
  }

  pause() {
    this.isPaused = true;
    if (this.onStateChange) this.onStateChange({ listening: this.isListening, paused: true, mode: this.engineMode });
  }

  resume() {
    this.isPaused = false;
    if (!this.isListening) {
      this.start();
    } else {
      if (this.onStateChange) this.onStateChange({ listening: true, paused: false, mode: this.engineMode });
    }
  }
}
