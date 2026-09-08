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
6. [Kategori adı ve rengini site üzerinden değiştirme](#6-kategori-adı-ve-rengini-site-üzerinden-değiştirme)
7. [Depoyu müdürlük hesabına taşımak](#7-depoyu-müdürlük-hesabına-taşımak)
8. [Sitede neler var](#8-sitede-neler-var)
9. [Klasör yapısı](#9-klasör-yapısı)
10. [Sorun giderme](#10-sorun-giderme)
11. [Teknik notlar](#11-teknik-notlar)

---

## 1. Tek seferlik kurulum (sadece bir kez)

Siteyi yayına almak için **bir kez** şu 4 adımı yapmanız gerekiyor. (GitHub, güvenlik
gereği Pages'i açma yetkisini yalnızca depo sahibine verir; bu yüzden bu adımı otomatik
yapamıyoruz.)

1. Deponun üstündeki **Settings** (Ayarlar) sekmesine girin.
2. Sol menüden **Pages**'e tıklayın.
3. **Build and deployment → Source** kutusundan **GitHub Actions**'ı seçin.
4. **Actions** sekmesine gidin → en üstteki çalışmayı açın → sağ üstten
   **Re-run all jobs**.

2–3 dakika sonra site yayında olur:

`https://orbayskrcl.github.io/ulasim-planlama-yollar/`

Bundan sonra bu adımı bir daha yapmanız gerekmez; her veri yüklemesinde site
kendiliğinden yenilenir.

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

## 4. Kategori adı, renk ve başlıkları değiştirme (dosyadan)

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

💡 Bu dosyayı elle düzenlemek istemiyorsanız, [6. bölümdeki](#6-kategori-adı-ve-rengini-site-üzerinden-değiştirme)
site üzerinden düzenleme yolunu kullanın — hazır JSON'u sizin için üretir.

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

## 6. Kategori adı ve rengini site üzerinden değiştirme

Dosya düzenlemeden, doğrudan harita üzerinden de değiştirebilirsiniz:

1. Sol paneldeki kategorinin sağındaki **✎** simgesine tıklayın.
2. **Görünen ad** kutusuna yeni adı yazın ve/veya **Çizgi rengi**'ni seçin
   (hazır renklerden birine tıklayabilir ya da renk kutusundan istediğinizi seçebilirsiniz).
3. Değişiklik haritaya **anında** yansır.

Bu aşamada değişiklik yalnızca **sizin tarayıcınızda** saklıdır — siteyi açan başkaları
eski hâlini görür. Herkes için geçerli yapmak isterseniz:

4. Kategoriler listesinin altında beliren **Herkes için kalıcı yap** düğmesine basın.
5. Açılan pencerede **📋 Panoya kopyala** deyin.
6. **kategoriler.json dosyasını GitHub'da aç** bağlantısına tıklayın.
7. Açılan sayfada eski içeriğin tamamını silip kopyaladığınızı yapıştırın →
   **Commit changes**.

2–3 dakika içinde site herkes için güncellenir. Vazgeçerseniz **Tümünü sıfırla**
düğmesi tarayıcınızdaki değişiklikleri geri alır.

> Renk seçerken çok koyu bir ton seçerseniz, site koyu altlık haritalarda
> (Koyu / Uydu) o rengi otomatik olarak açar; yollar görünmez kalmaz.

---

## 7. Depoyu müdürlük hesabına taşımak

Çalışmayı kişisel hesap yerine kurum adına bir hesapta tutmak isterseniz bu tamamen
mümkün ve **kodda hiçbir değişiklik gerektirmiyor** — sitedeki tüm bağlantılar görecelidir,
"GitHub'da düzenle" bağlantısı da her derlemede kendini yeni adrese göre günceller.

### Önce adres kuralını bilelim

GitHub Pages adresi şu kalıptadır:

```
https://<HESAP-ADI>.github.io/<DEPO-ADI>/
```

Tek istisna: depo adı tam olarak `<HESAP-ADI>.github.io` ise adres kısalır:

```
https://<HESAP-ADI>.github.io/
```

Yani:

| Hesap adı | Depo adı | Sitenin adresi |
|-----------|----------|----------------|
| `ulasim-planlama` | `ulasim-planlama-yollar` | `https://ulasim-planlama.github.io/ulasim-planlama-yollar/` |
| `ulasim-planlama` | **`ulasim-planlama.github.io`** | **`https://ulasim-planlama.github.io/`** ← en kısası |
| `ulasim-planlama-yollar` | `ulasim-planlama-yollar.github.io` | `https://ulasim-planlama-yollar.github.io/` |

Sizin tahmin ettiğiniz `ulasim-planlama-yollar.github.io` adresi için **hesap adının**
`ulasim-planlama-yollar` olması gerekir. Kurum için `ulasim-planlama` hesap adı + depo adı
`ulasim-planlama.github.io` kombinasyonu daha derli toplu olur.

### Hangi hesap türü?

- **Kuruluş (Organization) — önerilen.** Ücretsizdir, kurumsaldır, birden fazla kişi
  yönetici olabilir ve siz görevden ayrılsanız bile depo müdürlükte kalır.
  Kendi hesabınızdan **+ → New organization → Free** ile oluşturursunuz;
  sonra iş arkadaşlarınızı **Owner** olarak eklersiniz.
- **Yeni bir kişisel hesap.** Daha basit ama tek kişiye bağlıdır ve GitHub, aynı kişinin
  birden fazla kişisel hesabını yalnızca ayrı e-posta adresleriyle kabul eder.

### Taşıma adımları (geçmiş kaybolmaz)

1. Yeni hesabı veya kuruluşu açın (ör. `ulasim-planlama`).
2. **Bu depoda:** Settings → en altta **Danger Zone** → **Transfer** →
   yeni sahibin adını yazın → onaylayın.
   (Kişisel hesaba taşıyorsanız karşı taraf e-postadan daveti kabul eder.)
3. Kısa adres isterseniz: yeni sahipte Settings → General → **Repository name** →
   `ulasim-planlama.github.io` yapıp **Rename** deyin.
4. **Pages'i yeniden açın:** Settings → Pages → Source: **GitHub Actions**.
   (Pages ayarı taşımayla birlikte gelmez.)
5. Actions sekmesinden son çalışmayı **Re-run all jobs** ile tetikleyin.

Eski adres bir süre yeni adrese yönlendirilir; yine de paylaştığınız bağlantıları
güncellemeniz iyi olur.

> Taşımadan sonra bu README'deki örnek adresler eski hesabı gösterir; isterseniz
> README'nin ilk satırındaki adresi de düzeltebilirsiniz. Sitenin çalışması buna bağlı değildir.

---

## 8. Sitede neler var

- **4 altlık harita:** Sokak, Sade, Koyu (üçü de OpenStreetMap'ten), Uydu (Esri) —
  hiçbiri üyelik/anahtar gerektirmez
- **Kategori aç/kapat** — her kategorinin yol sayısı ve toplam kilometresiyle
- **Yol tipi filtresi** (Cadde, Sokak, Bulvar, Küme Evler, Otoyol, Meydan)
- **Yol adı arama** — Türkçe karaktere duyarsız (`sarikoy` yazınca `SARIKÖY` bulunur)
- **Yola tıklayınca** ad, tip, kategori, uzunluk, kayıt no, koordinat; koordinatı kopyalama
  ve Google Maps'te açma; fareyle üzerine gelince yol vurgulanır
- **📏 Mesafe ölçme:** haritada çok noktalı, canlı toplamlı mesafe ölçümü
- **Kategori düzenleme:** kategori adını ve çizgi rengini site üzerinden değiştirme
- **Anlık istatistik** — seçili filtreye uyan toplam kilometre ve farklı yol adı sayısı
- **Paylaşılabilir bağlantı** — harita konumu ve filtreler bağlantıya işlenir
- **Veri indirme** — GeoJSON (QGIS/ArcGIS/Google Earth) ve orijinal KML
- **Konumum** düğmesi — sahada kendi konumunuzu haritada görmek için
- **Açık / koyu tema**, mobil uyumlu arayüz
- **Veri kalitesi uyarıları** — geometrisi boş, adı boş veya DURUM'u boş kayıtları
  kayıt numarasıyla listeler; QGIS'te düzeltmeniz için yol gösterir
- Kısayollar: `/` arama kutusuna gider, `Esc` seçimi temizler, `Alt + tıklama`
  tıkladığınız noktanın koordinatını kopyalar

---

## 9. Klasör yapısı

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

## 10. Sorun giderme

| Belirti | Sebep / çözüm |
|--------|----------------|
| Site "Veri yüklenemedi" diyor | Derleme henüz bitmemiş olabilir. **Actions** sekmesinden son çalışmayı kontrol edin. |
| Actions'ta kırmızı ✗ var | Çalışmaya tıklayın; **Derleme özeti** bölümünde Türkçe hata mesajı yazar (çoğunlukla bozuk JSON veya eksik KML). Site bu sırada eski hâliyle yayında kalır. |
| Yeni yollar haritada yok | KML'i `veri` klasörüne yüklediğinizden ve **Commit changes**'e bastığınızdan emin olun. Tarayıcıda `Ctrl+F5` ile sayfayı yenileyin. |
| Bir kategori hiç görünmüyor | Sol paneldeki kutucuğu işaretleyin; ya da o `DURUM` değeri KML'de hiç yoksa kategori listelenmez. |
| "Tanımsız durum kodu" uyarısı | KML'de `veri/kategoriler.json`'da tanımlı olmayan bir `DURUM` var. 4. bölümdeki gibi ekleyin. |
| Renkler QGIS'tekiyle aynı değil | Renkler `kategoriler.json`'dan gelir. Oradaki `renk` değerini `null` yaparsanız KML'deki renk kullanılır. |
| Site adresi 404 veriyor | Yayın henüz tamamlanmamış olabilir; **Actions** sekmesinden son çalışmayı kontrol edin. Sürekli 404 ise 1. bölümdeki elle açma adımlarını uygulayın. |

---

## 11. Teknik notlar

- **Bağımlılık yok.** Derleme yalnızca Python 3 standart kütüphanesiyle çalışır;
  site saf HTML/CSS/JavaScript'tir, Leaflet 1.9.4 depo içinde yerel olarak sunulur.
  Yani site, dış bir kütüphane sunucusu çökse bile açılır.
- **Veri boyutu.** 6.600 yol parçası ≈ 2,1 MB GeoJSON; sunucu sıkıştırmasıyla
  tarayıcıya ≈ 0,4 MB iner. Koordinatlar 6 haneye yuvarlanır (≈ 11 cm hassasiyet).
- **Uzunluklar** WGS84 üzerinde haversine formülüyle hesaplanır; eğim dikkate alınmaz.
  Sağ alttaki ölçek çubuğu ve mesafe ölçme aracı da aynı yöntemi kullanır
  (doğrulama: 1 km'lik çubuk için sapma %0,2).
- **Çizim.** Her kategori tek bir birleşik çizgi nesnesiyle, Leaflet'in canvas çizicisiyle
  çizilir ve **yalnızca ekranda görünen** yollar Leaflet'e verilir. Ölçülen etki: tek bir
  zoom adımı z13'te 140 ms'den 6 ms'ye, z15'te 90 ms'den 5 ms'ye indi. Hangi yola
  tıklandığı, mekânsal ızgara indeksiyle yapılan "en yakın çizgi" testiyle bulunur.
- **Altlık haritalar.** Sade ve Koyu görünümler, ayrı bir servis yerine OpenStreetMap
  karolarına uygulanan CSS filtresiyle üretilir; böylece API anahtarı isteyen sağlayıcılara
  (CARTO gibi) bağımlılık yoktur.
- **Yol renkleri arayüz temasına değil, altlık haritanın koyuluğuna göre** seçilir;
  çok koyu renkler koyu altlıklarda otomatik açılır.
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
