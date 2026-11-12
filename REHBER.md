# Düzeltme Rehberi

Bir şeyi değiştirmek istediğinizde **hangi dosyaya dokunacağınızı** bulmak için.

---

## Önce şunu bilin: dört dosya, dört ayrı iş

| Dosya | İçinde ne var | Nerede düzenlenir |
|---|---|---|
| **`veri/yollar_master.zip`** | Yolların kendisi: çizgiler ve her yolun durumu | **QGIS** |
| **`veri/genis_yollar.xlsx`** | Geniş yollar listesi (17 m+) — **onaylanırsa** geçecekler | **Excel** |
| **`veri/ek1_listesi.txt`** | EK-1 listesi — Meclis kararıyla **zaten geçmiş** olanlar | **GitHub'da doğrudan** |
| **`veri/genis_yollar_duzeltme.txt`** | Liste ile harita arasındaki eşleştirme düzeltmeleri | **GitHub'da doğrudan** |

Bu dördü **birbirini değiştirmez.** Düzeltme dosyasına yazdığınız hiçbir şey
Excel'i, Excel'de yaptığınız hiçbir şey ana katmanı değiştirmez.

> **İki geniş yol listesi var, karıştırmayın.** Haritada turuncu olanlar EK-1
> (Meclis kararıyla alınmış, zaten bizde), mavi olanlar Excel listesi
> (onaylanırsa geçecek). Bir yol ikisinde de varsa turuncu çizilir.

---

## Ne yapmak istiyorsunuz?

| Durum | Hangi dosya | Nasıl |
|---|---|---|
| Bir yolun **sorumluluğu değişti** (devredildi, Karayolları'na geçti…) | ana katman | [1](#1-bir-yolun-durumunu-değiştirmek) |
| Haritada **yanlış bir çizgi** var (aynı adlı başka yol) | duzeltme.txt | [2](#2-haritadaki-yanlış-çizgiyi-çıkarmak) |
| Listedeki bir yol **haritada hiç çıkmıyor** | duruma göre | [3](#3-listedeki-yol-haritada-çıkmıyorsa) |
| Bir yol **artık listede olmamalı** | Excel | [4](#4-bir-yolu-listeden-çıkarmak) |
| Listeye **yeni yol eklemek** istiyorum | Excel | [5](#5-listeye-yeni-yol-eklemek) |
| **EK-1 listesine** yol eklemek / çıkarmak | ek1_listesi.txt | [6](#6-ek-1-listesini-düzenlemek) |
| **Yönetici modu** — indirme, uyarılar, ayrıntılar | site | [7](#7-yönetici-modu-sadece-siz) |
| **Yanlışlıkla** bir şey bozdum | — | [8](#8-geri-almak) |

---

## 1. Bir yolun durumunu değiştirmek

> Örnek: Bir köy yolu Karayolları'na geçti.

1. GitHub'da `veri/yollar_master.zip` → **Download** → sağ tık → **Tümünü ayıkla**.
2. Çıkan `yollar_master.gpkg` dosyasını QGIS penceresine sürükleyin.
   Renkler ve **Durum** açılır listesi hazır gelir.
3. Yolları seçin. Toplu seçmenin kolay yolu: öznitelik tablosunun altındaki
   süzgece `"ilce" = 'Bergama' AND "durum" = '5'` yazın.
4. **Ctrl+E** ile düzenlemeyi açın → **Çoklu Düzenleme** → **Durum**
   listesinden yeni durumu seçin. Hepsi tek hamlede değişir.
5. İsterseniz **Not** alanına karar numarası yazın.
6. **Ctrl+S** → düzenlemeyi kapatın.
7. `.gpkg` dosyasına sağ tık → **Gönder → Sıkıştırılmış (zip) klasör**.
8. GitHub'da `veri` klasörü → **Add file → Upload files** → **Commit changes**.

✅ Sonuç: 2–3 dakikada site yenilenir. **Actions** sekmesinde
"şu kadar yol A'dan B'ye geçti" dökümünü görürsünüz.

> ⚠️ **Siteden indirdiğiniz `yollar.gpkg`'yi düzenlemeyin.** O, paylaşmak için
> üretilen kopyadır. Doğru dosyada olduğunuzu anlamak için: QGIS'te renkler
> kendiliğinden geliyorsa ve **Not** sütunu varsa doğru dosyadasınız.

---

## 2. Haritadaki yanlış çizgiyi çıkarmak

> Örnek: Torbalı'da "502 SOKAK" hem OSB'de hem Kırbaş'ta var. Liste OSB'yi
> kastediyor ama harita ikisini de gösteriyor.

Bu, yolu listeden çıkarmaz — sadece **haritada hangi çizginin gösterileceğini**
düzeltir.

1. Haritada **yanlış** olan çizgiye tıklayın.
2. Bilgi kartındaki **"Bu yolu listeden çıkar"** düğmesine basın.
   Panoya şuna benzer bir satır kopyalanır:
   ```
   Torbalı ; 502 SOKAK ; hariç: Kırbaş
   ```
3. GitHub'da `veri/genis_yollar_duzeltme.txt` dosyasını açın →
   sağ üstteki **kalem** simgesine tıklayın.
4. Satırı **en alta yapıştırın** → **Commit changes**.

✅ Sonuç: O çizgi haritadan çıkar. Excel'deki satır yerinde kalır ve mavi kalır.

**Üç yazım biçimi var:**

| Yazım | Ne yapar |
|---|---|
| `Torbalı ; 502 SOKAK ; yalnız: Torbalı Organize Sanayi Bölgesi` | **Yalnızca** o mahalledekiler kalır |
| `Torbalı ; 502 SOKAK ; hariç: Kırbaş` | O mahalledekiler çıkar, gerisi kalır |
| `çıkar: 53089` | Tek bir kaydı çıkarır (kayıt no bilgi kartında yazar) |

> `yalnız:` daha sağlamdır: ileride aynı adlı üçüncü bir yol daha eşleşirse
> o da kendiliğinden dışarıda kalır.

---

## 3. Listedeki yol haritada çıkmıyorsa

Önce sebebini bulun. Site size söylüyor: **Veri kalitesi uyarıları** bölümünde
eşleşmeyen satırlar listelenir ve ağda benzer bir ad varsa **önerir**.

| Sebep | Çözüm |
|---|---|
| Ağda **aynı yol var ama adı farklı yazılmış** | duzeltme.txt'ye `eşle:` satırı |
| Ağda **o yol hiç yok** (çizgisi çizilmemiş) | Önce QGIS'te çizin ([1](#1-bir-yolun-durumunu-değiştirmek)) |
| Excel'de **ad yanlış yazılmış** | Excel'i düzeltip yükleyin |

**Adı farklı yazılmışsa:**

```
Aliağa ; NENE HATUN CADDESİ ; eşle: NENEHATUN
```

Solda Excel'deki ad, sağda ağdaki ad. Excel'e dokunmanız gerekmez.

> Sitedeki uyarı şöyle der: *"Şunlar için ağda çok benzer bir ad var —
> Aliağa: NENE HATUN CADDESİ → NENEHATUN"*. Yani ne yazacağınızı size söyler.

---

## 4. Bir yolu listeden çıkarmak

> Örnek: Yol Karayolları'na geçti, artık geniş yollar listesinde olmamalı.

Bu gerçek bir karar değişikliğidir, **Excel'de** yapılır:

1. `veri/genis_yollar.xlsx` dosyasını indirip açın.
2. O satırın **rengini kırmızı yapın** (ya da dolguyu tamamen kaldırın).
3. Aynı adla GitHub'a yükleyin.

✅ Sonuç: Yol haritadan çıkar. Satır listede kalır, yani geçmişi kaybetmezsiniz.

> Satırı tamamen silmek de olur ama rengini değiştirmek daha iyidir:
> o yolun bir zamanlar listede olduğu kayıtlı kalır.

---

## 5. Listeye yeni yol eklemek

1. Excel'e satırı ekleyin: **A sütununa yol adı**, **B sütununa genişlik**.
   Satırı doğru ilçe başlığının altına koyun.
2. Satırı **mavi boyayın** (açık ya da koyu).
3. Aynı adla GitHub'a yükleyin.

> ⚠️ Yolun **ağda çizgisi yoksa** bu yetmez — satır "eşleşmedi" listesine düşer.
> Önce QGIS'te yolu çizmeniz gerekir.

---

## 6. EK-1 listesini düzenlemek

> EK-1, Meclis kararıyla Büyükşehir'e alınmış yolların listesidir
> (10.03.2021 / 05.251). Haritada **turuncu** çizilir.

Bu bir metin dosyasıdır, doğrudan GitHub'da düzenlenir — Excel gerekmez.

1. GitHub'da `veri/ek1_listesi.txt` dosyasını açın →
   sağ üstteki **kalem** simgesine tıklayın.
2. Satırlar şu biçimdedir:
   ```
   Konak ; ŞEHİT FETHİ BEY CADDESİ ; 20
   ```
   İlçe ; yol adı ; (varsa) imar genişliği. Genişlik yalnızca bilgi içindir.
3. **Commit changes**.

| İstediğiniz | Nasıl |
|---|---|
| Yeni yol eklemek | İlgili ilçenin altına bir satır yazın |
| Yolu listeden çıkarmak | Satırın başına `#` koyun — satır kalır, haritaya girmez |
| Yazımı düzeltmek | Satırı düzeltin |
| Haritada yanlış çizgi çıkıyor | [2. bölüm](#2-haritadaki-yanlış-çizgiyi-çıkarmak) — düzeltme kuralları bu listeye de işler |

✅ Sonuç: 2–3 dakikada site yenilenir.

> **Meydanlar.** Listede `... MEYDANI` satırları da var. Meydanların haritada
> çizgisi olmadığı için bunlar eşleştirmeye girmez; listede dururlar ama
> haritada görünmezler. Bu bir hata değildir.

---

## 6b. Haritada yol bulmak

**Arama kutusuna yol adını yazın.** Her sonuçta adın altında **ilçe ve yol
tipi** yazar:

```
ABDİ İPEKÇİ
Bornova · Cadde                     2,8 km
```

Aynı ad birden çok ilçede geçiyorsa (sayılı sokaklarda çok olur) **her ilçe
ayrı bir satırdır.** İstediğiniz ilçeye tıklayın, harita tam oraya gider ve
yolun adı haritada pembe yazıyla kalır.

**Fareyle bir yolun üstüne gelin:** tıklamadan adı, tipi, mahallesi ve ilçesi
imlecin yanında çıkar.

**Bütün yolların adını haritada görmek isterseniz** Kategoriler bölümünün
altındaki *"Yol adlarını haritaya yaz"* kutusunu işaretleyin. Adlar yalnızca
yakınlaştırdığınızda (z16) yazılır — daha uzaktan harita okunmaz hâle
geliyor. Varsayılan kapalıdır; altlık harita zaten sokak adlarını yazar.

---

## 7. Yönetici modu (sadece siz)

Site herkese açıktır ama **veri indirilemez** ve çalışmanın iç detayları
görünmez. Bunlar yalnızca size açılır.

### Nasıl açılır

Sitenin adresinin sonuna anahtarınızı ekleyin:

```
https://orbayskrcl.github.io/ulasim-planlama-yollar/?y=ANAHTARINIZ
```

Bir kez açtığınızda tarayıcınız hatırlar; bir daha yazmanız gerekmez.
Sağ üstte **🔑 Yönetici** rozeti görünür. Çıkmak için rozete tıklayın.

> Anahtar adres çubuğundan hemen silinir — ekran paylaşırken görünmez.

### Yönetici modunda ne açılır

| | Ziyaretçi | Siz |
|---|---|---|
| Harita, yollar, lejant, arama, ölçüm | ✅ | ✅ |
| **Veriyi indir** menüsü (GeoPackage, GeoJSON) | ❌ | ✅ |
| Liste durumu raporu (CSV) | ❌ | ✅ |
| Veri kalitesi uyarıları | ❌ | ✅ |
| Son değişiklikler | ❌ | ✅ |
| Kaynak dosya adı, depo bağlantıları | ❌ | ✅ |
| **?** yardım penceresi (kategori açıklamaları, QGIS → GitHub adımları) | ❌ | ✅ |
| Kategori açıklamaları | ❌ | ✅ |

### Anahtarı belirlemek / değiştirmek

Anahtar **depoda durmaz.** GitHub'da:

1. Depo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `YONETICI_ANAHTARI` — Secret: seçtiğiniz anahtar
4. **Add secret**, sonra herhangi bir dosyayı yeniden yükleyin (site yeniden
   derlensin diye).

Anahtarı değiştirmek için aynı yerden düzenleyip yeniden derleyin. Eski
anahtar o an geçersiz olur.

> **Anahtar tanımlı değilse** indirme dosyaları hiç üretilmez. Yani
> "kimse indiremez" varsayılan durumdur; anahtar sizin için bir kapı açar.

### Açılmıyorsa

Anahtarla girdiğinizde ekranın altında kısa bir mesaj çıkar:

| Mesaj | Anlamı | Ne yapmalı |
|---|---|---|
| *Yönetici anahtarı geçersiz* | Site bir anahtarla derlenmiş ama yazdığınız o değil | Gizli değişkendeki değeri birebir kopyalayın |
| *Site bu anahtarla derlenmemiş…* | Derleme anahtarı görmemiş | Gizli değişkeni tanımlayıp **bir dosyayı yeniden yükleyerek** siteyi tekrar derletin |
| Hiç mesaj yok, rozet de yok | Sayfa eski sürümden önbellekte kalmış olabilir | **Ctrl+F5** ile sayfayı zorla yenileyin |

Adresin tam olarak şu biçimde olması gerekir — sondaki `/` dahil:

```
https://orbayskrcl.github.io/ulasim-planlama-yollar/?y=ANAHTAR
```

Sondaki eğik çizgiyi unutursanız GitHub adresi yönlendirir ve `?y=...`
kısmı kaybolabilir. Bundan etkilenmeyen ikinci biçim:

```
https://orbayskrcl.github.io/ulasim-planlama-yollar#y=ANAHTAR
```

İkisi de aynı işi yapar; ikincisi her durumda çalışır.

### Bu ne kadar güvenli?

Dürüst cevap: **iyi ama mükemmel değil.**

- İndirme dosyaları, adı anahtardan hesaplanan bir klasöre yazılır. GitHub
  Pages klasör listesi vermediği için adres tahmin edilemez. Anahtarı
  bilmeyen bu dosyalara ulaşamaz — ekranda gizlenmiş değil, **gerçekten
  erişilemez** durumdadırlar.
- Aynı şey iç detaylar için de geçerli: ziyaretçinin tarayıcısına o bilgiler
  hiç inmez.
- **Ama** haritayı çizmek için yol çizgileri herkese açık olmak zorunda.
  Teknik bilen biri bu çizgileri tarayıcıdan toplayabilir. Bunu engellemenin
  tek yolu siteyi tamamen kapatmaktır.
- **Ve** depo şu an herkese açık: `veri/` klasöründeki ana katman, Excel ve
  EK-1 listesi github.com üzerinden indirilebilir. Bunu kapatmak için depoyu
  private yapmanız gerekir (GitHub Pro olmadan site kapanır).

---

## 8. Geri almak

Her yükleme bir sürümdür, hiçbir şey kaybolmaz.

| İstediğiniz | Nasıl |
|---|---|
| Son güncellemeyi tamamen geri al | Depoda **Commits** → ilgili satır → **⋯ → Revert** |
| Eski bir dosyayı geri getir | Dosyaya tıkla → **History** → tarih seç → **Download** → aynı adla yükle |
| Yanlış dosyayı (yayın kopyasını) düzenledim | `python3 araclar/ana_katman.py --zip` çalıştırın; düzenlemelerinize dokunmadan onarır |

---

## Nasıl kontrol ederim?

Her yüklemeden sonra:

- **Actions** sekmesindeki özet: ne değişti, kaç yol, kaç km.
- Sitede **Son değişiklikler** bölümü: hangi yol hangi duruma geçti.
- Geniş yollar bölümünde **Listede değişenler**: eklenen / çıkarılan satırlar.
- **⬇︎ Listenin güncel durumunu indir (CSV)**: her liste satırının haritada ne
  olduğunu gösteren tablo. Türkçe Excel çift tıklamayla açar.

Beklediğinizden farklı bir sayı görürseniz yanlış dosya yüklenmiş demektir —
[8. bölümden](#8-geri-almak) geri alabilirsiniz.

---

## Sık karışan iki şey

**1. Düzeltme dosyası Excel'i değiştirmez.**
`duzeltme.txt`'ye yazdığınız kural Excel'deki satırın rengini değiştirmez.
Excel yüklediğiniz hâliyle durur. Kural yalnızca haritayı çizerken uygulanır.

**2. "Listeden çıkarmak" iki ayrı şey olabilir.**

| Demek istediğiniz | Nereye |
|---|---|
| "Yol listede kalsın, ama haritada **yanlış çizgi** gösteriliyor" | duzeltme.txt |
| "Yol **artık listede olmasın**" | Excel (rengi değiştir) ya da EK-1 (satırı `#`le) |

**3. Hangi listedeki yolu değiştiriyorsunuz?**

Haritada yola tıklayın: bilgi kartının üstünde hangi listede olduğu yazar.
Turuncuysa `ek1_listesi.txt`, maviyse `genis_yollar.xlsx`.

---

Ayrıntılar için [README](README.md) — bu rehber günlük işler içindir.
