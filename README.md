# Stremio TR Altyazı Addon'u (DeepL AI)

İngilizce altyazıyı OpenSubtitles addon'undan çeker, DeepL yapay zekasıyla
Türkçeye çevirir ve Stremio'ya sunar.

## 1. DeepL API Key Al

1. https://www.deepl.com/pro-api adresine git
2. "Sign up for free" ile ücretsiz hesap aç (kredi kartı istenir ama ücretsiz
   planda (DeepL API Free) otomatik ücret kesilmez, ayda 500.000 karakter dahil)
3. Hesabına girip **Account > API Keys** kısmından anahtarını kopyala
   (sonu `:fx` ile biten bir anahtar olacak, bu normal — Free plan anahtarıdır)

## 2. Yerelde Çalıştırma (test için)

```bash
cd stremio-tr-subs
npm install
cp .env.example .env
```

`.env` dosyasını aç, `DEEPL_API_KEY` satırına kendi anahtarını yapıştır.

```bash
npm start
```

Terminalde şunu göreceksin:
```
Addon calisiyor: http://127.0.0.1:7000/manifest.json
```

Stremio uygulamasını aç → **Addonlar** → sağ üstteki arama kutusuna
`http://127.0.0.1:7000/manifest.json` yapıştır → Enter.
Addon'u kurduktan sonra bir film/dizi aç, altyazı listesinde
**"TR Altyazı (DeepL AI)"** çıkacak.

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
   - `DEEPL_API_KEY` = kendi anahtarın
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
4. Satırları 50'şerlik gruplar halinde DeepL API'ye gönderip Türkçeye çevirir
5. Çevrilmiş .srt dosyasını `cache/` klasörüne kaydeder (aynı içerik tekrar
   istenirse yeniden çevirmez, API kotanı korur)
6. Türkçe altyazının adresini Stremio'ya döner

## Sınırlamalar / Bilinecekler

- Sadece IMDb id'si olan (tt ile başlayan) içerikler için çalışır
- OpenSubtitles'ta İngilizce altyazısı olmayan içerikler için sonuç dönmez
- DeepL Free planda aylık 500.000 karakter sınırı var — ortalama bir filmin
  altyazısı ~15-25 bin karakter, yani ayda ~20-30 film/dizi bölümü çevirebilirsin
- Çeviri kalitesi satır satır yapıldığı için bazen bağlamdan kopabilir
  (altyazı formatının doğası budur, tüm çeviri addon'ları aynı sorunu yaşar)
