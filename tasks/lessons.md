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

## 3. Tur — ilçe sınırları (09.09.2026)

- **Sessiz başarısızlık en kötü hata türü.** Yüklenen ilçe dosyası kabul edildi,
  "30 ilçe yüklendi" yazdı, ama tüm yollar "Belirlenemedi" oldu ve kullanıcı
  "bir şey değişmedi" diye geri döndü. Ders: bir eşleştirme adımının **başarı
  oranını ölç** ve düşükse yüksek sesle uyar. Artık eşleşme oranı hem derleme
  günlüğüne hem siteye yazılıyor, %95 altındaysa veri kalitesi uyarısı çıkıyor.
- **Türkiye'deki kurumsal GIS verisi genellikle projeksiyonlu gelir.** Bu dosya
  EPSG:5253 (TUREF / TM27) idi; kod enlem/boylam bekliyordu. GeoJSON'da `crs`
  alanı yoktu, yani biçimden anlaşılmıyordu — koordinat büyüklüğüne bakmak gerekti
  (|x| > 180 ise projeksiyonlu).
- **Projeksiyonu tahmin etmek yerine ölçmek çalıştı.** 22 aday ters TM ile
  denendi ve "yol orta noktalarının ilçe poligonlarına düşme oranı" ile puanlandı:
  doğru aday %99,8, en yakın yanlış aday %97,9. Ayırt edici olan k0 farkı
  (1,0 vs 0,9996) — kuzey yönünde ~1,7 km kayma yapıyor.
- **Alan adına güvenme, içeriğine bak.** `NAME` alanında ilçe adı yerine nesne
  numarası ("536") vardı; gerçek ad, KML dönüşümünde bozulmuş `__L__E_AD_`
  alanındaydı. Sayısal/bağlantı/sistem alanlarını ayıklayıp farklı değer sayısı
  ve harf oranına göre puanlamak doğru alanı buldu.
- **Leaflet divIcon'da `transform` ile ortalama yapılamaz:** Leaflet ikonu
  `translate3d` ile konumlandırdığı için CSS `transform`'u ezer. Çözüm, etiketi
  bir iç `<span>` içine alıp ortalamayı ona uygulamak.
- Sınır katmanının yolların altında kalması için ayrı bir Leaflet **pane**
  (`zIndex: 380`) kullanmak gerekiyor; aynı tuvalde çizim sırası her yeniden
  kurulumda değiştiği için güvenilmez.
- Türkçe başlık biçimi için `str.title()` kullanılamaz: `I`→`ı`, `İ`→`i`
  eşlemesi elle yapılmalı (ALİAĞA → Aliağa).

## 4. Tur — mahalle sınırları (17.09.2026)

- **Yoğunluk, doğruluktan önce gelen bir tasarım sorunudur.** 1.314 mahalle sınırı
  teknik olarak sorunsuz çizildi ama il genelinde yolları tamamen boğdu. Ekran
  görüntüsüne bakmasaydım "çalışıyor" diye teslim edecektim. Çözüm: katman başına
  **çizim yakınlık eşiği** (mahalle z11, adlar z12) ve eşiğin altındayken panelde
  görünür bir not — gizlemek ile sessizce çalışmamak arasındaki fark bu nottur.
- **Aynı adlar veride kuraldır, istisna değil.** İzmir'de 19 ayrı "Atatürk"
  mahallesi var. Benzersiz anahtar üst katmandan (ilçe) türetilmeli; ama haritada
  her etikete "(Bergama)" yazmak okunaksız. Ayrım: **anahtar benzersiz, etiket kısa.**
- **İkinci benzer özellik gelince genelleştir.** İlçe kodunu kopyalayıp mahalleye
  uyarlamak yerine tek ortak koda çevirmek (tür tanımı + ortak fonksiyonlar)
  hem düzenleyiciyi hem kırpmayı hem etiketleri tek yerde tuttu.
- **Leaflet'te çok sayıda poligonu tek nesnede topla.** `L.polygon` çok-poligon
  dizisi kabul ediyor; 1.314 ayrı katman yerine 2 nesne (normal + vurgulu)
  projeksiyon maliyetini nesne başına değil nokta başına indiriyor.
- **Ayrı pane = güvenilir z-sırası.** Sınırların yolların altında kalması için
  `createPane` + `zIndex` şart; aynı tuvalde çizim sırası her yeniden kurulumda
  değişiyor.
- Nokta-poligon araması 1.300+ alanda doğrusal yapılamaz; sınır kutularını
  ızgara hücrelerine kaydeden basit bir indeks derlemeyi 7,5 saniyede tutuyor.
- KML kökenli GeoJSON'larda `description` alanı dosyanın %90'ı olabiliyor
  (19 MB'lık dosyanın geometrisi ~2 MB). Derleme kullanmıyor; kullanıcıya
  isteğe bağlı bir küçültme yolu olarak söylemek yeterli.

## 5. Tur — büyük dosya (22.09.2026)

- **Önce sıkıştırma oranını ölç, sonra çözüm öner.** "Dosya bölelim / LFS
  kuralım / vektör karo üretelim" demeden önce zip denendi: %15. Sorun
  tamamen çözüldü ve kullanıcının iş akışı değişmedi (bir sağ tık).
- OGR'nin KML çıktısı **her Placemark için aynı `<Style>` bloğunu** tekrar
  yazar ve koordinatları **13 ondalık haneyle** kaydeder. Bu yüzden bu dosyalar
  olağanüstü sıkıştırılabilir; boyut gerçek veri miktarını yansıtmıyor.
- **GitHub sınırları:** web arayüzünden yükleme 25 MB/dosya, komut satırından
  100 MB (50 MB'da uyarı). Web arayüzü kullanan biri için asıl sınır 25 MB.
- `ET.parse` bütün ağacı belleğe alır; büyük dosyada `ET.iterparse` + işlenen
  öğeyi `clear()` etmek belleği sabit tutar. Placemark'ı temizlemek yeterli —
  geriye kalan boş öğeler önemsiz.
- **Dosya tarihine göre "en yenisini seç" git deposunda çalışmaz:** checkout
  bütün dosyalara aynı mtime'ı verir. Birden fazla aday varsa tahmin etmek
  yerine hata vermek doğru — sessizce eski veriyle yayınlamak en kötüsü.
- Uzantıya göre dosya arayan bir kural yazarken **aynı klasördeki ayar
  dosyalarını dışlamayı unutma** (`kategoriler.json` yol verisi sanıldı).

## 6. Tur — tam yol ağı (22.09.2026)

- **Sınır kutusuyla kırpma, çok parçalı kayıtlarda işe yaramaz.** Kaydın parçaları
  ilin iki ucundaysa kutusu yarım ili kaplar ve her zaman "görünür" çıkar. Ölçüm:
  40.859 kaydın 6.591'inde (%25) kutu >11 km ve bunlar noktaların %52'sini tutuyordu.
  Çizim/tıklama birimini **parça** yapmak z17'de 45 kat kazandırdı.
- **Yavaşlığın nedenini katman katman ölç.** "Yollar yavaş" sanıyordum; katmanları
  tek tek kapatınca z10→11'de payların yollar 213 ms, mahalle sınırı 130 ms,
  ilçe 65 ms, karolar 93 ms olduğu çıktı. Mahalle eşiğini bir kademe yükseltmek
  tek satırla 130 ms kazandırdı.
- **Uzaktan tam çözünürlük çizmek israf.** z10'da bir piksel ~150 m, noktalar ~50 m
  aralıklı. Yakınlığa göre seyreltme (z<11'de 8'de 1) görüntüyü bozmadan üçte bire
  indiriyor. Douglas-Peucker'lı ayrı dosyalar üretmeye gerek kalmadı.
- **Veri büyüyünce "hepsini yükle" sürdürülemez.** Kategori başına dosya + istendiğinde
  indirme, açılışı 31 MB yerine 4,85 MB'ta tutuyor. Kullanıcı kapalı kategoriyi
  işaretlediğinde indirmek, hem hızlı açılış hem tam erişim demek.
- **Kalabalık katmanı sessizce gizleme, söyle.** Yakınlık eşiğiyle gizlenen kategori
  için panelde neden gizlendiğini ve ne yapılacağını yazan bir not şart; yoksa
  kullanıcı "çalışmıyor" diye geri gelir (3. turda mahalle sınırlarında öğrenilmişti).
- Sistemde `unrar`/`7z` yoksa **libarchive zaten kuruludur**; ctypes ile bağlanmak
  RAR/7z/zip açmaya yetiyor, paket kurmaya gerek yok.
- Aramada, adı kapalı bir kategoride de geçen yola tıklanınca o kategorinin 15 MB'ını
  indirmek sürpriz olur. Önce **açık** kategorilerde ara; yalnızca hiçbirinde yoksa
  kapalıyı aç.
- **Özet dosyasına "her ihtimale karşı" liste koymak pahalı.** 30.568 yol adı
  `ozet.json`'u 2,20 MB yaptı ve herkes her açılışta indiriyordu, oysa arama
  yapanların oranı düşük. Büyük listeler ayrı dosyaya + ilk kullanımda indirme.
- **Satır içine düğme eklemek adı kırpar.** `.ad` ile `.sayi` arasına iki düğme
  koyunca kategori adları "Devredil..." oldu. Çözüm: düğmeleri ikinci satıra
  (açıklama satırına) almak; `visibility:hidden` yer kapladığı için `.ad`'ı
  kurtarmıyor.
- **Masaüstünde doğru olan etiket yoğunluğu telefonda değil.** Açılış yakınlığı
  1440 px'te z9, 390 px'te z7,5; aynı 30 ilçe etiketi dar ekranda üst üste
  biniyor. Sınır etiketlerine en küçük yakınlaştırma eşiği şart.
- **Harita üstü kutular ölçek çubuğu/katkı satırıyla çakışır.** Telefonda sol alt
  köşe `bottom:14px` ile Leaflet ölçek çubuğunun üstüne geliyor; dar ekranda
  hem yukarı almak hem de varsayılan kapalı başlatmak gerekti.
- **Testler iç API'ye değil davranışa bakmalı.** `D.ilceSinir` → `D.sinir.ilce.katman`
  ve yol bazlı `f.ll` → parça bazlı `q.ll` değişiklikleri test betiklerini art arda
  kırdı.
- **Arayüz değişince ekran görüntüsüne bak.** "Panel 1560 px'e indi" ölçümü iyi
  görünürken ekran görüntüsü adların kırpıldığını gösterdi; sayısal ölçüm tek
  başına yetmiyor.
- **QGIS'te "dissolve" edilmiş veri haritada tek nesne gibi davranır.** Aynı ada
  göre birleştirilen yollar tek kayıt olur; haritada birine tıklayınca il genelinde
  dağınık duran tüm parçalar seçilir. Çözüm: parçaları ortak köşe noktası üzerinden
  birleşim-bulma (union-find) ile gruplayıp bağlı olanları ayrı kayıt yapmak.
  Bitiş noktası değil **tüm köşe noktaları** taranmalı, yoksa T kavşaklar kaçar.
- **Bu ayrımın doğruluğu "ne bölündü"den çok "ne bölünmedi" ile ölçülür.** İzmir
  Çevre Yolu'nun 343 parçası tek kayıt kalıyorsa algoritma doğrudur; bölünseydi
  fazla agresif demekti.
- **`visibility:hidden` + `:hover` ile gösterilen düğme dokunmatik ekranda yok
  demektir.** Üstelik kuralı `.kat:hover` ile yazınca `.kat` içinde olmayan aynı
  sınıftaki düğmeler (ilçe/mahalle ✎) tamamen kayboldu. Kullanıcı bildirdi.
  Ders: bir kuralı sınıfa göre gizlerken o sınıfın **başka nerede** kullanıldığını
  `grep` ile kontrol et.
- **"Düğme var" ile "düğme bulunur" aynı şey değil.** Sınır düzenleyicisinin
  kapısı çıplak bir ✎ simgesiydi; test "görünür: true" diyordu, kullanıcı yine
  göremedi. Simge + yazı ("✎ Çizgi ayarları") sorunu bitirdi. Bir aracı
  kullanıcı iki kez soruyorsa hata erişilebilirlikte değil, görünürlüktedir.
- **Listeden bir alan seçmek "orayı görmek" istemektir.** İlçe/mahalle seçimi
  yalnızca süzgeci değiştiriyordu; haritayı elle bulmak gerekiyordu. Seçince
  `fitBounds`, seçimi kaldırınca yerinde bırakmak doğru davranış.
- **QGIS'te "çok fazla kayıt var" diye bilinen sorun aslında biçim sorunudur.**
  GeoJSON düz metindir ve mekânsal indeksi yoktur; QGIS her kaydırmada bütün
  kayıtları tarar. Aynı 75.981 kayıt GeoPackage'da (SQLite + R-tree) pencere
  başına 1116 ms yerine **1 ms** sürüyor. Veriyi küçültmeden önce biçime bak.
- **GeoPackage yazmak için GDAL gerekmiyor.** `sqlite3` + `struct` yetiyor:
  birkaç spec tablosu, geometri için 'GP' başlıklı WKB, bir R-tree sanal
  tablosu ve 6 tetikleyici. Projenin "bağımlılık yok" kuralı bozulmadı.
- **GeoPackage'da `fid` ayrılmış bir addır** (tamsayı birincil anahtar olmak
  zorunda). Kaynaktaki `fid` alanını `kayit_no` diye yazmak gerekti.
- **Kendi yazdığın ikili biçimi mutlaka üçüncü taraf kütüphaneyle doğrula.**
  Kendi okuyucunla okumak hiçbir şey kanıtlamaz; aynı hatayı iki kez yaparsın.
  GDAL (QGIS'in kullandığı kütüphanenin ta kendisi) ile 75.981 kaydın tamamı
  kaynakla karşılaştırıldı: 0 fark.
- **JavaScript şablon dizgisi (`` ` ``) içinde `\d` yazarsan `d` olur.** Testte
  `/\d+/` sessizce `/d+/` oldu ve eşleşme bulamadı; hata kodda değil testteydi.
  Şablon dizgisi içinde ya `\\d` yaz ya da `[0-9]` gibi kaçışsız ifade kullan.
- **"Üst üste biniyor mu?" sorusuna önce ölçerek cevap ver.** Tahmin etmek
  yerine segment bazında saydım: devredilen yolların %93'ü başka bir DURUM'da
  da kayıtlıymış. Bu, kilometrelerin iki kez sayılması demekti — kullanıcının
  fark ettiği görsel sorun aslında bir veri bütünlüğü sorunuymuş.
- **Geometrik ayıklamada "ne silinmedi" en az "ne silindi" kadar önemli.**
  Yalnızca birebir aynı segmentleri sildim; yan yana giden ayrı yollar ve
  kavşakta buluşan yollar korundu. Kalan yakınlığı sınıflandırdım: segmentin
  **tek ucu** yakınsa kavşak, **iki ucu** yakınsa şüpheli kopya. 232 km'lik
  yakınlığın yalnızca 3,11 km'si gerçek şüphe çıktı.
- **Toleranslı silme cazip ama tehlikeli.** 2 m toleransla silseydim çift yönlü
  yolları ve servis yollarını da yok ederdim. Birebir eşleşme + kalıntıyı
  raporlamak daha dürüst.
- **Türetilmiş düzeltme kaynağı düzeltmez.** Derleme haritayı tutarlı yapıyor
  ama asıl sorun QGIS'teki DURUM alanının tekilleştirilmemesi. Bunu sitedeki
  veri kalitesi uyarısında açıkça yazdım ki kullanıcı kaynağı da düzeltsin.
- **Kalıcı kimlik için yeni alan açmaya gerek yoktu.** GeoPackage'ın kendi `fid`
  birincil anahtarı zaten kalıcı: QGIS yerinde düzenlemede korur, yeni kayda
  kendiliğinden atar. Eski sorunun sebebi fid'in kötü olması değil, her dışa
  aktarımda **yeniden üretilmesiydi**. Dışa aktarmayı kaldırınca sorun bitti.
- **Kendi yazdığın biçimi referans uygulamayla karşılaştır, "düzeltmeden" önce.**
  Ana katmanda düz sqlite3 ile UPDATE `ST_IsEmpty` yok diye patlıyordu. Hata
  sandım; GDAL'ın kendi ürettiği GeoPackage'ı denedim, o da aynı şekilde
  patlıyordu. Yani bu standardın davranışı — QGIS fonksiyonları sağlıyor.
  Referansa bakmasaydım çalışan bir şeyi bozacaktım.
- **Üstün durum kuralı devir iş akışında kendiliğinden işe yarıyor.** 40 yolu
  5'ten 1'e çevirdiğimde, aynı çizgiyi taşıyan 3 "Belirsiz" kayıt otomatik
  çakışık sayılıp çıktı. Yani kullanıcı devir yaptıkça kopyalar kendiliğinden
  temizleniyor; kuralı bir kez doğru kurmak her güncellemede iş görüyor.
- **Stili üretirken gerçek QGIS'le doğrula.** QML şemasını tahminle yazmak
  kolay, yanlış yazmak daha kolay. apt'ten python3-qgis kurup
  `loadNamedStyle` + `editorWidgetSetup` ile denetlemek dakikalar aldı ve
  açılır listelerin gerçekten geldiğini kanıtladı.
- **Dosya boyutu sınırını iş akışını tasarlarken kontrol et, sonunda değil.**
  Ana katmanı 30,8 MB yaptım, sonra fark ettim ki GitHub'ın tarayıcıdan yükleme
  sınırı 25 MB. Kullanıcı kodlama bilmiyor ve tarayıcıdan yüklüyor — yani
  yazdığım "şu adımları izleyin" talimatı onda hiç çalışmayacaktı. Tablonun
  kendisi 26,7 MB olduğu için indeksi atmak bile yetmiyor; çözüm zip (15,8 MB)
  ya da GitHub Desktop. Derleme ikisini de okuyacak şekilde genişletildi.
- **Excel'de renk "bilgi" taşıyorsa, tema indeksine değil çözülmüş RGB'ye bak.**
  Liste theme:4/tint:0.6 ve theme:4/tint:0 kullanıyordu. Tema indeksine göre
  kural yazmak, dosya başka bir programda kaydedilince kırılırdı. Tema
  paletini + tint'i hesaplayıp gerçek rengi bulmak ve "mavi mi" diye sormak
  hem daha sağlam hem daha okunur.
- **.xlsx okumak için kütüphane şart değil.** Zip içinde XML: sharedStrings,
  styles (cellXfs → fills → fgColor) ve theme1. Projenin "bağımlılık yok"
  kuralı korundu. Doğruluğu openpyxl ile karşılaştırarak kanıtladım — kendi
  okuyucumu kendi başına doğru saymadım.
- **Korkutucu görünen sayıyı yorumlamadan önce aç.** "FATİH CADDESİ → 34 kayıt"
  aşırı eşleşme sandım; toplamı 4,4 km çıktı, yani kendi bölme işlemimizin
  bir caddeyi parçalara ayırmasıydı. 30 km'yi aşanlar da gerçek karayollarıydı.
- **"Ayrı proje" sözü arayüzde de görünmeli.** Veriyi ayırmak yetmiyor;
  bölüme "ayrı çalışma" rozeti ve kenar çizgisi koymak, kullanıcının iki
  çalışmayı karıştırmasını önlüyor. Testte de bunu bir değişmez olarak
  doğruladım: ana kategoriler kapalıyken katman durmaya devam ediyor.
- **Kimlik "fid" değil, "(fid, parca_no)" ikilisi.** Kullanıcı ana katmanda
  kopuk parçası olan bir yol oluşturunca bölücü onu iki kayda ayırdı ve ikisi
  de aynı fid'i taşıdı; test "fid tekil" diye bakıyordu ve patladı. Hata
  veride değil testin varsayımındaydı — README zaten ikiliyi tekil anahtar
  olarak yazıyordu. Bir değişmezi koda yazarken belgede ne dediğine bak.
- **Kullanıcı veriyi değiştirdikten sonra mutlaka onun dosyasıyla derle.**
  Kendi ürettiğim ana katmanla her şey yeşildi; kullanıcının yüklediği zip ile
  derleyince ortaya çıkan tek fark bu oldu ve gerçek bir ayrıntıyı gösterdi.
- **İki benzer dosya varsa kullanıcı er geç yanlışını düzenler.** Ana katman
  (`yollar_master.gpkg`) ile yayın kopyası (`yollar.gpkg`) karıştı. Suçlamadan
  önce şemayı karşılaştırıp kanıtladım, sonra onaran bir yol açtım
  (`ana_katman.py` yayın şemasını da okuyor). Belgeye uyarı yazmak yetmiyor;
  **yanlış yoldan dönüşü de kolay yapmak** gerekiyor.
- **"Senin düzenlemen bozmuş" demeden önce kendi çıktını kontrol et.** 190,8
  km kopya geometriyi kullanıcının eklediğini sandım; kendi ürettiğim ilk ana
  katmanda da birebir aynı sayılar çıktı. Kaynak veriden geliyormuş.
- **Durumsuz (stateless) tasarım güncelleme sorusunu kendiliğinden çözer.**
  Geniş yollar listesi her derlemede sıfırdan okunduğu için "nasıl çıkarırım,
  nasıl eklerim" diye bir mekanizmaya gerek kalmadı: Excel'i düzenle, yükle.
  Eksik olan tek şey "ne değişti" görünürlüğüydü, o da karşılaştırmayla geldi.
- **Ad eşleştirmesinin kaçınılmaz hatası için düzeltme kapısı bırak.** Excel'de
  geometri yoksa aynı adlı iki yol ayırt edilemez. Çözüm algoritmayı
  zorlamak değil, insanın tek satırla müdahale edebileceği bir dosya açmak.
  Mahalle doğal ayırt edicidir: ilçe aynı olsa da mahalle farklıdır.
- **Düzeltme kapısını sorunun görüldüğü yere koy.** Kullanıcı yanlış yolu
  haritada görüyor; düğme oradan hazır kural satırını kopyalıyor. "Dosyayı aç,
  biçimi hatırla, elle yaz" demek yerine tıkla-yapıştır.
- **Kuralların da denetimi olmalı.** Hiçbir satıra uymayan kural (ör. Excel'den
  o satır çıkmış) ve yazım hatası günlüğe yazılıyor; yoksa kural ölü yatar ve
  kimse fark etmez.
- **Şüpheliyi otomatik silme, işaretle.** Parçaları uzak olan 39 satırın bir
  kısmı gerçek uzun yol (ÇANAKKALE ASFALTI 16 km, 4 mahalle). Otomatik
  temizlik bunları da silerdi. Rapor et, kararı insana bırak.
- **Bulanık (fuzzy) eşleştirme sayılarda yalan söyler.** `243 SOKAK` ile `7243`
  karakter olarak çok benzer ama bambaşka yollar. Öneriyi yalnızca harf içeren
  adlar için ürettim; sayısal sokaklarda susuyor. Yanlış öneri, öneri
  vermemekten kötüdür.
- **"Güncellenmiş dosyayı indirebilir miyim?" sorusunun dürüst cevabı bazen
  "hayır, ama şu var".** Excel değişmiyor; onun yerine listenin akıbetini
  gösteren rapor üretmek hem doğru hem daha kullanışlı oldu.
- **Türkçe Excel için CSV: noktalı virgül + UTF-8 BOM + ondalık virgül.**
  Üçü birden olmazsa dosya çift tıklamayla düzgün açılmaz. Testte BOM'u
  `fetch().text()` ile aradım, tarayıcı çözerken sildiği için "yok" sandım;
  `arrayBuffer()` ile baytlara bakmak gerekti.
- **Rehberi mekanizmaya göre değil, kullanıcının gördüğü soruna göre kur.**
  "duzeltme.txt nasıl yazılır" değil, "haritada yanlış çizgi var → şunu yap".
  Kullanıcı dosya adlarını değil, karşılaştığı durumu biliyor.
- **Aynı soruyu iki kez soruyorsa açıklama değil, ayrım eksiktir.** Kullanıcı
  "düzeltme Excel'i değiştiriyor mu?" diye iki kez sordu. Sorun cevabın
  yanlışlığı değil, "listeden çıkarmak"ın iki ayrı anlama gelmesiydi
  (haritadaki yanlış çizgi vs. gerçek karar değişikliği). Rehbere bu ayrımı
  ayrı bir başlık olarak koydum.

## Tur 21 — Taranmış PDF'ten tablo okuma

**Tesseract tabloda satır atlıyor.** Temiz, 300 dpi bir tabloda tek satırı tek
başına verdiğinizde kusursuz okuyor; aynı satır tablonun içindeyken sayfa
çözümleyicisi onu tamamen atlıyordu (bir sayfada 38 satırın 5'i okundu).
Çözüm: sayfa çözümleyicisine güvenmeyip tablo çizgilerini piksel profilinden
kendimiz bulmak, her hücreyi ayrı bir görüntü olarak `--psm 7` ile okumak.

**Yatay çizgiyi "koyu piksel sayısı" ile aramak yanlış.** Uzun bir metin
satırı da satırın %40'ını koyu yapıyor; "TARİHİ KEMERALTI BÖLGESİ (…)" gibi
uzun bir hücre ikiye bölündü. Ayırt edici olan **süreklilik**: en uzun
kesintisiz koyu dizi. Daha da iyisi, çizgiyi **sağ sütunda** aramak — orada
yalnızca "17", "20-25" gibi kısa sayılar var, bu yüzden uzun bir dizi ancak
tablo çizgisi olabilir.

**Taramanın 0,4 derecelik eğikliği her şeyi bozuyor.** 2000 piksel genişlikte
0,4° ≈ 14 piksel kayma; dikey çizgi hiçbir x sütununda tam görünmüyor, sayfa
"boş" sanılıyor (16 sayfanın 2'si sıfır satır verdi). Eğriliği sol dikey
çizginin üst/alt kaymasından ölçüp düzeltmek gerekti. Dönme yönünü tahmin
etmek yerine iki yönü de deneyip daha çok çizgi bulanı seçmek daha sağlam.

**Alfabetik sıra denetimi işe yaramadı.** OCR hatalarını yakalamak için
listenin kendi sıralamasını kullanmayı denedim; 82 "sıra dışı" satırın hemen
hepsi yanlış alarmdı (PDF'in kendi sıralaması Türkçe alfabetik değil, ayrıca
mahalle ekli satırlar blok sonuna konmuş). Asıl işe yarayan denetim: her
kaydın **yol türü anahtar kelimesi** içermesi şartı (SOKAK/CADDE/BULVAR/…).
649 satırın yalnızca 4'ü bu şartı geçemedi ve dördü de gerçekten çöptü.

**Kararın metni ile eki aynı şey değil.** Karar, listeye 4 sokak ekleyip 1
cadde çıkarıyor; ekteki tabloda çıkarılan zaten yok ama eklenenler de yok.
Eki olduğu gibi almak eksik veri demekti. Tabloyu kararın kendisiyle
karşılaştırmak gerekti.

## Tur 22 — Statik sitede gizlilik

**"Ekranda gizle" gizlemek değildir.** İlk refleks indirme düğmesini
`hidden` yapmaktı. Ama dosya yayındaysa adresini yazan indirir ve veri
zaten ziyaretçinin tarayıcısına inmiştir. İşe yarayan tek yaklaşım,
gizlenecek şeyi **hiç yayınlamamak** ya da adresi tahmin edilemez yapmak.
Bu yüzden gizlilik testi ekrana değil, önce `HEAD` isteğiyle sunucuya
bakıyor: 404 görmek, "görünmüyor" demekten daha güçlü bir kanıt.

**Gizli klasörün adını günlüğe yazmak her şeyi boşa çıkarır.** Derleme
günlüğü GitHub Actions özetine düşüyor ve depo herkese açık. Klasör adını
tek satır loglamak, anahtarı ilan etmekle aynı şeydi. Mekanizmayı kurarken
"bu bilgi nereye akıyor?" sorusunu her çıktı için ayrı sormak gerekti:
günlük, Actions özeti, `ozet.json`, `ayar_ham`, adres çubuğu.

**Tarayıcı profili testler arasında sızıyor.** Yönetici anahtarı
localStorage'da saklandığı için, bir suite'ten sonra çalışan diğeri
"ziyaretçi" sanıp yönetici modunda test ediyordu — 8 denetim sahte biçimde
başarısızdı, sonra sahte biçimde başarılı olurdu. Çözüm:
`Page.addScriptToEvaluateOnNewDocument` ile sayfanın kendi kodundan önce
`localStorage.clear()`. Ders: bir suite'in sonucu, ondan önce ne
çalıştığına bağlı olmamalı; bunu üç kez üst üste koşarak doğrulamak lazım.

**Suite'lerin rolünü ayırmak gerekti.** `site_testi` tüm özellikleri
denetliyor, bu yüzden artık siteyi anahtarla açıyor; "ziyaretçi ne
göremiyor" sorusu ayrı bir suite'in işi. İkisini tek dosyada tutmak her
denetime "hangi moddayız?" sorusunu bulaştırıyordu.
