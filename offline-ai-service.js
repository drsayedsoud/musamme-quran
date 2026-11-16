/**
 * مُسَمِّع - خدمة الذكاء الاصطناعي المحلي (On-Device AI Speech Service)
 * تعمل بالكامل داخل متصفح الهاتف عبر WebAssembly و WebGPU (Transformers.js)
 * استهلاك الإنترنت = 0.00 KB بعد تنزيل النموذج لمرة واحدة
 */

class OfflineAIService {
  constructor() {
    this.pipeline = null;
    this.isModelLoaded = false;
    this.isDownloading = false;
    this.modelName = 'Xenova/whisper-tiny';
  }

  // فحص هل النموذج مخزن مسبقاً في كاش المتصفح
  async isModelCached() {
    if ('caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        const transformersCacheKey = cacheKeys.find(k => k.includes('transformers') || k.includes('onnx'));
        if (transformersCacheKey) {
          const cache = await caches.open(transformersCacheKey);
          const requests = await cache.keys();
          // إذا كان الكاش يحتوي على ملفات النموذج (الـ onnx والـ tokenizer)
          return requests.length >= 3;
        }
      } catch (e) {
        console.warn('Cache check error:', e);
      }
    }
    return localStorage.getItem('musamme_offline_model_ready') === 'true';
  }

  // تنزيل وحفظ النموذج داخل ذاكرة الهاتف لمرة واحدة للأبد مع مؤشر التقدم
  async downloadAndInitModel(progressCallback) {
    if (this.isModelLoaded) return true;
    this.isDownloading = true;

    try {
      // استيراد مكتبة Transformers.js ديناميكياً فقط عند طلب المستخدم
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      // تهيئة معالج الصوت مع إشعار التقدم
      this.pipeline = await pipeline('automatic-speech-recognition', this.modelName, {
        quantized: true, // استخدام النسخة المكممة 8-bit لتخفيف الحجم لـ ~39MB
        progress_callback: (info) => {
          if (progressCallback && info.status === 'progress') {
            const percent = Math.round(info.progress || 0);
            progressCallback(percent, info.file);
          }
        }
      });

      this.isModelLoaded = true;
      this.isDownloading = false;
      localStorage.setItem('musamme_offline_model_ready', 'true');
      return true;
    } catch (error) {
      this.isDownloading = false;
      console.error('Failed to download on-device model:', error);
      throw error;
    }
  }

  // معالجة مقطع صوتي وتحويله لنص محلياً داخل معالج الهاتف
  async transcribe(audioBuffer) {
    if (!this.pipeline) {
      const ready = await this.downloadAndInitModel();
      if (!ready) throw new Error('Offline AI model not loaded');
    }

    try {
      // تشغيل المعالجة باللغة العربية
      const output = await this.pipeline(audioBuffer, {
        language: 'arabic',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5
      });

      return output.text ? output.text.trim() : '';
    } catch (e) {
      console.error('Local transcription error:', e);
      return '';
    }
  }

  // حذف النموذج من كاش المتصفح لتوفير المساحة إن أراد المستخدم
  async deleteModelFromCache() {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      for (const key of cacheKeys) {
        if (key.includes('transformers') || key.includes('onnx')) {
          await caches.delete(key);
        }
      }
    }
    localStorage.removeItem('musamme_offline_model_ready');
    this.pipeline = null;
    this.isModelLoaded = false;
    return true;
  }
}

export const offlineAIService = new OfflineAIService();
