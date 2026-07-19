# Stremio TR Altyazı Addon'u (DeepL + Gemini AI)

İngilizce altyazıyı OpenSubtitles addon'undan çeker, **DeepL** ve/veya
**Gemini (Google AI Studio)** yapay zekasıyla Türkçeye çevirir ve Stremio'ya
iki ayrı seçenek olarak sunar. Sadece birinin key'ini eklersen sadece o
görünür, ikisini de eklersen Stremio'da "Türkçe (DeepL)" ve "Türkçe (Gemini AI)"
diye iki ayrı altyazı seçeneği çıkar.

## 1. DeepL API Key Al

1. https://www.deepl.com/pro-api adresine git
2. "Sign up for free" ile ücretsiz hesap aç (kredi kartı istenir ama ücretsiz
   planda (DeepL API Free) otomatik ücret kesilmez, ayda 500.000 karakter dahil)
3. Hesabına girip **Account > API Keys** kısmından anahtarını kopyala
   (sonu `:fx` ile biten bir anahtar olacak, bu normal — Free plan anahtarıdır)

## 1b. Gemini API Key Al (opsiyonel, ücretsiz)

> Not: Telefonundaki/tarayıcındaki Gemini uygulaması aboneliğin (Pro/Ultra)
> bu key'i etkilemez, API ayrı bir sistemdir ve aşağıdaki yöntemle tamamen
> ücretsiz kullanılır.

1. https://aistudio.google.com adresine git, Google hesabınla giriş yap
2. Sol menüden **"Get API key"** → **"Create API key"**
3. Çıkan anahtarı kopyala (kredi kartı istemez, ücretsiz kotayla çalışır)

İkisi de olmak zorunda değil — sadece elindeki key'i `.env` dosyasına (veya
Render Environment kısmına) ekle, addon otomatik olarak hangileri varsa
onları kullanır.

## 2. Yerelde Çalıştırma (test için)

```bash
cd stremio-tr-subs
npm install
cp .env.example .env
```

`.env` dosyasını aç, elindeki anahtar(lar)ı ilgili satırlara yapıştır. Sadece
biri varsa diğer satırı olduğu gibi bırakabilir ya da silebilirsin.

```bash
npm start
```

Terminalde şunu göreceksin:
```
Addon calisiyor: http://127.0.0.1:7000/manifest.json
Aktif ceviri motorlari: deepl, gemini
```

Stremio uygulamasını aç → **Addonlar** → sağ üstteki arama kutusuna
`http://127.0.0.1:7000/manifest.json` yapıştır → Enter.
Addon'u kurduktan sonra bir film/dizi aç, altyazı listesinde
**"Türkçe (DeepL)"** ve/veya **"Türkçe (Gemini AI)"** seçenekleri çıkacak.

> Not: Bu sadece kendi bilgisayarında çalışır. Başka bir cihazdan
> (telefon, TV) kullanmak istersen adım 3'e geç.

## 3. İnternete Açma (Render.com — ücretsiz)

Telefonundan/TV'nden de kullanabilmek için sunucuyu internete koymalısın.

1. Kodu bir GitHub reposuna yükle
2. https://render.com üzerinde ücretsiz hesap aç, GitHub'ını bağla
3. "New +" → "Web Service" → reponu seç
4. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. "Environment" sekmesinden değişken ekle:
   - `DEEPL_API_KEY` = kendi DeepL anahtarın (varsa)
   - `GEMINI_API_KEY` = kendi Gemini anahtarın (varsa)
   - `PUBLIC_URL` = Render sana verdiği adres (örn. `https://senin-addon.onrender.com`)
     — bu adresi ilk deploy'dan sonra öğrenip tekrar kaydetmen gerekir
6. Deploy bitince `https://senin-addon.onrender.com/manifest.json` adresini
   Stremio'ya (aynı adımlarla) ekle

> Ücretsiz Render planı boşta kalınca uykuya geçer, ilk istek birkaç saniye
> gecikebilir — normal.

## Nasıl Çalışıyor

1. Stremio bir video açtığında addon'a `subtitles` isteği gönderir
2. Addon, OpenSubtitles'ın herkese açık Stremio addon API'sinden
   o içeriğin İngilizce .srt dosyasının adresini bulur
3. .srt dosyasını indirir, satırlara ayırır
4. Aktif olan her motor (DeepL ve/veya Gemini) için ayrı ayrı çeviri yapılır:
   - **DeepL:** satırları 50'şerlik gruplar halinde DeepL API'ye gönderip çevirir
   - **Gemini:** satırları 40'şarlık gruplar halinde, tüm grubu tek seferde
     JSON formatında çevirmesini isteyerek gönderir (bağlamı daha iyi anlar)
5. Çevrilmiş .srt dosyaları `cache/` klasörüne motor bazında ayrı kaydedilir
   (aynı içerik + aynı motor tekrar istenirse yeniden çevirmez, API kotanı korur)
6. Türkçe altyazı adresleri Stremio'ya ayrı ayrı seçenekler olarak döner

## Sınırlamalar / Bilinecekler

- Sadece IMDb id'si olan (tt ile başlayan) içerikler için çalışır
- OpenSubtitles'ta İngilizce altyazısı olmayan içerikler için sonuç dönmez
- DeepL Free planda aylık 500.000 karakter sınırı var — ortalama bir filmin
  altyazısı ~15-25 bin karakter, yani ayda ~20-30 film/dizi bölümü çevirebilirsin
- Gemini ücretsiz katmanında (Google AI Studio) dakika/gün başına istek
  limiti var; Flash modeli kullanıldığı için Pro modele göre daha cömert
- Çeviri kalitesi satır satır yapıldığı için bazen bağlamdan kopabilir
  (altyazı formatının doğası budur, tüm çeviri addon'ları aynı sorunu yaşar) —
  Gemini bu konuda genelde biraz daha başarılı çünkü grup halinde bağlamla çevirir
