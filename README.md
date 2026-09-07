# İzmir Köy Yolları Devir Haritası

İzmir'de **İl Özel İdaresi'nden Büyükşehir Belediyesi'ne geçen mahalle ve köy yollarının**
belirlenmesi çalışmasının herkese açık harita sitesi.

QGIS'te sürdürdüğünüz katmanı bu depoya yüklüyorsunuz, site kendiliğinden güncelleniyor.
**Kod yazmanız gerekmiyor.**

🌍 **Site adresi:** https://orbayskrcl.github.io/ulasim-planlama-yollar/
_(Aşağıdaki "Tek seferlik kurulum" adımını yaptıktan birkaç dakika sonra açılır.)_

---

## İçindekiler

1. [Tek seferlik kurulum](#1-tek-seferlik-kurulum-sadece-bir-kez)
2. [Veriyi güncelleme](#2-veriyi-güncelleme-her-değişiklikte)
3. [QGIS'ten doğru KML nasıl çıkarılır](#3-qgisten-doğru-kml-nasıl-çıkarılır)
4. [Kategori adı, renk ve başlıkları değiştirme](#4-kategori-adı-renk-ve-başlıkları-değiştirme)
5. [İlçe filtresi ekleme (isteğe bağlı)](#5-ilçe-filtresi-ekleme-isteğe-bağlı)
6. [Sitede neler var](#6-sitede-neler-var)
7. [Klasör yapısı](#7-klasör-yapısı)
8. [Sorun giderme](#8-sorun-giderme)
9. [Teknik notlar](#9-teknik-notlar)

---

## 1. Tek seferlik kurulum (sadece bir kez)

Siteyi yayına almak için GitHub'da tek bir ayarı açmanız yeterli:

1. Bu deponun sayfasında üstteki **Settings** (Ayarlar) sekmesine girin.
2. Sol menüden **Pages**'e tıklayın.
3. **Build and deployment → Source** kutusundan **GitHub Actions**'ı seçin.
4. Depo sayfasındaki **Actions** sekmesine gidin, en üstteki "Siteyi derle ve yayınla"
   çalışmasının yeşil ✓ olmasını bekleyin (2–3 dakika).

Bitti. Site adresi: `https://orbayskrcl.github.io/ulasim-planlama-yollar/`

> **Not:** Site yalnızca deponun **varsayılan dalından (default branch)** yayınlanır.
> Şu an varsayılan dal `claude/izmir-road-classification-web-f4fq44`; bu yüzden ek bir
> işlem yapmanız gerekmiyor. İleride `main` gibi başka bir dala geçerseniz, varsayılan
> dalı **Settings → General → Default branch** bölümünden değiştirmeniz yeterli —
> iş akışı kendini otomatik ona göre ayarlar.

---

## 2. Veriyi güncelleme (her değişiklikte)

QGIS'te yolları güncelledikten sonra:

1. QGIS'te katmanı KML olarak dışa aktarın → dosya adı **`ibb_yollar.kml`**
   (nasıl yapılacağı [3. bölümde](#3-qgisten-doğru-kml-nasıl-çıkarılır)).
2. Bu depoda **`veri`** klasörüne girin.
3. Sağ üstten **Add file → Upload files**.
4. Yeni `ibb_yollar.kml` dosyasını pencereye sürükleyin.
5. Aşağıdaki **Commit changes** düğmesine basın.

2–3 dakika içinde site otomatik olarak yeni veriyle yenilenir.
İlerlemeyi **Actions** sekmesinden izleyebilirsiniz.

> Dosya adının **aynı** kalması (`ibb_yollar.kml`) önemlidir; GitHub eskisinin üzerine yazar.
> Farklı bir ad kullanırsanız site yine çalışır ama depoda iki dosya birikir.

---

## 3. QGIS'ten doğru KML nasıl çıkarılır

1. Katmanlar panelinde yol katmanına **sağ tıklayın**.
2. **Dışa Aktar → Özellikleri Farklı Kaydet…**
3. Ayarlar:
   - **Biçim:** `Keyhole Markup Language [KML]`
   - **Dosya adı:** `ibb_yollar.kml`
   - **KRS / CRS:** `EPSG:4326 - WGS 84`
   - **Yalnızca seçili özellikleri kaydet:** işaretli **olmasın**
4. **Tamam**.

Sitenin çalışması için katmanda şu alanların bulunması gerekir:

| Alan | Zorunlu mu | Ne işe yarar |
|------|-----------|--------------|
| `DURUM` | **Evet** | Yolun kategorisi (1, 2, 3, 4 …). Renkler bundan üretilir. |
| `ADINUMARASI` | Hayır (önerilir) | Yol adı — arama kutusu bunu arar. |
| `TIP1` | Hayır | Cadde / Sokak / Bulvar / Küme Evler / Otoyol / Meydan filtresi. |
| `fid` | Hayır | Kayıt numarası; bir yolu QGIS'te tekrar bulmayı kolaylaştırır. |

**Önemli:** Sınıflandırmanın kaynağı `DURUM` alanıdır, QGIS'teki renk değil.
QGIS'te bir yolun rengini değiştirdiğinizde `DURUM` değerini de değiştirdiğinizden
emin olun (zaten kategorili sembolojide renk `DURUM`'dan geliyorsa bir şey yapmanıza gerek yok).

Hâlihazırdaki karşılıklar:

| DURUM | Renk | Anlamı |
|-------|------|--------|
| `1` | 🟣 mor | Büyükşehir'e geçen köy yolları |
| `2` | 🔴 kırmızı | Durumu belirsiz yollar |
| `3` | ⚫ siyah | Karayolları Genel Müdürlüğü yolları |
| `4` | 🔵 mavi | Halihazırda Büyükşehir'e ait yollar |

Yeni bir `DURUM` değeri (örneğin `5`) eklerseniz site onu **otomatik olarak fark eder**,
veriyi kaybetmez ve "Tanımsız durum kodu: 5" adıyla gösterir. Adını ve rengini vermek için
bir sonraki bölüme bakın.

---

## 4. Kategori adı, renk ve başlıkları değiştirme

Tüm metinler ve renkler tek bir dosyada: **`veri/kategoriler.json`**

GitHub'da bu dosyayı açıp sağ üstteki ✏️ (kalem) simgesine tıklayarak düzenleyebilir,
**Commit changes** deyip kaydedebilirsiniz. Site birkaç dakika içinde yenilenir.

```jsonc
"1": {
  "ad": "Büyükşehir'e geçen köy yolları",   // haritada ve lejantta görünen ad
  "kisa_ad": "Devredilen köy yolları",       // dar alanlarda kullanılır
  "renk": "#a855f7",                         // null yazarsanız KML'deki renk kullanılır
  "aciklama": "İl Özel İdaresi'nden …",      // kategorinin altındaki açıklama
  "sira": 1,                                 // listedeki sıra
  "varsayilan_acik": true                    // site açılırken görünsün mü
}
```

Aynı dosyanın `site` bölümünden sayfa başlığını, alt başlığı ve alttaki uyarı notunu
değiştirebilirsiniz.

> ⚠️ JSON dosyasında virgül ve tırnak işaretlerini bozmayın. Bozulursa Actions sekmesinde
> kırmızı ✗ görürsünüz ve site eski hâliyle yayında kalır (veri kaybolmaz).

---

## 5. İlçe filtresi ekleme (isteğe bağlı)

Elinizdeki İzmir **ilçe sınırları** katmanını eklerseniz site otomatik olarak
**ilçe filtresi** ve ilçe bazlı km istatistikleri kazanır:

1. QGIS'te ilçe sınırları katmanını **GeoJSON** olarak dışa aktarın
   (KRS: `EPSG:4326`), ilçe adı alanı `ilce`, `ADI`, `NAME` gibi bir isim taşısın.
2. Dosyayı **`veri/ilce_sinirlari.geojson`** adıyla `veri` klasörüne yükleyin.

Hepsi bu. Derleme sırasında her yol parçası, orta noktasına göre bir ilçeye atanır;
ilçe dışında kalanlar "Belirlenemedi" olarak işaretlenir. Dosyayı silerseniz filtre
kendiliğinden kaybolur.

---

## 6. Sitede neler var

- **4 altlık harita:** Sokak (OpenStreetMap), Sade, Koyu, Uydu
- **Kategori aç/kapat** — her kategorinin yol sayısı ve toplam kilometresiyle
- **Yol tipi filtresi** (Cadde, Sokak, Bulvar, Küme Evler, Otoyol, Meydan)
- **Yol adı arama** — Türkçe karaktere duyarsız (`sarikoy` yazınca `SARIKÖY` bulunur)
- **Yola tıklayınca** ad, tip, kategori, uzunluk, kayıt no, koordinat; koordinatı kopyalama
  ve Google Maps'te açma
- **Anlık istatistik** — o an ekranda görünen yolların toplam km'si ve parça sayısı
- **Paylaşılabilir bağlantı** — harita konumu ve filtreler bağlantıya işlenir
- **Veri indirme** — GeoJSON (QGIS/ArcGIS/Google Earth) ve orijinal KML
- **Konumum** düğmesi — sahada kendi konumunuzu haritada görmek için
- **Açık / koyu tema**, mobil uyumlu arayüz
- **Veri kalitesi uyarıları** — geometrisi boş, adı boş veya DURUM'u boş kayıtları
  kayıt numarasıyla listeler; QGIS'te düzeltmeniz için yol gösterir
- Kısayollar: `/` arama kutusuna gider, `Esc` seçimi temizler, `Alt + tıklama`
  tıkladığınız noktanın koordinatını kopyalar

---

## 7. Klasör yapısı

```
veri/                       ← SİZİN DOKUNACAĞINIZ KLASÖR
  ibb_yollar.kml            QGIS'ten çıkan katman (üzerine yazın)
  kategoriler.json          kategori adları, renkler, site başlıkları
  ilce_sinirlari.geojson    (isteğe bağlı) ilçe filtresi için

site/                       web sitesinin kaynağı (HTML/CSS/JS)
araclar/derle.py            KML'i siteye çeviren betik
.github/workflows/          otomatik derleme ve yayınlama tanımı
_site/                      derleme çıktısı (otomatik üretilir, depoda tutulmaz)
tasks/                      çalışma planı ve notlar
```

---

## 8. Sorun giderme

| Belirti | Sebep / çözüm |
|--------|----------------|
| Site "Veri yüklenemedi" diyor | Derleme henüz bitmemiş olabilir. **Actions** sekmesinden son çalışmayı kontrol edin. |
| Actions'ta kırmızı ✗ var | Çalışmaya tıklayın; **Derleme özeti** bölümünde Türkçe hata mesajı yazar (çoğunlukla bozuk JSON veya eksik KML). Site bu sırada eski hâliyle yayında kalır. |
| Yeni yollar haritada yok | KML'i `veri` klasörüne yüklediğinizden ve **Commit changes**'e bastığınızdan emin olun. Tarayıcıda `Ctrl+F5` ile sayfayı yenileyin. |
| Bir kategori hiç görünmüyor | Sol paneldeki kutucuğu işaretleyin; ya da o `DURUM` değeri KML'de hiç yoksa kategori listelenmez. |
| "Tanımsız durum kodu" uyarısı | KML'de `veri/kategoriler.json`'da tanımlı olmayan bir `DURUM` var. 4. bölümdeki gibi ekleyin. |
| Renkler QGIS'tekiyle aynı değil | Renkler `kategoriler.json`'dan gelir. Oradaki `renk` değerini `null` yaparsanız KML'deki renk kullanılır. |
| Site adresi 404 veriyor | 1. bölümdeki **Settings → Pages → GitHub Actions** ayarı yapılmamış olabilir. |

---

## 9. Teknik notlar

- **Bağımlılık yok.** Derleme yalnızca Python 3 standart kütüphanesiyle çalışır;
  site saf HTML/CSS/JavaScript'tir, Leaflet 1.9.4 depo içinde yerel olarak sunulur.
  Yani site, dış bir kütüphane sunucusu çökse bile açılır.
- **Veri boyutu.** 6.600 yol parçası ≈ 2,1 MB GeoJSON; sunucu sıkıştırmasıyla
  tarayıcıya ≈ 0,4 MB iner. Koordinatlar 6 haneye yuvarlanır (≈ 11 cm hassasiyet).
- **Uzunluklar** WGS84 üzerinde haversine formülüyle hesaplanır; eğim dikkate alınmaz.
- **Çizim**, binlerce çizgide akıcı kalması için Leaflet'in canvas çizicisiyle yapılır.
- **Yerelde çalıştırmak isterseniz:**
  ```bash
  python3 araclar/derle.py
  python3 -m http.server 8000 --directory _site
  # tarayıcıda http://localhost:8000
  ```

### Kaynaklar ve haklar

- Yol verisi: bu çalışma kapsamında QGIS'te üretilmiştir.
- Altlık haritalar: © OpenStreetMap katkıcıları, © CARTO, Esri/Maxar (uydu).
- Harita kütüphanesi: [Leaflet](https://leafletjs.com) (BSD-2-Clause).

> Bu harita çalışma amaçlı hazırlanmıştır, resmî bir belge niteliği taşımaz.
> Sınıflandırmalar çalışma sürdükçe değişebilir.
