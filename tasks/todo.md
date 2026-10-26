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

---

# 4. Tur — Mahalle sınırları (17.09.2026)

## İstek
`izmir_mahalleler.geojson` (19 MB, 1.314 mahalle) eklensin; ilçe sınırlarındaki
gibi düzenleme seçenekleri olsun.

## Verinin durumu
- Zaten **WGS84 (CRS84)** — projeksiyon dönüşümü gerekmedi, otomatik algılandı.
- Ad alanı `name`; içerik sezgisi doğru alanı seçti (`description` alanı
  `http://` içerdiği için elendi).
- **133 mahalle adı tekrar ediyor** (ATATÜRK 19 kez, CUMHURİYET 15 kez).
  Mahalle dosyasında ilçe bilgisi yok; ilçe sınırlarından türetilip
  "Atatürk (Bergama)" gibi benzersiz anahtar üretildi.

## Yapılanlar
- [x] Sınır katmanı kodu (hem derleme hem site tarafında) tek ortak koda
      genelleştirildi; ilçe ve mahalle yalnızca varsayılanlarıyla ayrılıyor
- [x] Mekânsal ızgara indeksi: 1.314 poligonda doğrusal arama yavaş kalıyordu
- [x] Yollara `mahalle` alanı; bilgi kartında, filtrede ve istatistiklerde
- [x] Mahalle sınır katmanı: ayrı katman düzlemi, görüş alanı kırpması,
      tüm alanların tek birleşik çokgende toplanması
- [x] Mahalle bölümü: aç/kapa, ✎ düzenleyici, arama kutusu, rozet listesi
- [x] Düzenleyiciye **çizim yakınlık eşiği** kaydırıcısı eklendi
- [x] Etiketlerde kısa ad (haritada "Kapukaya", filtrede "Kapukaya (Bergama)")
- [x] Paylaşım bağlantısına mahalle seçimi (`m=`) eklendi

## Ölçüm ve kararlar
- Sadeleştirme 40 m: 358.450 nokta → 62.845 (%18). Çıktı 1,40 MB / **gzip 406 KB**.
- **İl genelinde 1.314 sınırı birden çizmek yolları görünmez yapıyor** (ekran
  görüntüsüyle görüldü). Bu yüzden mahalle çizimi z11, adlar z12 eşiğine bağlandı;
  eşiğin altındayken panelde bunu söyleyen bir not çıkıyor ("sessiz görünmezlik" yok).
- 6.647 yolun eşleşmesi: %99,8; 375 mahallede kayıtlı yol var.

## Doğrulama
1.314 alan yüklendi, z9,5'te çizilmiyor + not görünüyor, z12'de çiziliyor ve
24 etiket kısa adla çıkıyor; arama "zeytin" → 8 sonuç; Zeytindağ seçilince
110,5 km / 9 yol adı, vurgu katmanı ve hash (`m=Zeytindağ`) doğru; bilgi kartında
Mahalle satırı var; düzenleyicide renk/kalınlık/eşik anında uygulanıyor ve
localStorage'a tür bazlı yazılıyor; "kalıcı yap" JSON'u `mahalle_sinir` bölümünü
üretiyor; aç/kapa iki yönde çalışıyor ve ilçe katmanını etkilemiyor.
Önceki turların tüm testleri (kategori düzenleyici, mesafe aracı, arama, altlıklar,
ilçe katmanı) yeni mimariyle geçiyor. Konsol temiz.

---

# 5. Tur — Büyük kaynak dosya (22.09.2026)

## Sorun
Yeni `ibb_yollar.kml` ~85 MB. GitHub'ın web arayüzü dosya başına 25 MB kabul
ediyor; sohbete de yüklenemiyor.

## Ölçüm
Mevcut 7,1 MB'lık KML zip'lendiğinde **1,07 MB** oldu — **%15**. Aynı oranla
85 MB → **~12,7 MB**, sınırın epey altında. Sebep: OGR her Placemark için
aynı `<Style>` bloğunu tekrarlıyor ve koordinatlar **13 ondalık haneli**
(milimetrenin binde biri) yazılıyor.

## Yapılanlar
- [x] Sıkıştırılmış kaynak desteği: `.zip`, `.kmz`, `.gz` doğrudan içinden okunuyor
- [x] GeoJSON kaynak desteği (QGIS'te koordinat hassasiyeti düşürülebildiği için
      daha da küçük bir seçenek)
- [x] KML okuma akışlı (iterparse) hâle getirildi; her kayıt işlendikten sonra
      bellekten düşürülüyor → 100 MB'lık dosyada da bellek sabit
- [x] Kaynak 25 MB'ı geçerse yayınlanan siteye kopyalanmıyor (Pages şişmesin);
      indirme menüsündeki bağlantı kendini gizliyor, GeoJSON kalıyor
- [x] `veri/` klasöründe birden fazla yol dosyası varsa **açık hata** —
      dosya tarihleri git kopyasında güvenilmez olduğu için sessizce yanlış
      (eski) dosyayı seçme riski vardı
- [x] `kategoriler.json` yanlışlıkla yol verisi sanılıyordu; ayrıldı
- [x] README 2. bölüm + veri/BENIOKU.md: sıkıştırma yönergesi

## Doğrulama
Aynı veriyle dört giriş biçimi de birebir 10.187 yol / 3.452,6 km üretti:
`.kml` (7,1 MB), `.zip` (1,07 MB), `.kmz` (doc.kml), `.geojson` (3,1 MB).
25 MB üstü senaryosu sınır 5 MB'a indirilerek denendi: kaynak siteye
kopyalanmadı, `kaynak_indirme: null` yazıldı, sitede KML bağlantısı gizlendi,
GeoJSON bağlantısı kaldı. Zip kaynakta bağlantı "Sıkıştırılmış kaynak" olarak
göründü. İki yol dosyası bırakıldığında derleme anlaşılır hata verdi.
Önceki turların tüm testleri geçiyor, konsol temiz.

---

# 6. Tur — Tam yol ağı (22.09.2026)

## Gelen veri
`ibb_yollar.rar` (15,7 MB) → içinde **86,19 MB** KML. Sistemde rar açıcı yoktu;
libarchive'a ctypes ile bağlanılarak açıldı (harici araç kurulmadı).

**40.859 yol, 1.133.610 kırılma noktası, 33.521,6 km** — önceki verinin ~10 katı.

| DURUM | Kayıt | km | KML rengi |
|---|---|---|---|
| 0 (boş) | 14.427 | 10.156,1 | yeşil |
| 1 (devredilen) | 1.517 | 2.403,5 | mor |
| 2 (belirsiz) | 60 | 121,0 | kırmızı |
| 3 (Karayolları) | 442 | 4.746,2 | siyah |
| 4 (mevcut Büyükşehir) | 668 | 1.369,8 | mavi |
| 5 (ilçe belediyesi) | 23.745 | 14.725,0 | turkuaz |

`TIP1` karışık: hem sayısal kod (1, 2, 5 …) hem düz metin (Cadde, Sokak …).

## Yapılanlar
- [x] DURUM 0 ve 5 kategori olarak tanımlandı (varsayılan kapalı)
- [x] TIP1 kod→ad eşlemesi `kategoriler.json`'a taşındı; metin değerler korunuyor
- [x] Yollar kategori başına ayrı dosyalara bölündü; site yalnızca açık kategorileri
      indiriyor, kapalıyı işaretleyince o an indiriyor
- [x] Kategori başına **çizim yakınlık eşiği** (0 ve 5 için z14) + panelde uyarı notu
- [x] Çizim/tıklama birimi yol yerine **yol parçası** yapıldı
- [x] Yakınlığa göre nokta seyreltme (z<11'de 8'de 1)
- [x] Derleme hızlandırıldı: örnek sayısı yol uzunluğuna göre ölçekleniyor

## Ölçümler
Kırpma etkinliği (kategori 5 açıkken):
| zoom | yol bazlı nokta | parça bazlı nokta |
|---|---|---|
| z17 | 279.936 | **6.246** |
| z15 | 316.938 | **42.002** |
| z13 | 454.482 | **230.704** |

Zoom süresi (aynı ortam, sıcak önbellek):
| Durum | Başlangıç | Sonuç |
|---|---|---|
| Varsayılan (1-4), z10 | 749 ms | **180-257 ms** |
| Varsayılan (1-4), z13 | 679 ms | **75-86 ms** |
| Tüm kategoriler, z14 | — | **234-244 ms** |
| Tüm kategoriler, z16 | — | **54-92 ms** |

Katman payları (z10→11): yollar 213 ms, mahalle sınırı 130 ms, ilçe sınırı 65 ms,
altlık karolar 93 ms. Mahalle sınırı eşiği bu yüzden z11→z12 yapıldı.

Derleme süresi 3 dk 32 sn → **1 dk 34 sn**.
Açılışta indirilen: yalnızca yollar-1/2/3/4 (4,85 MB); sayfa 1,5 sn'de hazır.

## Doğrulama
Açılışta yalnızca 1-4 indiriliyor (ağ isteğiyle doğrulandı), kategori 5
işaretlenince "yükleniyor…" yazıp indiriyor ve 26.432 kayda çıkıyor; TIP1 kodları
ad olarak görünüyor; bilgi kartı, ölçüm aracı, arama+vurgu, kategori/sınır
düzenleyicileri, altlıklar çalışıyor. Konsol temiz.

---

# Tur 8 — Hata taraması + arayüz iyileştirme

İstek: "hatalar var mı son halini analiz eder misin. ayrıca kullanıcı arayüzünü
iyileştirmek adına iyileştirilmesi gereken noktalar varsa onları da uygula.
Sonuçta bu çalışma da veriler önemli ve o verileri kolayca görebilmekte önemli."

## Bulunan hatalar
- [x] **ozet.json 2,20 MB'a şişmişti** — 30.568 yol adı özet dosyasının içindeydi
      ve her açılışta iniyordu. Arama dizini ayrı `adlar.json` dosyasına alındı,
      ilk arama anında iniyor. ozet.json **0,11 MB** oldu.
- [x] **Tanımsız yol tipi "0" olarak görünüyordu** — kategoriler.json'da karşılığı
      olmayan sayısal TIP1 kodu çıplak sayı olarak yazılıyordu. Artık
      "Tanımsız kod 0" yazıyor.
- [x] **Fare imleci "el" şeklinde takılı kalıyordu** — yolun üstünden çıkınca
      imleç sıfırlanmıyordu.
- [x] **Telefonda ilçe adları üst üste biniyordu** — açılış yakınlığı z7,5 olduğu
      için 30 ilçe etiketi iç içe geçiyordu. İlçe etiketi için en küçük
      yakınlaştırma varsayılanı z8 yapıldı (panelden değiştirilebilir).
- [x] **Telefonda lejant ölçek çubuğunu kapatıyordu** — lejant 42 px yukarı alındı
      ve dar ekranda kapalı başlıyor.
- [x] **Masaüstünde de İzmir merkezindeki ilçe adları iç içeydi** — alanın ekrandaki
      boyu 58 px'in altındaysa adı yazılmıyor. Açılışta 30 yerine 23 ad çıkıyor;
      Konak/Balçova z10'da, Narlıdere/Karşıyaka z11'de kendiliğinden beliriyor.
- [x] Başlıktaki eski açıklama satırı ve ölü yorumlar temizlendi.

## Arayüz iyileştirmeleri
- [x] **Özet şeridi arama kutusunun hemen altına alındı** — seçili toplam km ve
      farklı yol adı sayısı ilk bakışta görünüyor (önce sayfanın altındaydı).
- [x] **Harita üstünde lejant** (sol alt, açılır-kapanır, durumu hatırlanıyor) —
      panel kapalıyken hangi rengin ne olduğu haritadan okunabiliyor.
- [x] **Kategori başına "yalnız" düğmesi** — tek tıkla sadece o kategori; ikinci
      tıkta varsayılana dönüyor.
- [x] **Süzgeç özeti + "temizle"** — varsayılandan sapıldığında "Süzgeç: 1/6
      kategori" yazıyor, tek tıkla sıfırlanıyor.
- [x] **Kapalı kategoriler soluklaştırıldı**, bölüm aç/kapa durumu hatırlanıyor.
- [x] **Yol tipi tablosu kendi bölümüne taşındı** (önce sayfa dibindeydi).
- [x] **Kategori satırları iki satıra ayrıldı** — ad+km üstte, açıklama ve
      ✎ / yalnız düğmeleri altta. Ad artık kırpılmıyor.
- [x] Panel yüksekliği **2024 px → 1595 px**: ilçe listesi kaydırmasız görünüyor.

## Ölçümler (temiz derleme sonrası, sıcak önbellek)
| Ölçüm | Değer |
|---|---|
| Açılışta inen | ozet.json + yollar-1/2/3/4 + sınırlar |
| Sayfa hazır | ~1,0 sn |
| ozet.json | 2,20 MB → **0,11 MB** |
| Tam çizim | 65 ms |
| Zoom | 146-166 ms |
| Süzgeç yenileme | 35 ms |
| Fare hareketi (vurgu testi) | 0,10 ms |
| Derleme | 1 dk 18 sn (42.753 yol) |

## Doğrulama
`test2`, `ilce_test`, `mah_test`, `sinir_test`, `yeni_ui` ve yeni `mobil`
senaryoları temiz derleme çıktısı üzerinde çalıştırıldı; hepsi geçti, tarayıcı
konsolu temiz. Telefon ölçüsünde (390×844) yatay taşma yok, kategori adları
kırpılmıyor, lejant ölçek çubuğunu kapatmıyor.

---

# Tur 9 — Birleşik (dissolve) yol kayıtlarını ayırma + sınır düzenleme düğmesi

İstek: "x ilçesindeki bir yol parçasını seçtiğimde y ilçesindeki yol parçasını da
seçiyor, aralarında bağlantı bile yok. ADINUMARASI merge olmasından kaynaklı
muhtemelen, özellikle NULL olanlarda göze batıyor... ayrıca mahalle veya ilçe
sınırlarının çizgi kalınlığı düzenleme seçeneği de yok son güncellemede."

## Teşhis
Kullanıcının tahmini doğru. KML'de kayıtlar (ADINUMARASI, DURUM) ikilisine göre
birleştirilmiş (dissolve). Ölçüm:

| | |
|---|---|
| Toplam kayıt | 42.753 |
| Tek parçalı kayıt | 29.213 |
| **Çok parçalı kayıt** | **13.540** |
| Toplam parça | 106.322 |

En kötü örnekler:
| Ad | DURUM | Parça | Yayılım |
|---|---|---|---|
| (adı boş) | 0 | **4.849** | 197 km |
| (adı boş) | 5 | **2.011** | 193 km |
| (adı boş) | 3 | 386 | 167 km |
| KADIKÖY | 1 | 114 | 100 km |
| ATATÜRK | 3 | 129 | 117 km |

Yani "adı boş + DURUM 0" olan her şey **tek bir kayıt**. Birine tıklayınca
4.849 parçanın tamamı seçiliyor — kullanıcının gördüğü tam olarak bu.

İkinci sorun benim geçen turda yaptığım bir hata: `.kat-duzenle` düğmesini
`visibility:hidden` yapıp `.kat:hover` ile gösterdim. İlçe/Mahalle bölümündeki
✎ düğmeleri `.kat` içinde değil, bu yüzden **hiç görünmez oldular**.

## Plan
- [x] `derle.py`: `kayitlari_ayir()` — birleşim-bulma (union-find) ile kaydın
      parçaları ortak köşe noktası üzerinden gruplanıyor. Tüm köşe noktaları
      taranıyor, böylece T kavşaklar da yakalanıyor. Süre: 0,4 sn.
- [x] `fid` orijinal hâlinde korunuyor, ayrılan kayda `parca_no` ekleniyor.
- [x] `.kat-duzenle` / `.kat-yalniz` her zaman görünür.
- [x] README'ye "5b. Birleşik kayıtların ayrılması ve QGIS'e geri alma" bölümü.
- [x] İndirme menüsünde GeoJSON "düzeltilmiş" olarak etiketlendi.

## Sonuç
| | Önce | Sonra |
|---|---|---|
| Kayıt | 42.753 | **75.981** (11.326 kayıt bölündü) |
| Toplam km | 31.655,2 | **31.655,2** (değişmedi — geometri kaybı yok) |
| En büyük tek kayıt | 4.849 parça / 197 km yayılım | **123 parça / 1,6 km** |
| "KADIKÖY" | 1 kayıt | **106 kayıt, 13 ilçeye dağılmış** |
| 25 km'den geniş yayılan | çok | **6** (Çeşme/Aydın/Kuzey Ege otoyolları, Çevre Yolu) |
| İzmir Çevre Yolu (343 parça) | — | **2 yol** (gerçekten sürekli, doğru) |
| İzmir–Çeşme Otoyolu (194 parça) | — | **1 yol** (68 km kesintisiz, doğru) |

Doğru davranışın korunduğunun kanıtı: sürekli otoyollar bölünmedi, bölünenler
yalnızca birbirine değmeyen kayıtlar.


---

# Tur 10 — Sınır düzenleyicisinin görünürlüğü + alana zoom

İstek: "mahalle ve ilçe sınırları görünümünü editleme aracı gelmedi ya da ben
göremedim? ayrıca bir mahalleyi aratıp seçtiğiniz zaman direkt oraya zoomlasın."

## Teşhis
Yayındaki sürüm güncel (son derleme başarılı). Düğme teknik olarak oradaydı ama
**çıplak bir ✎ simgesiydi** — 22 px, soluk gri, satırın en sağında. Kullanıcı
göremedi; haklı. Teknik olarak "var olmak" ile "bulunabilir olmak" aynı şey değil.

## Yapılanlar
- [x] `✎` → **`✎ Çizgi ayarları`** yazılı düğme (`.sinir-duzenle`), çerçeveli ve
      dolgulu. Telefonda da sığıyor (105 px, taşma yok).
- [x] İlçe ya da mahalle rozetine tıklayıp **seçince** harita o alanın sınır
      kutusuna gidiyor (`alanaGit`). Mahallede en çok z15, ilçede en çok z13.
      Seçimi **kaldırınca** harita yerinde kalıyor.
- [x] Teste iki denetim eklendi (toplam 17): seçilen alanın ekranda olması ve
      yakınlaşmanın gerçekleşmesi ölçülüyor.

## Doğrulama
`Zeytindağ` arandı → rozete tıklandı → harita z9'dan **z13**'e gitti, mahalle
sınırı tamamen ekranda. `Bergama` seçildi → **z10,5**, ilçe ekranda. Seçim
kaldırılınca liste temizlendi. 17/17 denetim geçti, konsol temiz.

---

# Tur 11 — QGIS'te performans: GeoPackage çıktısı

İstek: "yolları ayırdığın geojson dosyasını indirdim. qgiste açtığımda aşırı
kasıyor program çünkü çok fazla parça var. ne yapabiliriz?"

## Teşhis
Asıl sebep parça sayısı değil, **dosya biçimi**. GeoJSON düz metindir ve
**mekânsal indeksi yoktur**: QGIS 38,5 MB'ı baştan okur, her kaydırma/yakınlaştırma
işleminde 75.981 kaydı tek tek tarar. GeoPackage ise SQLite tabanlıdır ve R-tree
indeksi taşır — aynı veri, aynı kayıt sayısı, ama QGIS yalnızca ekrandaki
kayıtları okur.

(Karşılaştırma: 76 bin kayıt GeoPackage'da QGIS için normal bir boyut.
Aynı kayıt GeoJSON'da ağırdır. Veriyi küçültmek değil, biçimi değiştirmek gerek.)

## Plan
- [x] `derle.py`'a `gpkg_yaz()`: yalnızca `sqlite3` + `struct`. R-tree indeksi,
      spec tetikleyicileri (6 adet), `gpkg_extensions` kaydı dahil.
- [x] `fid` çakışması çözüldü: orijinal kayıt numarası `kayit_no` alanında.
- [x] `durum_adi` alanı eklendi.
- [x] İndirme menüsü yeniden düzenlendi; GeoPackage en üstte "Önerilen".
- [x] **Süzgeçli indirme**: ekrandaki süzgece uyan yollar tek tıkla GeoJSON.
      Düğmenin altında kaç yol / kaç km olduğu yazıyor.
- [x] README'ye "Neden GeoPackage", alan tablosu ve "QGIS yine de ağırsa" bölümü.
- [x] GeoPackage yazılamazsa derleme çökmüyor; site GeoJSON ile yayınlanıyor,
      menüdeki bağlantı gizleniyor.

## Ölçüm (GDAL ile — QGIS'in kullandığı kütüphane)
40 rastgele harita penceresi, ikisi de aynı 4.594 kaydı döndürdü:

| | GeoJSON | GeoPackage |
|---|---|---|
| 40 pencere sorgusu | **44,63 sn** | **0,04 sn** |
| Pencere başına | 1.116 ms | **1 ms** |
| Dosya boyutu | 38,5 MB | 35,0 MB |

Yani fark boyuttan değil, tamamen indeksten geliyor — yaklaşık **1.000 kat**.

## Doğrulama
`ogrinfo` dosyayı sorunsuz açıyor (75.981 kayıt, MultiLineString, EPSG:4326).
75.981 kaydın tamamı kaynak GeoJSON ile karşılaştırıldı — öznitelikler ve
319.759 koordinat — **0 fark**. R-tree sorgu planında kullanılıyor
(`SCAN rtree_yollar_geom VIRTUAL TABLE`), 75.981 indeks satırı, 6 tetikleyici,
`application_id = 0x47504B47`, `user_version = 10200`.
Site testi 20/20 geçti, konsol temiz.
