/**
 * مُسَمِّع - خوارزمية تطبيع ومطابقة النص القرآني (Quran Text Normalizer & Matcher)
 * مصممة لتجاوز فروق التجويد والإدغام والرسم العثماني
 */

// إزالة التشكيل والرموز وضبط الحروف المتشابهة للمقارنة الصوتية
export function normalizeQuranText(text) {
  if (!text) return '';
  return text
    .trim()
    // 1. إزالة التشكيل الكامل والتنوين
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // 2. إزالة علامات الوقف وضبط المصحف (مثل الجيم، قلى، صلى، إلخ)
    .replace(/[\u06D6-\u06ED]/g, '')
    // 3. توحيد جميع أشكال الهمزات والألف
    .replace(/[إأآءٱ]/g, 'ا')
    // 4. توحيد الياء والألف المقصورة
    .replace(/[ىي]/g, 'ي')
    // 5. توحيد التاء المربوطة والهاء
    .replace(/ة/g, 'ه')
    // 6. إزالة الواو الصغيرة والألف الخنجرية الزائدة
    .replace(/[ۥۦ]/g, '')
    // 7. إزالة كشيدة التطويل
    .replace(/ـ+/g, '')
    // 8. إزالة أرقام الآيات والأقواس
    .replace(/[0-9٠-٩()\[\]{}«»]/g, '')
    // 9. دمج المسافات
    .replace(/\s+/g, ' ')
    .trim();
}

// حساب مسافة ليفنشتاين لنسبة التشابه
export function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// حساب نسبة التشابه بين كلمتين (من 0 إلى 1)
export function wordSimilarity(w1, w2) {
  if (!w1 || !w2) return 0;
  if (w1 === w2) return 1.0;
  const maxLen = Math.max(w1.length, w2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(w1, w2);
  return 1 - (dist / maxLen);
}

// فحص تطابق الكلمة المنطوقة مع الكلمة المتوقعة في الآية
export function isWordMatch(spokenRaw, expectedRaw) {
  const spoken = normalizeQuranText(spokenRaw);
  const expected = normalizeQuranText(expectedRaw);

  if (!spoken || !expected) return false;

  // 1. مطابقة تامة بعد التطبيع
  if (spoken === expected) return true;

  // 2. مطابقة بادئات العطف والجر (الواو، الفاء، الباء، الكاف، اللام)
  // مثال: القارئ نطق "والسماء" بينما هي "السماء" أو العكس
  const prefixes = ['و', 'ف', 'ب', 'ل', 'ك'];
  for (const p of prefixes) {
    if (spoken === p + expected || expected === p + spoken) {
      return true;
    }
  }

  // 3. مطابقة "ال" التعريف (مثل: ملك / الملك)
  if (spoken === 'ال' + expected || expected === 'ال' + spoken) {
    return true;
  }

  // 4. مطابقة الفروق الصوتية في أحكام التجويد والإدغام (مثل: من يقول -> ميقول)
  if (wordSimilarity(spoken, expected) >= 0.75) {
    return true;
  }

  return false;
}

// تقسيم نص الآية إلى مصفوفة كلمات مهيأة للعرض والمقارنة
export function parseAyahIntoWords(uthmaniText, surahId, ayahNumber) {
  if (!uthmaniText) return [];
  
  // تقسيم النص العثماني إلى كلمات مفردة
  const rawWords = uthmaniText.trim().split(/\s+/).filter(w => w.length > 0);

  return rawWords.map((word, index) => {
    return {
      id: `${surahId}:${ayahNumber}:${index}`,
      surah: surahId,
      ayah: ayahNumber,
      position: index,
      uthmani: word,
      normalized: normalizeQuranText(word),
      status: 'pending' // pending | active | correct | mistake | skipped
    };
  });
}
