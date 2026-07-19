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
const PORT = process.env.PORT || 7000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const CACHE_DIR = path.join(__dirname, 'cache');

if (!DEEPL_API_KEY) {
  console.error('HATA: DEEPL_API_KEY ortam degiskeni tanimli degil. .env dosyasina veya Render "Environment" ayarlarina ekleyin.');
  process.exit(1);
}

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const translator = new deepl.Translator(DEEPL_API_KEY);

// ---- Manifest ----
const manifest = {
  id: 'org.stremio.trsubs.deepl',
  version: '1.0.0',
  name: 'TR Altyazi (DeepL AI)',
  description: 'Ingilizce altyaziyi DeepL yapay zekasi ile otomatik olarak Turkceye cevirir',
  logo: `${PUBLIC_URL}/logo.png`,
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

function cacheKeyFor(srtUrl) {
  return crypto.createHash('sha256').update(srtUrl).digest('hex') + '.tr.srt';
}

async function translateSrt(srtText) {
  const nodes = parseSync(srtText);
  const cueNodes = nodes.filter(n => n.type === 'cue');
  const texts = cueNodes.map(n => n.data.text);

  // DeepL: bir istekte en fazla 50 metin gonderilebilir
  const BATCH = 50;
  const translated = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const results = await translator.translateText(batch, 'en', 'tr', {
      tagHandling: 'html' // altyazidaki <i>, <b> gibi taglari korur
    });
    results.forEach(r => translated.push(r.text));
  }

  cueNodes.forEach((n, idx) => {
    n.data.text = translated[idx];
  });

  return stringifySync(nodes, { format: 'SRT' });
}

async function getOrCreateTranslatedSubtitle(srtUrl) {
  const fileName = cacheKeyFor(srtUrl);
  const filePath = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(filePath)) {
    return `${PUBLIC_URL}/subs/${fileName}`;
  }

  const res = await fetch(srtUrl);
  if (!res.ok) throw new Error(`Altyazi indirilemedi: ${res.status}`);
  const srtText = await res.text();

  const translatedSrt = await translateSrt(srtText);
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

    const translatedUrl = await getOrCreateTranslatedSubtitle(englishSrtUrl);

    return {
      subtitles: [
        {
          id: 'trsubs-deepl',
          url: translatedUrl,
          lang: 'tur'
        }
      ]
    };
  } catch (err) {
    console.error('[trsubs] Hata:', err.message);
    return { subtitles: [] };
  }
});

// ---- Sunucu ----

const app = express();
app.use(getRouter(builder.getInterface()));
app.use('/subs', express.static(CACHE_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Addon calisiyor: ${PUBLIC_URL}/manifest.json`);
  console.log('Bu adresi Stremio > Addonlar > "Addon linki gir" kismina yapistir.');
});
