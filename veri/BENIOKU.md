# Bu klasör: verinin girildiği yer

Haritayı güncellemek için **sadece bu klasördeki dosyalarla** ilgilenmeniz yeterli.

## Yeni yol verisi yükleme (en sık yapacağınız iş)

1. QGIS → katmana sağ tık → **Dışa Aktar → Özellikleri Farklı Kaydet…**
   → Biçim: **KML**, KRS: **EPSG:4326**, dosya adı: **`ibb_yollar.kml`**
2. Burada, bu sayfanın üstündeki **Add file → Upload files** düğmesine basın.
3. `ibb_yollar.kml` dosyasını sürükleyin → **Commit changes**.

> **Dosyanız 25 MB'ı geçiyorsa** GitHub web arayüzü kabul etmez. Dosyaya sağ
> tıklayıp sıkıştırın (`.zip`) ve onu yükleyin — bu tür KML'ler %15'ine iner.
> Sonra eski dosyayı silmeyi unutmayın; klasörde tek yol dosyası kalmalı.
> Kabul edilen biçimler: `.kml`, `.kmz`, `.zip`, `.geojson`, `.json`, `.gz`

Site 2–3 dakika içinde kendiliğinden güncellenir.

## Dosyalar

| Dosya | Ne işe yarar |
|-------|--------------|
| `ibb_yollar.kml` | QGIS'ten çıkan yol katmanı. **Üzerine yazın.** Dosya 25 MB'ı geçiyorsa sıkıştırıp `ibb_yollar.zip` olarak yükleyin ve eskisini silin. |
| `kategoriler.json` | Kategori adları, renkleri, sırası, ilçe sınır çizgisinin görünümü ve site başlıkları. |
| `ilce_sinirlari.geojson` | *(isteğe bağlı)* Eklerseniz haritaya ilçe sınırları, adları ve ilçe filtresi gelir. |
| `mahalle_sinirlari.geojson` | *(isteğe bağlı)* Aynısının mahalle karşılığı. Mahalle sınırları z11, adları z12 yakınlıktan itibaren çizilir. |

Her iki sınır dosyasının da **projeksiyonu ve ad alanı otomatik algılanır**;
EPSG:4326'ya çevirmeniz veya alan adlarını düzeltmeniz gerekmez.

> Dosyaları **yalnızca bu klasöre** koyun. Depo kökündeki veya başka klasörlerdeki
> kopyalar okunmaz.

Ayrıntılar için deponun ana sayfasındaki [README](../README.md) dosyasına bakın.
