# Çıkarılan dersler / proje kısıtları

Bu dosya, aynı hataların tekrarlanmaması için tutulur.

## Veri

- **Sınıflandırmanın kaynağı renk değil, `DURUM` alanıdır.** KML'deki renk yalnızca
  QGIS sembolojisinin bir yansımasıdır ve zamanla değişebilir. Kod her zaman `DURUM`
  üzerinden çalışmalı; renk sadece görüntüleme varsayılanı olarak kullanılmalı.
- KML renkleri **`aabbggrr`** sırasındadır (RGB değil). `FFf85baa` → `#aa5bf8` (mor).
  Ters çevirmeyi unutmak siyahı mavi gösterir.
- Kaynak KML'de **geometrisi tamamen boş 7 kayıt** var (fid 25, 26, 27, 466, 467,
  3882, 3883). Bunlar sessizce atılmamalı; kullanıcıya kayıt numarasıyla raporlanmalı
  ki QGIS'te düzeltebilsin.
- `ADINUMARASI` alanı 707 kayıtta boş. Bu kayıtlar arama ile bulunamaz; "İsimsiz yol"
  olarak gösterilir ve uyarı listesinde belirtilir.
- Koordinatları 6 haneye yuvarlamak (~11 cm) dosyayı ~%25 küçültüyor, hassasiyet kaybı
  bu ölçek için önemsiz.

## Arayüz

- **Leaflet `fitBounds` varsayılanda tam sayı zoom'a yuvarlar**; geniş ekranda veri
  ekranın yarısı kadar kalabiliyor. `zoomSnap: 0.25` ile düzeldi.
- Harita üstündeki mutlak konumlu kontroller (`#altlik-secim`, `#koordinat`) doğrudan
  esnek kutu (flex) kabına konursa **panelin altında kalıyor**. Haritayı saran ayrı bir
  `position: relative` kabı (`#harita-alan`) şart.
- **Koyu temada siyah çizgi görünmüyor.** Kategori renkleri tema duyarlı olmalı;
  `kategoriler.json` içine `renk_koyu` alanı eklendi.
- Leaflet'te vektör katman tıklaması **haritaya da yayılır**; arka plan tıklamasıyla
  vurguyu temizlemek için katman tıklamasında `L.DomEvent.stopPropagation(e)` gerekli.
- `URLSearchParams.toString()` bölü ve virgülleri `%2F` / `%2C` yapıp bağlantıyı
  okunmaz hâle getiriyor; paylaşım bağlantısı elle kurulmalı.
- Türkçe arama için `İ/I/ı → i`, `ş → s`, `ğ → g` dönüşümü hem Python (derleme) hem
  JavaScript (arama) tarafında **aynı** yapılmalı, yoksa arama tutmaz.

## Ortam / altyapı

- Bu geliştirme ortamından `unpkg`, `cdnjs.cloudflare.com` ve `overpass-api.de`
  engelli; `raw.githubusercontent.com` açık. Leaflet bu yüzden cdnjs'in GitHub
  aynasından indirilip depoya gömüldü — sonuç olarak site CDN'siz çalışıyor, bu bir
  kazanç oldu.
- Türkiye **ilçe** sınırları için erişilebilir açık bir GeoJSON bulunamadı
  (yalnızca il sınırları). Bu yüzden ilçe etiketleme, kullanıcının kendi
  `veri/ilce_sinirlari.geojson` dosyasını bırakmasına bağlı isteğe bağlı bir özellik
  olarak kuruldu.
- GitHub Pages, Actions ile yayınlanırken `github-pages` ortamı **yalnızca varsayılan
  daldan** dağıtıma izin verir. Bu yüzden iş akışı her dalda derleme yapıp yalnızca
  varsayılan dalda yayınlıyor (`github.ref_name == default_branch`).
- **GitHub Pages'i iş akışı kendisi açamaz.** `actions/configure-pages` `enablement: true`
  ile denendi; `GITHUB_TOKEN` "Resource not accessible by integration" veriyor — Pages
  sitesini oluşturma yetkisi depo sahibinde. Bu yüzden adım `continue-on-error: true`
  yapılıp, ardından kullanıcıya ne tıklayacağını anlatan Türkçe bir Actions özeti
  yazılıyor. Sessizce yeşil kalmak yerine, anlaşılır bir hatayla durmak tercih edildi.
- `shutil.rmtree` ile çıktı klasörü silinirken depo kökü koruması şart; aksi hâlde
  `--cikti .` tüm depoyu siler.

## 2. Tur (07.09.2026)

- **CARTO altlıkları artık API anahtarı istiyor.** `{s}.basemaps.cartocdn.com` karoları
  "API KEY REQUIRED" filigranıyla geliyor. Çözüm: Sade ve Koyu görünümleri ayrı bir
  servisten almak yerine **OpenStreetMap karolarına CSS filtresi** uygulayarak üretmek
  (`filter: invert(1) hue-rotate(180deg)…`). Tek karo sunucusu, sıfır anahtar.
- **Performansta darboğazı tahmin etme, ölç.** "Çok fazla çizgi var, tuval yavaş"
  varsayımı yanlıştı: tuval çizimi 0,1–1,9 ms. Gerçek maliyet, her hareket/zoomda
  **53.086 noktanın yeniden projeksiyonu** (z16'da 90 ms). Çözüm: görüş alanı
  dışındaki yolları Leaflet'e hiç vermemek. z13'te 140 ms → 6 ms.
- Nesne sayısını 6.647'den 4'e indirmek tek başına yetmedi; asıl kazanç kırpmadan geldi.
  İkisi birlikte doğru çözüm.
- **Kalınlık güncellemesini zoomend'de koşulsuz yapmak** her zoomda fazladan bir tam
  çizim demek (+100 ms). Kademe değişmedikçe dokunmamak gerekiyor; en iyisi kalınlığı
  zaten yeniden kurulan katmanda uygulamak.
- **Yol rengi arayüz temasına değil, ALTLIK HARİTANIN koyuluğuna bağlanmalı.**
  Koyu tema + açık altlık seçildiğinde siyah yollar beyaza çevriliyor ve beyaz zeminde
  kayboluyordu. Lejant örneklerine de ince çerçeve gerekli, aksi hâlde açık renk
  açık panelde görünmüyor.
- **Leaflet'in ölçek çubuğu doğru çalışıyor** (1 km etiketi için sapma %0,19; bağımsız
  Web-Mercator hesabıyla doğrulandı). Kullanıcının "hatalı" algısı, koordinat kutusunun
  çubuğun üzerine binmesinden ve asıl ihtiyacın bir **ölçme aracı** olmasından geliyordu.
  Şikâyeti reddetmek yerine ölçüp doğrulamak, sonra gerçek ihtiyacı karşılamak doğru yol.
- **Tarayıcı testlerinde HTTP önbelleği.** CDP ile test ederken aynı profil eski
  `app.js`'i sunup saatlerce yanıltabilir; `Network.setCacheDisabled` şart.
- `Runtime.evaluate` + `returnByValue`, Leaflet harita nesnesi döndüren çağrılarda
  ("Object reference chain is too long") hata verir; ifadeyi `;void 0` ile bitirmek gerekir.
- GitHub Pages adresi `https://<hesap>.github.io/<depo>/` kalıbındadır; kök adres için
  depo adının tam olarak `<hesap>.github.io` olması gerekir. Depo taşımasında Pages
  ayarı taşınmaz, yeniden açılması gerekir.
