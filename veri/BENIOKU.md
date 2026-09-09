# Bu klasör: verinin girildiği yer

Haritayı güncellemek için **sadece bu klasördeki dosyalarla** ilgilenmeniz yeterli.

## Yeni yol verisi yükleme (en sık yapacağınız iş)

1. QGIS → katmana sağ tık → **Dışa Aktar → Özellikleri Farklı Kaydet…**
   → Biçim: **KML**, KRS: **EPSG:4326**, dosya adı: **`ibb_yollar.kml`**
2. Burada, bu sayfanın üstündeki **Add file → Upload files** düğmesine basın.
3. `ibb_yollar.kml` dosyasını sürükleyin → **Commit changes**.

Site 2–3 dakika içinde kendiliğinden güncellenir.

## Dosyalar

| Dosya | Ne işe yarar |
|-------|--------------|
| `ibb_yollar.kml` | QGIS'ten çıkan yol katmanı. **Üzerine yazın.** |
| `kategoriler.json` | Kategori adları, renkleri, sırası, ilçe sınır çizgisinin görünümü ve site başlıkları. |
| `ilce_sinirlari.geojson` | *(isteğe bağlı)* Eklerseniz haritaya ilçe sınırları, adları ve ilçe filtresi gelir. Projeksiyonu ve ilçe adı alanı otomatik algılanır. |

> Dosyaları **yalnızca bu klasöre** koyun. Depo kökündeki veya başka klasörlerdeki
> kopyalar okunmaz.

Ayrıntılar için deponun ana sayfasındaki [README](../README.md) dosyasına bakın.
