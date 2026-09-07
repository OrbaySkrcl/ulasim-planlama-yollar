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
- `shutil.rmtree` ile çıktı klasörü silinirken depo kökü koruması şart; aksi hâlde
  `--cikti .` tüm depoyu siler.
