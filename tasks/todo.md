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

### Kullanıcının yapması gereken tek şey
GitHub Pages, güvenlik gereği yalnızca depo sahibi tarafından açılabiliyor
(`GITHUB_TOKEN` için "Resource not accessible by integration"). Bu yüzden **bir kez**:
Settings → Pages → Source: **GitHub Actions** → Actions sekmesinde **Re-run all jobs**.
İş akışı, bu yapılmadığında ne yapılacağını Actions özetinde Türkçe olarak anlatıyor.

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

---

# 2. Tur — kullanıcı geri bildirimleri (07.09.2026)

## Talepler
1. Çalışmayı müdürlük adına açılacak yeni bir GitHub hesabına taşımak
   (`ulasim-planlama` → `ulasim-planlama.github.io` tarzı adres)
2. "Yol parçası" sayısal göstergesini kaldırmak (anlam ifade etmiyor)
3. Zoom akıcı değil
4. Sağ alttaki mesafe ölçer hatalı ölçüyor
5. "Koyu" ve "Sade" altlıklarında "API KEY REQUIRED" filigranı
6. Kategorilerden yol çizgi rengini ve adını site üzerinden değiştirebilme

## Ölçüm sonuçları (varsayım değil, veri)
- **Ölçek çubuğu doğru:** "1 km" etiketi 67 px; Leaflet mesafesi 1001,9 m,
  bağımsız Web-Mercator hesabı 1003 m → sapma %0,19 (yalnızca yuvarlama).
  Gerçek sorun: koordinat kutusunun çubuğun üstüne binmesi + kullanıcının
  ihtiyacının aslında **ölçme aracı** olması.
- **Zoom takılması gerçek:** tek zoom adımı 105–145 ms, tam çizim 128 ms
  (60 fps için bütçe 16 ms). Sebep: 6.647 ayrı Leaflet çizgi nesnesi;
  toplam kırılma noktası yalnızca 53.086 → darboğaz geometri değil, nesne sayısı.
- **CARTO altlıkları artık anahtar istiyor** (ekran görüntüsüyle doğrulandı).

## Plan
- [x] Altlıklar: CARTO kaldırıldı; Sade ve Koyu, OpenStreetMap karolarından
      CSS filtresiyle üretiliyor → anahtar gerekmiyor, ek sunucu yok
- [x] Çizim mimarisi: kategori başına tek birleşik çizgi nesnesi (6.647 → 4)
- [x] Tıklama/üzerine gelme için kendi ızgara indeksli en yakın-yol testim
- [x] Zoom ayarları yeniden düzenlendi (zoomSnap 0.5, tuval dolgusu 0.4 → 0.2)
- [x] "Yol parçası" sayacı kaldırıldı; yerine "farklı yol adı" geldi
- [x] Gerçek mesafe ölçme aracı (çok noktalı, canlı toplam)
- [x] Ölçek çubuğu ile koordinat kutusunun çakışması giderildi
- [x] Kategori düzenleyici: ad + renk değiştirme, anında önizleme
- [x] Düzenlemeyi kalıcı yapma: hazır JSON + doğrudan GitHub düzenleme bağlantısı
- [x] Depo bilgisi (sahip/depo/dal) derleme sırasında ozet.json'a yazılıyor
- [x] README: hesap/organizasyon taşıma rehberi ve adres kuralları

## 2. Tur — Sonuç / Review

### Ölçülen sonuçlar (öncesi → sonrası, aynı ortam)
| Ölçüm | Önce | Sonra |
|-------|------|-------|
| Zoom adımı, z13 | ~140 ms | **6,4 ms** |
| Zoom adımı, z15 | ~90 ms | **4,9 ms** |
| Zoom adımı, z17 | ~90 ms | **1,2 ms** |
| Zoom adımı, z9 (tüm il) | ~250 ms | **68 ms** |
| Küçük kaydırma | — | **0,5 ms** |
| Leaflet çizgi nesnesi | 6.647 | **4** |
| Fare hareketi (vurgulama) | — | 0,23 ms |

### Doğrulama
- Tıklama testi: doğru yol bulunuyor (AŞAĞICUMA), 17 ms.
- Mesafe aracı: 8,71 km gösterdi, gerçek 8.714 m → tam isabet.
- Kategori düzenleyici: renk + ad değişikliği anında uygulanıyor, localStorage'a yazılıyor,
  üretilen JSON geçerli, GitHub düzenleme bağlantısı doğru, sıfırlama çalışıyor.
- Altlıklar: dördü de OSM/Esri; CARTO tamamen kaldırıldı, filtreler DOM'da doğrulandı.
- 8 tema × altlık kombinasyonunda yol renkleri doğru (siyah yol yalnızca koyu altlıkta açılıyor).
- Konsolda hata yok.

### Kullanıcıya kalan
Depo taşıması GitHub hesabı gerektirdiği için kod tarafında hazırlık yapıldı
(bağlantılar göreceli, GitHub düzenleme bağlantısı derlemede üretiliyor);
adım adım rehber README 7. bölümde.

---

# 3. Tur — İlçe sınırları (09.09.2026)

## Bildirilen sorun
Kullanıcı `ilce_sinirlari.geojson` dosyasını GitHub'da iki farklı klasöre yükledi,
"bir şey değişmedi, ilçe sınırları gelmedi".

## Teşhis (yerelde birebir tekrarlandı)
Derleme başarılıydı ve Pages yayındaydı; hata veri hattındaydı:
`İlçe sınırları yüklendi: 30 ilçe` → `İlçe sayısı: 1` (hepsi "Belirlenemedi").

- [x] **Sebep 1:** Koordinatlar projeksiyonlu (508757, 4312424), kod enlem/boylam
      bekliyordu → hiçbir yol hiçbir ilçenin sınır kutusuna düşmedi.
- [x] **Sebep 2:** İlçe adı `NAME`'de değil `__L__E_AD_`'de; `NAME`'de nesne
      numarası (536) var.
- [x] **Sebep 3 (asıl kusur):** Bu iki hata da sessizce yutuldu.

## Yapılanlar
- [x] Ters Transverse Mercator dönüşümü (harici kütüphane yok)
- [x] 22 aday projeksiyon; doğru olan, yol/ilçe çakışma oranı ölçülerek seçiliyor
- [x] Ad alanı, alan adına değil içeriğine bakılarak bulunuyor
- [x] Türkçe başlık biçimi (ALİAĞA → Aliağa)
- [x] İlçe sınırları haritada çiziliyor (ayrı pane, yolların altında)
- [x] İlçe adı etiketleri, aç/kapa anahtarı, seçili ilçe vurgusu
- [x] İlçe bölümü veri varken kendiliğinden açılıyor; projeksiyon + eşleşme yazılı
- [x] Düşük eşleşme / çözülemeyen projeksiyon artık uyarı üretiyor
- [x] Depo kökündeki gereksiz 4,3 MB'lık kopya kaldırıldı
- [x] README 5. bölüm ve veri/BENIOKU.md yenilendi

## Ölçülen sonuç
| Aday projeksiyon | Yol eşleşmesi |
|---|---|
| **EPSG:5253 TUREF / TM27** | **%99,8** ← seçildi |
| EPSG:2319 ED50 / TM27 | %97,9 |
| EPSG:32635 WGS84 / UTM 35N | %96,7 |
| EPSG:23035 ED50 / UTM 35N | %96,5 |

6.647 yolun 6.644'ü (%99,95) bir ilçeye atandı; 3 yol (2,6 km) sınır dışında kaldı.
Yol bulunan 11 ilçe: Bergama 738,6 km · Menemen 349,1 · Aliağa 339,4 · Kınık 205,3
· Urla 174,9 · Dikili 173,3 · Foça 102,2 · Karaburun 100,1 · Narlıdere 63,2
· Güzelbahçe 52,3 · Çeşme 46,8.

`ilceler.geojson`: 223 KB (gzip 70 KB), 30 alan, 11.591 nokta.

## Doğrulama
Tarayıcı testi: bölüm açık, 30 sınır + 30 etiket haritada, 12 filtre rozeti,
Bergama seçilince sınır vurgulanıyor (kalınlık 2,6 / #0a5f6a) ve yollar 738,6 km'ye
düşüyor, aç/kapa anahtarı iki yönde çalışıyor, koyu altlıkta sınır ve etiket
renkleri değişiyor. Önceki turların tüm testleri de geçiyor. Konsol temiz.

## 3. Tur — ek istekler

- [x] **Sınır çizgisi düzenleyici:** İlçe bölümündeki ✎ ile renk, kalınlık
      (0,4–6 px kaydırıcı, canlı önizleme), kesikli/düz ve ilçe adlarının
      görünürlüğü değiştirilebiliyor. Kategori düzenleyicideki mantığın aynısı:
      anında uygulanıyor, tarayıcıda saklanıyor, "Herkes için kalıcı yap"
      düğmesi `kategoriler.json` içindeki `ilce_sinir` bölümünü üretiyor.
- [x] **"Tüm ilçelerin isimleri yok" sorusu:** Filtre yalnızca yolu olan ilçeleri
      listeliyordu. Artık 30 ilçenin tamamı listede; yolu olmayan 19 ilçe soluk
      ve tıklanamaz durumda, harita etiketleri de soluk. Panelde şu not var:
      "11 ilçede kayıtlı yol var, 19 ilçede henüz yok". Yollar eklendikçe
      kendiliğinden etkinleşiyorlar — kullanıcının tahmini doğruydu.

### Doğrulama
Rozet sayısı 31 (30 ilçe + Belirlenemedi), 19'u devre dışı, 12'si tıklanabilir;
30 etiketten 19'u soluk. Düzenleyici: renk `#b45309` ve kalınlık 3,5 px anında
katman stiline geçti, kesik desen kalınlıkla ölçekleniyor, düz çizgiye geçiş
`dashArray: null` yapıyor, etiket anahtarı 30 ↔ 0 çalışıyor, üretilen JSON
geçerli ve `ilce_sinir` bölümünü içeriyor, sıfırlama varsayılana dönüyor,
koyu altlıkta `renk_koyu` devreye giriyor. Konsol temiz.
