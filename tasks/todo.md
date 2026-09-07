# Görev: İzmir Köy Yolları Devir Haritası — Herkese Açık Web Sitesi

## Anlayışım (Task Understanding)
QGIS'te sürdürülen `ibb_yollar.kml` katmanı, İzmir'de İl Özel İdaresi'nden Büyükşehir
Belediyesi'ne geçen mahalle/köy yollarını sınıflandırıyor. Sınıflandırma `DURUM`
alanında saklanıyor ve QGIS'teki renkler bu alandan üretiliyor:

| DURUM | KML rengi | Anlamı |
|-------|-----------|--------|
| 1 | mor (#aa5bf8) | Büyükşehir'e geçen köy yolları |
| 2 | kırmızı (#cb0003) | Durumu belirsiz yollar |
| 3 | siyah (#000000) | Karayolları Genel Müdürlüğü'ne ait yollar |
| 4 | mavi (#0808d6) | Halihazırda Büyükşehir'e ait yollar |

Toplam 6.654 çizgi (LineString), 468 farklı yol adı, alanlar: `fid`, `ADINUMARASI`,
`DURUM`, `TIP1` (Cadde / Sokak / Bulvar / Küme Evler / Otoyol / Meydan).

**Hedef:** Kod bilmeyen bir kullanıcının, QGIS'ten yeni KML'i sürükle-bırak ile
yükleyip siteyi otomatik güncelleyebildiği, herkese açık bir GitHub Pages haritası.

## Plan

### Aşama 1 — Veri hattı (build pipeline)
- [x] `araclar/kml_to_geojson.py`: KML → GeoJSON dönüştürücü (harici kütüphane yok)
- [x] DURUM'u ana kaynak kabul et; renkleri KML'den otomatik oku
- [x] Bilinmeyen yeni DURUM kodlarını otomatik algıla (veri kaybolmasın)
- [x] Koordinatları 6 haneye yuvarla (dosya boyutu ↓, ~11 cm hassasiyet)
- [x] Her yol için uzunluk (m) hesapla (haversine)
- [x] `ozet.json`: kategori/tip/uzunluk istatistikleri, bbox, güncelleme tarihi
- [x] Opsiyonel `veri/ilce_sinirlari.geojson` varsa ilçe etiketleme (point-in-polygon)

### Aşama 2 — Web sitesi (site/)
- [x] Leaflet tabanlı, derleme gerektirmeyen saf HTML/CSS/JS
- [x] 4 altlık harita (Sokak, Uydu, Sade, Topoğrafya)
- [x] Kategori aç/kapa + her kategoride adet ve toplam km
- [x] Yol tipi (Cadde/Sokak/...) filtresi
- [x] Türkçe karakter duyarsız yol adı arama + otomatik tamamlama
- [x] Yola tıklayınca bilgi kartı (ad, tip, durum, uzunluk, koordinat kopyala)
- [x] İstatistik paneli + lejant
- [x] Konumum (GPS), tam ekran, paylaşılabilir bağlantı (URL hash)
- [x] Veri indirme (GeoJSON + orijinal KML)
- [x] Mobil uyumlu + koyu tema desteği

### Aşama 3 — Otomasyon
- [x] `.github/workflows/yayinla.yml`: `veri/**` değişince otomatik derle + yayınla
- [x] Hatalı KML'de anlaşılır Türkçe hata mesajı

### Aşama 4 — Dokümantasyon (kod bilmeyene göre)
- [x] `README.md`: tek seferlik kurulum (Pages'i açma) + "yeni KML nasıl yüklenir"
- [x] `veri/kategoriler.json`: etiket/renk/açıklamayı koda dokunmadan değiştirme

### Aşama 5 — Doğrulama
- [x] Dönüştürücüyü gerçek KML ile çalıştır, sayıları KML ile karşılaştır
- [x] Siteyi yerelde ayağa kaldır, ekran görüntüsü ile doğrula
- [x] Commit + push (`claude/izmir-road-classification-web-f4fq44`)

## Sonuç / Review

### Ne yapıldı
Kod bilmeyen bir kullanıcının tek başına yürütebileceği, uçtan uca otomatik bir yayın
zinciri kuruldu:

`veri/ibb_yollar.kml` (QGIS çıktısı) → GitHub Actions → `araclar/derle.py` →
`_site/` → GitHub Pages → herkese açık harita.

Kullanıcının yapması gereken tek iş: GitHub web arayüzünden `veri` klasörüne yeni KML'i
sürükleyip bırakmak. Kategori adı/renk değişikliği için `veri/kategoriler.json`
düzenlenir; koda hiç dokunulmaz.

### Doğrulama (nasıl biliyorum ki çalışıyor)
- `araclar/derle.py` gerçek 4,7 MB'lık KML ile çalıştırıldı: 6.654 Placemark'ın
  6.647'si işlendi, 7'sinin geometrisi KML içinde **gerçekten boş** (regex ile bağımsız
  olarak doğrulandı: `<coordinates></coordinates>`); bunlar "veri kalitesi uyarısı"
  olarak kayıt numaralarıyla raporlanıyor.
- Kategori dağılımı KML renkleriyle bire bir eşleşiyor:
  DURUM 1 = mor (2.405 / 860,9 km), 2 = kırmızı (84 / 38,4 km),
  3 = siyah (3.536 / 1.352,3 km), 4 = mavi (622 / 96,4 km). Toplam 2.348,0 km.
- Site, headless Chromium + CDP ile otomatik test edildi:
  veri yükleme (6.647 çizgi), arama ("terzihalil" → TERZİHALİLLER),
  yola tıklama/popup, kategori ve tip filtreleri (4 → 3 katman, 2.348 km → 205,4 km),
  paylaşım bağlantısı (`#h=15/39.29075/27.06143&k=1,2,4&t=Cadde`), yardım penceresi.
  **Konsol hatası yok.**
- Masaüstü (1440×900), koyu tema (1280×820) ve mobil (390×780) ekran görüntüleriyle
  düzen doğrulandı; ilk turda çıkan üç sorun düzeltildi:
  altlık seçicinin panelin altında kalması, haritanın ekranı doldurmaması
  (`zoomSnap: 0.25`) ve koyu temada siyah Karayolları çizgilerinin görünmemesi
  (`renk_koyu` desteği).
- `derle.py --cikti <depo kökü>` güvenlik kontrolü test edildi: reddediyor.

### Planın dışında eklenenler
- **Veri kalitesi raporu:** boş geometri / boş DURUM / adsız yol / 1 m altı çizgiler,
  QGIS'te bulunabilmesi için kayıt numaralarıyla listeleniyor.
- **Bilinmeyen DURUM kodlarına dayanıklılık:** yeni bir kod eklenirse veri kaybolmuyor,
  otomatik renk atanıp uyarı gösteriliyor.
- **Leaflet deponun içinde** (CDN bağımlılığı yok) — site dış servis çökse de açılır.
- **İlçe desteği hazır bekliyor:** `veri/ilce_sinirlari.geojson` eklendiği anda ilçe
  filtresi ve ilçe bazlı istatistikler kendiliğinden beliriyor.
- Alt+tıklama ile koordinat kopyalama, `/` ile aramaya odaklanma, Google Maps bağlantısı.

### Bilinçli olarak yapılmayanlar
- **İlçe sınırları veri seti eklenmedi:** bu ortamdan güvenilir bir açık kaynak
  indirilemedi (Overpass ve CDN'ler engelli). Kullanıcının QGIS'inde bu katman zaten
  bulunduğu için, dosyayı bırakması yeterli olacak şekilde altyapı hazırlandı.
- Vektör karo (PMTiles) üretimi: 2,1 MB / gzip 395 KB veri için gereksiz karmaşıklık.
