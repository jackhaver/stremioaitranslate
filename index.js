require('dotenv').config();
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const deepl = require('deepl-node');
const { parseSync, stringifySync } = require('subtitle');

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PORT = process.env.PORT || 7000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const CACHE_DIR = path.join(__dirname, 'cache');

if (!DEEPL_API_KEY && !GEMINI_API_KEY) {
  console.error('HATA: DEEPL_API_KEY veya GEMINI_API_KEY tanimli degil. En az birini .env dosyasina ya da Render "Environment" ayarlarina eklemelisin.');
  process.exit(1);
}

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const deeplTranslator = DEEPL_API_KEY ? new deepl.Translator(DEEPL_API_KEY) : null;

// ---- Cevirilebilir motorlar ----
// Her motorun: key (dosya adi ve id icin), label (Stremio listesinde gorunecek isim), translateBatch(texts) fonksiyonu var
const ENGINES = [];

if (deeplTranslator) {
  ENGINES.push({
    key: 'deepl',
    label: 'Türkçe (DeepL)',
    translateBatch: async (texts) => {
      const results = await deeplTranslator.translateText(texts, 'en', 'tr', {
        tagHandling: 'html'
      });
      return results.map(r => r.text);
    },
    batchSize: 50
  });
}

if (GEMINI_API_KEY) {
  ENGINES.push({
    key: 'gemini',
    label: 'Türkçe (Gemini AI)',
    translateBatch: async (texts) => translateBatchWithGemini(texts),
    batchSize: 40
  });
}

// ---- Gemini cevirisi (Google AI Studio REST API) ----
async function translateBatchWithGemini(texts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `Asagida bir film/dizi altyazisindan alinmis, JSON dizisi (array) halinde Ingilizce metin parcalari var. ` +
    `Her elemani dogal, akici Turkceye cevir. Kurallar:\n` +
    `- Cikti SADECE ayni uzunlukta bir JSON string dizisi olmali, baska hicbir metin ekleme\n` +
    `- Sira kesinlikle korunmali (index 0 -> index 0)\n` +
    `- HTML etiketlerini (<i>, <b> gibi) oldugu gibi koru\n` +
    `- Argo, deyim ve kufurleri de dogal Turkce karsiliklariyla cevir, sansurleme\n` +
    `- Her elemani bagimsiz cumle gibi degil, altyazi baglaminda cevir\n\n` +
    `JSON dizisi:\n${JSON.stringify(texts)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API hatasi (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini API bos yanit dondurdu');

  let translated;
  try {
    translated = JSON.parse(rawText);
  } catch (e) {
    throw new Error('Gemini API yaniti JSON olarak parse edilemedi');
  }

  if (!Array.isArray(translated) || translated.length !== texts.length) {
    throw new Error(`Gemini API beklenmeyen bicimde yanit verdi (beklenen: ${texts.length}, gelen: ${translated?.length})`);
  }

  return translated;
}

// ---- Manifest ----
const manifest = {
  id: 'org.stremio.trsubs.multi',
  version: '2.0.0',
  name: 'TR Altyazi (AI Ceviri)',
  description: 'Ingilizce altyaziyi DeepL ve/veya Gemini yapay zekasi ile otomatik olarak Turkceye cevirir',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: []
};

const builder = new addonBuilder(manifest);

// ---- Yardimci fonksiyonlar ----

async function fetchEnglishSubtitleUrl(type, id) {
  const osUrl = `https://opensubtitles-v3.strem.io/subtitles/${type}/${id}.json`;
  const res = await fetch(osUrl);
  if (!res.ok) throw new Error(`OpenSubtitles addon hata verdi: ${res.status}`);
  const data = await res.json();
  const subs = data.subtitles || [];
  const english = subs.filter(s => s.lang === 'eng');
  if (english.length === 0) return null;
  return english[0].url;
}

function cacheKeyFor(srtUrl, engineKey) {
  return crypto.createHash('sha256').update(srtUrl).digest('hex') + `.${engineKey}.tr.srt`;
}

async function translateSrt(srtText, engine) {
  const nodes = parseSync(srtText);
  const cueNodes = nodes.filter(n => n.type === 'cue');
  const texts = cueNodes.map(n => n.data.text);

  const BATCH = engine.batchSize || 40;
  const translated = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const results = await engine.translateBatch(batch);
    results.forEach(t => translated.push(t));
  }

  cueNodes.forEach((n, idx) => {
    n.data.text = translated[idx] ?? n.data.text;
  });

  return stringifySync(nodes, { format: 'SRT' });
}

async function getOrCreateTranslatedSubtitle(srtUrl, engine) {
  const fileName = cacheKeyFor(srtUrl, engine.key);
  const filePath = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return `${PUBLIC_URL}/subs/${fileName}`;
  }

  const res = await fetch(srtUrl);
  if (!res.ok) throw new Error(`Altyazi indirilemedi: ${res.status}`);
  const srtText = await res.text();

  const translatedSrt = await translateSrt(srtText, engine);
  fs.writeFileSync(filePath, translatedSrt, 'utf8');

  return `${PUBLIC_URL}/subs/${fileName}`;
}

// ---- Subtitles handler ----

builder.defineSubtitlesHandler(async ({ type, id }) => {
  try {
    const englishSrtUrl = await fetchEnglishSubtitleUrl(type, id);
    if (!englishSrtUrl) {
      console.log(`[trsubs] ${id} icin ingilizce altyazi bulunamadi`);
      return { subtitles: [] };
    }

    const subtitles = [];

    // Her motor icin ayri ayri dene, biri hata verirse digerini engellemesin
    for (const engine of ENGINES) {
      try {
        const translatedUrl = await getOrCreateTranslatedSubtitle(englishSrtUrl, engine);
        subtitles.push({
          id: `trsubs-${engine.key}`,
          url: translatedUrl,
          lang: engine.label
        });
      } catch (err) {
        console.error(`[trsubs] ${engine.key} motoru hata verdi:`, err.message);
      }
    }

    return { subtitles };
  } catch (err) {
    console.error('[trsubs] Hata:', err.message);
    return { subtitles: [] };
  }
});

// ---- Sunucu ----

const app = express();
app.use(getRouter(builder.getInterface()));
app.use('/subs', express.static(CACHE_DIR));

app.listen(PORT, () => {
  console.log(`Addon calisiyor: ${PUBLIC_URL}/manifest.json`);
  console.log(`Aktif ceviri motorlari: ${ENGINES.map(e => e.key).join(', ') || 'YOK - key eklenmemis'}`);
  console.log('Bu adresi Stremio > Addonlar > "Addon linki gir" kismina yapistir.');
});
