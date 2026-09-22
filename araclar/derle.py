#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
İzmir Köy Yolları Devir Haritası — site derleyicisi.

Ne yapar?
  1. veri/ klasöründeki KML dosyasını okur (QGIS'ten dışa aktarılan katman).
  2. Her yolu GeoJSON'a çevirir, uzunluğunu hesaplar, kategorisini belirler.
  3. veri/kategoriler.json'daki isim/renk ayarlarını uygular.
  4. (Varsa) veri/ilce_sinirlari.geojson ile her yola ilçe adı ekler.
  5. site/ klasörünü + üretilen verileri _site/ klasörüne yazar (yayına hazır site).

Kullanım:
  python3 araclar/derle.py                # varsayılan
  python3 araclar/derle.py --kml veri/x.kml --cikti _site

Harici kütüphane gerekmez (sadece Python 3 standart kütüphanesi).
"""

import argparse
import json
import math
import os
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

KOK = Path(__file__).resolve().parent.parent
TR_SAAT = timezone(timedelta(hours=3))  # Türkiye saati

# Bilinmeyen kategoriler için sırayla kullanılacak yedek renkler
YEDEK_RENKLER = ["#0891b2", "#ea580c", "#65a30d", "#c026d3", "#0f766e", "#b45309"]


def depo_bilgisi():
    """Sitedeki 'GitHub'da düzenle' bağlantısı için sahip/depo/dal bilgisi."""
    sahip = depo = dal = None
    tam = os.environ.get("GITHUB_REPOSITORY")          # GitHub Actions içinde
    if tam and "/" in tam:
        sahip, depo = tam.split("/", 1)
        dal = os.environ.get("GITHUB_REF_NAME")
    if not sahip:                                       # yerelde: git uzak adresi
        try:
            import subprocess
            url = subprocess.check_output(
                ["git", "-C", str(KOK), "remote", "get-url", "origin"],
                stderr=subprocess.DEVNULL).decode().strip()
            m = re.search(r"github\.com[:/]+([^/]+)/(.+?)(?:\.git)?$", url)
            if m:
                sahip, depo = m.group(1), m.group(2)
            dal = subprocess.check_output(
                ["git", "-C", str(KOK), "rev-parse", "--abbrev-ref", "HEAD"],
                stderr=subprocess.DEVNULL).decode().strip()
        except Exception:
            pass
    return {"sahip": sahip or "", "depo": depo or "", "dal": dal or "main"}


def log(msg):
    print(msg, flush=True)


def hata(msg):
    print("\nHATA: " + msg + "\n", file=sys.stderr, flush=True)
    sys.exit(1)


# --------------------------------------------------------------------------
# Yardımcılar
# --------------------------------------------------------------------------

def etiket(el):
    """XML etiketinden ad alanını (namespace) temizler."""
    return el.tag.split("}")[-1] if "}" in el.tag else el.tag


def kml_rengi_hex(deger):
    """KML rengi 'aabbggrr' formatındadır -> '#rrggbb' döndürür."""
    if not deger:
        return None
    d = deger.strip().lstrip("#")
    if len(d) == 8:
        bb, gg, rr = d[2:4], d[4:6], d[6:8]
    elif len(d) == 6:
        bb, gg, rr = d[0:2], d[2:4], d[4:6]
    else:
        return None
    try:
        int(d, 16)
    except ValueError:
        return None
    return ("#" + rr + gg + bb).lower()


def haversine(lon1, lat1, lon2, lat2):
    """İki nokta arası mesafe (metre)."""
    R = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def cizgi_uzunlugu(coords):
    t = 0.0
    for i in range(1, len(coords)):
        t += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
    return t


def koordinat_ayikla(metin, ondalik=6):
    """KML <coordinates> metnini [[lon,lat], ...] listesine çevirir."""
    noktalar = []
    for parca in metin.replace("\n", " ").replace("\t", " ").split():
        bolum = parca.split(",")
        if len(bolum) < 2:
            continue
        try:
            lon = round(float(bolum[0]), ondalik)
            lat = round(float(bolum[1]), ondalik)
        except ValueError:
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            continue
        if noktalar and noktalar[-1] == [lon, lat]:
            continue  # arka arkaya tekrar eden noktayı at
        noktalar.append([lon, lat])
    return noktalar


def normalize(s):
    """Arama için: Türkçe karakterleri sadeleştirir, büyük/küçük farkını kaldırır."""
    if not s:
        return ""
    s = s.replace("İ", "i").replace("I", "i").replace("ı", "i")
    s = s.replace("Ş", "s").replace("ş", "s").replace("Ğ", "g").replace("ğ", "g")
    s = s.replace("Ü", "u").replace("ü", "u").replace("Ö", "o").replace("ö", "o")
    s = s.replace("Ç", "c").replace("ç", "c")
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


# --------------------------------------------------------------------------
# Kaynak dosyayı açma (düz, sıkıştırılmış ya da GeoJSON)
# --------------------------------------------------------------------------

YOL_UZANTILARI = (".kml", ".kmz", ".zip", ".geojson", ".json", ".gz")


def _zipten_sec(zf):
    """Zip/KMZ içinden okunacak veri dosyasını seçer."""
    adlar = [n for n in zf.namelist()
             if not n.endswith("/") and not n.startswith("__MACOSX")]
    oncelik = [".kml", ".geojson", ".json"]
    for uzanti in oncelik:
        esleme = [n for n in adlar if n.lower().endswith(uzanti)]
        if esleme:
            return sorted(esleme, key=len)[0]
    return adlar[0] if adlar else None


def kaynak_ac(yol):
    """(ikili dosya nesnesi, biçim, iç dosya adı) döndürür.

    Desteklenen: .kml, .geojson/.json, .kmz, .zip (içinde kml/geojson), .gz
    Büyük dosyalarda bellek şişmesin diye akış (stream) olarak açılır."""
    ad = yol.name.lower()
    if ad.endswith(".kmz") or ad.endswith(".zip"):
        import zipfile
        zf = zipfile.ZipFile(str(yol))
        ic = _zipten_sec(zf)
        if not ic:
            hata("Sıkıştırılmış dosyanın içi boş: %s" % yol.name)
        bicim = "geojson" if ic.lower().endswith((".geojson", ".json")) else "kml"
        return zf.open(ic), bicim, ic
    if ad.endswith(".gz"):
        import gzip
        ic = yol.name[:-3]
        bicim = "geojson" if ic.lower().endswith((".geojson", ".json")) else "kml"
        return gzip.open(str(yol), "rb"), bicim, ic
    bicim = "geojson" if ad.endswith((".geojson", ".json")) else "kml"
    return open(str(yol), "rb"), bicim, yol.name


# --------------------------------------------------------------------------
# KML okuma
# --------------------------------------------------------------------------

def kml_oku(yol, ondalik=6):
    kaynak, bicim, ic_ad = kaynak_ac(yol)
    boyut = yol.stat().st_size / 1048576
    if ic_ad != yol.name:
        log("  Kaynak okunuyor: %s → %s (sıkıştırılmış, %.1f MB)" % (yol.name, ic_ad, boyut))
    else:
        log("  Kaynak okunuyor: %s (%.1f MB)" % (yol.name, boyut))

    if bicim == "geojson":
        with kaynak:
            return geojson_yol_oku(kaynak, ondalik)

    kayitlar = []
    atlanan = []
    # Akışlı okuma: 100 MB'lık dosyalarda da bellek sabit kalsın diye
    # her Placemark işlendikten sonra bellekten düşürülür.
    try:
        with kaynak:
            for olay, pm in ET.iterparse(kaynak, events=("end",)):
                if etiket(pm) != "Placemark":
                    continue
                kayit, bos_fid = _placemark_oku(pm, ondalik)
                if kayit:
                    kayitlar.append(kayit)
                else:
                    atlanan.append(bos_fid)
                pm.clear()
    except ET.ParseError as e:
        hata("KML dosyası okunamadı (bozuk XML olabilir): %s" % e)

    if atlanan:
        log("  Uyarı: çizgi geometrisi olmayan %d kayıt atlandı (fid: %s)."
            % (len(atlanan), ", ".join(atlanan[:10]) + ("…" if len(atlanan) > 10 else "")))
    if not kayitlar:
        hata("Dosyada hiç yol (LineString) bulunamadı. QGIS'ten çizgi katmanını "
             "KML ya da GeoJSON olarak dışa aktardığınızdan emin olun.")
    log("  %d yol parçası okundu." % len(kayitlar))
    return kayitlar, atlanan


def _placemark_oku(pm, ondalik):
    """Tek bir Placemark'ı okur. (kayit, atlanan_fid) döndürür."""
    # --- öznitelikler ---
    ozellik = {}
    for sd in pm.iter():
        if etiket(sd) == "SimpleData":
            ozellik[sd.get("name", "")] = (sd.text or "").strip()
        elif etiket(sd) == "Data":
            ad = sd.get("name", "")
            for v in sd:
                if etiket(v) == "value":
                    ozellik[ad] = (v.text or "").strip()
    if not ozellik:
        for ch in pm:
            if etiket(ch) == "name":
                ozellik["ADINUMARASI"] = (ch.text or "").strip()

    # --- renk ---
    renk = None
    for c in pm.iter():
        if etiket(c) == "color":
            renk = kml_rengi_hex(c.text)
            if renk:
                break

    # --- geometri (LineString / LinearRing, MultiGeometry dahil) ---
    parcalar = []
    for g in pm.iter():
        if etiket(g) in ("LineString", "LinearRing"):
            for c in g:
                if etiket(c) == "coordinates" and c.text:
                    nokta = koordinat_ayikla(c.text, ondalik)
                    if len(nokta) >= 2:
                        parcalar.append(nokta)
    if not parcalar:
        return None, str(ozellik.get("fid") or "?").split(".")[0]
    return {"ozellik": ozellik, "renk": renk, "parcalar": parcalar}, None


def geojson_yol_oku(kaynak, ondalik=6):
    """Yolları GeoJSON'dan okur (KML yerine GeoJSON dışa aktaranlar için)."""
    try:
        gj = json.loads(kaynak.read().decode("utf-8"))
    except Exception as e:
        hata("GeoJSON okunamadı: %s" % e)
    kayitlar = []
    atlanan = []
    for f in (gj.get("features") or []):
        ozellik = {k: ("" if v is None else str(v).strip())
                   for k, v in (f.get("properties") or {}).items()}
        g = f.get("geometry") or {}
        tip = g.get("type")
        if tip == "LineString":
            ham = [g.get("coordinates") or []]
        elif tip == "MultiLineString":
            ham = g.get("coordinates") or []
        else:
            ham = []
        parcalar = []
        for dizi in ham:
            nokta = []
            for c in dizi:
                if not isinstance(c, (list, tuple)) or len(c) < 2:
                    continue
                x, y = round(float(c[0]), ondalik), round(float(c[1]), ondalik)
                if nokta and nokta[-1] == [x, y]:
                    continue
                nokta.append([x, y])
            if len(nokta) >= 2:
                parcalar.append(nokta)
        if not parcalar:
            atlanan.append(str(ozellik.get("fid") or "?").split(".")[0])
            continue
        kayitlar.append({"ozellik": ozellik, "renk": None, "parcalar": parcalar})

    if atlanan:
        log("  Uyarı: çizgi geometrisi olmayan %d kayıt atlandı (fid: %s)."
            % (len(atlanan), ", ".join(atlanan[:10]) + ("…" if len(atlanan) > 10 else "")))
    if not kayitlar:
        hata("GeoJSON dosyasında hiç çizgi (LineString) bulunamadı.")
    log("  %d yol parçası okundu (GeoJSON)." % len(kayitlar))
    return kayitlar, atlanan



# --------------------------------------------------------------------------
# Projeksiyon dönüşümü (harici kütüphane olmadan)
# --------------------------------------------------------------------------

WGS84 = (6378137.0, 1.0 / 298.257223563)        # GRS80 / WGS84
ED50 = (6378388.0, 1.0 / 297.0)                 # Hayford 1909 (ED50)

# Türkiye verisinde karşılaşılan projeksiyonlar. Hangisi olduğu, yolların
# ilçelerin içine düşme oranına bakılarak otomatik seçilir.
PROJEKSIYONLAR = (
    [("EPSG:%d  TUREF / TM%d" % (5253 + i, 27 + 3 * i),
      dict(lam0=27 + 3 * i, k0=1.0, FE=500000.0, FN=0.0, a=WGS84[0], f=WGS84[1]))
     for i in range(7)] +
    [("EPSG:%d  WGS84 / UTM %dN" % (32600 + z, z),
      dict(lam0=6 * z - 183, k0=0.9996, FE=500000.0, FN=0.0, a=WGS84[0], f=WGS84[1]))
     for z in (35, 36, 37, 38)] +
    [("EPSG:%d  ED50 / UTM %dN" % (23000 + z, z),
      dict(lam0=6 * z - 183, k0=0.9996, FE=500000.0, FN=0.0, a=ED50[0], f=ED50[1]))
     for z in (35, 36, 37, 38)] +
    [("EPSG:%d  ED50 / TM%d" % (2319 + i, 27 + 3 * i),
      dict(lam0=27 + 3 * i, k0=1.0, FE=500000.0, FN=0.0, a=ED50[0], f=ED50[1]))
     for i in range(7)]
)


def ters_tm(x, y, lam0, k0, FE, FN, a, f):
    """Transverse Mercator ters dönüşümü: projeksiyonlu (x, y) -> (lon, lat) derece."""
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    xp = (x - FE) / k0
    M = (y - FN) / k0
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    p1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
          + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
          + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    C1 = ep2 * math.cos(p1) ** 2
    T1 = math.tan(p1) ** 2
    sn = math.sin(p1)
    N1 = a / math.sqrt(1 - e2 * sn * sn)
    R1 = a * (1 - e2) / (1 - e2 * sn * sn) ** 1.5
    Dv = xp / N1
    lat = p1 - (N1 * math.tan(p1) / R1) * (
        Dv ** 2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * Dv ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * Dv ** 6 / 720)
    lon = math.radians(lam0) + (
        Dv - (1 + 2 * T1 + C1) * Dv ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * Dv ** 5 / 120
    ) / math.cos(p1)
    return round(math.degrees(lon), 7), round(math.degrees(lat), 7)


def cizgi_sadelestir(nokta, tolerans):
    """Douglas-Peucker: sınır çizgilerini görüntüleme için seyreltir."""
    if len(nokta) < 3:
        return nokta[:]
    tut = [False] * len(nokta)
    tut[0] = tut[-1] = True
    yigin = [(0, len(nokta) - 1)]
    while yigin:
        i, j = yigin.pop()
        if j <= i + 1:
            continue
        x1, y1 = nokta[i]
        x2, y2 = nokta[j]
        dx, dy = x2 - x1, y2 - y1
        uzun = dx * dx + dy * dy
        enUzak = -1.0
        enUzakIdx = i
        for k in range(i + 1, j):
            px, py = nokta[k]
            if uzun == 0:
                d = (px - x1) ** 2 + (py - y1) ** 2
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / uzun))
                d = (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2
            if d > enUzak:
                enUzak = d
                enUzakIdx = k
        if enUzak > tolerans * tolerans:
            tut[enUzakIdx] = True
            yigin.append((i, enUzakIdx))
            yigin.append((enUzakIdx, j))
    return [nokta[k] for k in range(len(nokta)) if tut[k]]


# --------------------------------------------------------------------------
# İlçe etiketleme (opsiyonel)
# --------------------------------------------------------------------------

def nokta_poligonda(x, y, halka):
    icinde = False
    n = len(halka)
    j = n - 1
    for i in range(n):
        xi, yi = halka[i][0], halka[i][1]
        xj, yj = halka[j][0], halka[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            icinde = not icinde
        j = i
    return icinde


def tr_baslik(metin):
    """ALİAĞA -> Aliağa. Türkçe İ/I kurallarına uyar."""
    kucuk = {"I": "ı", "İ": "i"}
    buyuk = {"i": "İ", "ı": "I"}
    sonuc = []
    for kelime in str(metin).split():
        if not kelime:
            continue
        ilk = buyuk.get(kelime[0], kelime[0].upper())
        kalan = "".join(kucuk.get(c, c.lower()) for c in kelime[1:])
        sonuc.append(ilk + kalan)
    return " ".join(sonuc) or str(metin)


def sinir_ad_alani(ozellikler):
    """İlçe adının hangi alanda olduğunu otomatik bulur.

    QGIS/KML dönüşümlerinde alan adı `__L__E_AD_` gibi bozulabiliyor ya da
    `NAME` alanında ad yerine nesne numarası (536, 537…) bulunabiliyor.
    Bu yüzden alan adına değil, alanın İÇERİĞİNE bakılır."""
    if not ozellikler:
        return None
    bilinen = {"ilce", "ilceadi", "ilcead", "ilceler", "adi", "ad", "name",
               "district", "ilcesi", "ilceismi", "mahalle", "mahalleadi",
               "mah", "mahad", "koy", "koyadi", "adinumaras", "adinumarasi"}
    anahtarlar = set()
    for f in ozellikler:
        anahtarlar.update((f.get("properties") or {}).keys())

    en_iyi, en_iyi_puan = None, -1e9
    for k in sorted(anahtarlar):
        degerler = [str((f.get("properties") or {}).get(k) or "").strip()
                    for f in ozellikler]
        dolu = [v for v in degerler if v]
        if len(dolu) < len(ozellikler) * 0.8:
            continue                                   # çoğu boş
        if any(("://" in v) or ("System.Object" in v) for v in dolu):
            continue                                   # bağlantı / iç nesne
        if all(re.fullmatch(r"-?\d+([.,]\d+)?", v) for v in dolu):
            continue                                   # tamamen sayısal
        ort_uzunluk = sum(len(v) for v in dolu) / len(dolu)
        if ort_uzunluk > 40:
            continue                                   # uzun metin, ad değil
        farkli = len(set(dolu))
        harfli = sum(1 for v in dolu
                     if re.search(r"[A-Za-zÇĞİıÖŞÜçğöşü]", v)) / len(dolu)
        puan = (farkli / len(ozellikler)) * 100 + harfli * 40 - abs(ort_uzunluk - 9)
        if k.lower().replace("_", "").replace("i̇", "i") in bilinen:
            puan += 60
        if puan > en_iyi_puan:
            en_iyi, en_iyi_puan = k, puan
    return en_iyi


def cografi_mi(ozellikler):
    """Koordinatlar enlem/boylam mı, yoksa projeksiyonlu mu?"""
    for f in ozellikler:
        g = f.get("geometry") or {}
        c = g.get("coordinates")
        while isinstance(c, list) and c and isinstance(c[0], list):
            c = c[0]
        if isinstance(c, list) and len(c) >= 2:
            return abs(c[0]) <= 180 and abs(c[1]) <= 90
    return True


def _poligonlari_al(f):
    g = f.get("geometry") or {}
    if g.get("type") == "Polygon":
        return [g.get("coordinates") or []]
    if g.get("type") == "MultiPolygon":
        return g.get("coordinates") or []
    return []


def _donustur(poligonlar, prm):
    if prm is None:
        return poligonlar
    return [[[ters_tm(pt[0], pt[1], **prm) for pt in halka] for halka in poly]
            for poly in poligonlar]


def _sinir_kaydi(ad, poligonlar):
    xs, ys = [], []
    for poly in poligonlar:
        for halka in poly:
            for pt in halka:
                xs.append(pt[0]); ys.append(pt[1])
    if not xs:
        return None
    return (ad, (min(xs), min(ys), max(xs), max(ys)), poligonlar)


def _tutma_orani(kayitlar, ornekler):
    """Yol orta noktalarının kaçı bir ilçenin içine düşüyor (0-1)."""
    if not ornekler:
        return 0.0
    tutan = 0
    for x, y in ornekler:
        if sinir_bul(kayitlar, x, y):
            tutan += 1
    return tutan / len(ornekler)


def sinir_yukle(yol, yol_ornekleri=None, etiket="İlçe"):
    """Sınır katmanını (ilçe / mahalle) okur; gerekirse projeksiyonu otomatik çözer.

    Döndürür: (kayitlar, bilgi)
      kayitlar : [(ad, bbox, poligonlar)] — enlem/boylam
      bilgi    : {"adet", "ad_alani", "projeksiyon", "tutma"} ya da None
    """
    if not yol.exists():
        return [], None
    try:
        gj = json.loads(yol.read_text(encoding="utf-8"))
    except Exception as e:
        log("  Uyarı: %s sınırları okunamadı (%s); etiket eklenmeyecek." % (etiket, e))
        return [], {"hata": "Dosya geçerli bir GeoJSON değil: %s" % e}

    ozellikler = [f for f in (gj.get("features") or []) if _poligonlari_al(f)]
    if not ozellikler:
        log("  Uyarı: %s sınırları dosyasında alan (poligon) bulunamadı." % etiket)
        return [], {"hata": "Dosyada poligon geometrisi yok. Katmanı QGIS'ten "
                            "'Poligon' katmanı olarak GeoJSON kaydettiğinizden emin olun."}

    ad_alani = sinir_ad_alani(ozellikler)
    adlar = [tr_baslik(str((f.get("properties") or {}).get(ad_alani) or "").strip())
             or "Bilinmiyor" for f in ozellikler]
    log("  %s sınırları: %d alan, ad alanı '%s' (ör. %s)."
        % (etiket, len(ozellikler), ad_alani, ", ".join(adlar[:3])))

    ham = [_poligonlari_al(f) for f in ozellikler]
    ornekler = yol_ornekleri or []

    if cografi_mi(ozellikler):
        kayitlar = [k for k in (_sinir_kaydi(adlar[i], ham[i]) for i in range(len(ham))) if k]
        oran = _tutma_orani(kayitlar, ornekler)
        log("  Koordinatlar enlem/boylam (WGS84). Yol eşleşmesi: %%%.1f" % (oran * 100))
        return kayitlar, {"adet": len(kayitlar), "ad_alani": ad_alani,
                          "projeksiyon": "EPSG:4326  WGS84 (enlem/boylam)",
                          "tutma": round(oran, 4)}

    # --- Projeksiyonlu: doğru CRS'i, yolların ilçelere düşme oranına göre seç ---
    log("  Koordinatlar projeksiyonlu; doğru projeksiyon otomatik aranıyor…")
    if not ornekler:
        log("  Uyarı: karşılaştırma için yol örneği yok; etiket eklenmeyecek.")
        return [], {"hata": "Projeksiyon belirlenemedi."}

    yol_kutu = (min(p[0] for p in ornekler), min(p[1] for p in ornekler),
                max(p[0] for p in ornekler), max(p[1] for p in ornekler))

    # 1. tur (hızlı): sınır kutusu yolların kutusuna yakın olmayan adayları ele
    kaba = []
    for ad, prm in PROJEKSIYONLAR:
        try:
            kose = []
            for poligonlar in ham:
                for poly in poligonlar:
                    for halka in poly:
                        for pt in (halka[0], halka[len(halka) // 2]):
                            kose.append(ters_tm(pt[0], pt[1], **prm))
                        break
                break
            if not kose:
                continue
            kx = [p[0] for p in kose]; ky = [p[1] for p in kose]
            mesafe = (abs((min(kx) + max(kx)) / 2 - (yol_kutu[0] + yol_kutu[2]) / 2) +
                      abs((min(ky) + max(ky)) / 2 - (yol_kutu[1] + yol_kutu[3]) / 2))
            kaba.append((mesafe, ad, prm))
        except (ValueError, ZeroDivisionError, OverflowError):
            continue
    kaba.sort()
    finalistler = [(ad, prm) for _, ad, prm in kaba[:4]]

    # 2. tur (kesin): tam dönüşüm + nokta-poligon testi
    en_iyi = None
    for ad, prm in finalistler:
        try:
            kayitlar = [k for k in (_sinir_kaydi(adlar[i], _donustur(ham[i], prm))
                                    for i in range(len(ham))) if k]
        except (ValueError, ZeroDivisionError, OverflowError):
            continue
        oran = _tutma_orani(kayitlar, ornekler)
        log("    %-28s yol eşleşmesi: %%%.1f" % (ad, oran * 100))
        if en_iyi is None or oran > en_iyi[0]:
            en_iyi = (oran, ad, kayitlar)

    if en_iyi is None or en_iyi[0] < 0.5:
        log("  Uyarı: %s sınırları yolların üzerine oturmuyor; etiket eklenmeyecek." % etiket)
        return [], {"hata": "Sınırların projeksiyonu çözülemedi (en iyi eşleşme %%%.1f). "
                            "Dosyayı QGIS'ten EPSG:4326 (WGS 84) olarak yeniden kaydedin."
                            % ((en_iyi[0] if en_iyi else 0) * 100)}

    oran, ad, kayitlar = en_iyi
    log("  Projeksiyon seçildi: %s (yol eşleşmesi %%%.1f)" % (ad, oran * 100))
    return kayitlar, {"adet": len(kayitlar), "ad_alani": ad_alani,
                      "projeksiyon": ad, "tutma": round(oran, 4)}


def sinir_bul(kayitlar, x, y):
    for ad, (x0, y0, x1, y1), poligonlar in kayitlar:
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            continue
        for poly in poligonlar:
            if not poly:
                continue
            if nokta_poligonda(x, y, poly[0]):
                delik = any(nokta_poligonda(x, y, h) for h in poly[1:])
                if not delik:
                    return ad
    return None


class SinirIndeksi:
    """Nokta -> alan adı araması için basit mekânsal ızgara.

    1.300'ü aşan mahalle sınırında doğrusal arama yavaş kaldığı için
    her alanın sınır kutusu ızgara hücrelerine kaydedilir."""

    def __init__(self, kayitlar, hucre=0.02):
        self.kayitlar = kayitlar
        self.hucre = hucre
        self.tablo = {}
        for i, (_ad, (x0, y0, x1, y1), _poly) in enumerate(kayitlar):
            for cx in range(int(math.floor(x0 / hucre)), int(math.floor(x1 / hucre)) + 1):
                for cy in range(int(math.floor(y0 / hucre)), int(math.floor(y1 / hucre)) + 1):
                    self.tablo.setdefault((cx, cy), []).append(i)

    def bul(self, x, y):
        aday = self.tablo.get((int(math.floor(x / self.hucre)),
                               int(math.floor(y / self.hucre))))
        if not aday:
            return None
        for i in aday:
            ad, (x0, y0, x1, y1), poligonlar = self.kayitlar[i]
            if not (x0 <= x <= x1 and y0 <= y <= y1):
                continue
            for poly in poligonlar:
                if poly and nokta_poligonda(x, y, poly[0]) and \
                        not any(nokta_poligonda(x, y, h) for h in poly[1:]):
                    return ad
        return None


def sinir_etiket_noktasi(poligonlar):
    """Alanın adını yazacağımız nokta: en büyük halkanın ağırlık merkezi."""
    enBuyuk = max((poly[0] for poly in poligonlar if poly), key=len, default=None)
    if not enBuyuk:
        return None
    return (round(sum(p[0] for p in enBuyuk) / len(enBuyuk), 5),
            round(sum(p[1] for p in enBuyuk) / len(enBuyuk), 5))


def sinir_geojson_yaz(kayitlar, hedef, tolerans=0.00035, ustKatman=None, kisaAdlar=None):
    """Sınırları haritada çizmek için sadeleştirilmiş kopya üretir."""
    oz = []
    for ad, _kutu, poligonlar in kayitlar:
        sade = []
        for poly in poligonlar:
            halkalar = []
            for halka in poly:
                h = cizgi_sadelestir([(round(pt[0], 5), round(pt[1], 5)) for pt in halka],
                                     tolerans)
                if len(h) >= 4:
                    if h[0] != h[-1]:
                        h.append(h[0])
                    halkalar.append([[a, b] for a, b in h])
            if halkalar:
                sade.append(halkalar)
        if not sade:
            continue
        ozellik = {"ad": ad}
        if kisaAdlar and kisaAdlar.get(ad) and kisaAdlar[ad] != ad:
            ozellik["kisa"] = kisaAdlar[ad]
        etiket = sinir_etiket_noktasi(poligonlar)
        if etiket:
            ozellik["etiket"] = [etiket[0], etiket[1]]
            if ustKatman:
                ozellik["ust"] = ustKatman.bul(etiket[0], etiket[1]) or "Belirlenemedi"
        oz.append({"type": "Feature", "properties": ozellik,
                   "geometry": {"type": "MultiPolygon", "coordinates": sade}})
    hedef.write_text(json.dumps({"type": "FeatureCollection", "features": oz},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(oz)


def sinir_gorunumu(ayar, renk, renk_koyu, kalinlik, etiket_min_zoom, cizim_min_zoom=0):
    """Sınır çizgisinin görünüm ayarlarını varsayılanlarla birleştirir."""
    a = ayar or {}
    return {
        "renk": a.get("renk") or renk,
        "renk_koyu": a.get("renk_koyu") or renk_koyu,
        "kalinlik": float(a.get("kalinlik", kalinlik) or kalinlik),
        "kesikli": bool(a.get("kesikli", True)),
        "etiket_goster": bool(a.get("etiket_goster", True)),
        "etiket_min_zoom": int(a.get("etiket_min_zoom", etiket_min_zoom) or 0),
        "cizim_min_zoom": int(a.get("cizim_min_zoom", cizim_min_zoom) or 0),
    }


def benzersiz_adlar(kayitlar, ustKatman=None):
    """Aynı adlı alanları ayırt eder: 'Atatürk' -> 'Atatürk (Bergama)'."""
    sayac = {}
    for ad, _k, _p in kayitlar:
        sayac[ad] = sayac.get(ad, 0) + 1
    kullanilan = set()
    yeni = []
    ust_adlari = []
    kisa_adlar = {}
    for ad, kutu, poligonlar in kayitlar:
        ust = None
        if ustKatman:
            nokta = sinir_etiket_noktasi(poligonlar)
            if nokta:
                ust = ustKatman.bul(nokta[0], nokta[1])
        anahtar = ad if sayac[ad] == 1 else "%s (%s)" % (ad, ust or "?")
        temel = anahtar
        n = 2
        while anahtar in kullanilan:
            anahtar = "%s %d" % (temel, n)
            n += 1
        kullanilan.add(anahtar)
        kisa_adlar[anahtar] = ad
        yeni.append((anahtar, kutu, poligonlar))
        ust_adlari.append(ust or "Belirlenemedi")
    return yeni, ust_adlari, kisa_adlar


# --------------------------------------------------------------------------
# Ana derleme
# --------------------------------------------------------------------------

def derle(kml_yolu, cikti_dizini, ondalik=6):
    veri_dizini = KOK / "veri"
    site_dizini = KOK / "site"

    # 1) Ayarlar
    ayar_yolu = veri_dizini / "kategoriler.json"
    ayar = {}
    if ayar_yolu.exists():
        try:
            ayar = json.loads(ayar_yolu.read_text(encoding="utf-8"))
        except Exception as e:
            hata("veri/kategoriler.json okunamadı (JSON hatası): %s" % e)
    kategori_ayari = ayar.get("kategoriler", {}) or {}
    site_ayari = ayar.get("site", {}) or {}

    # 2) KML
    kayitlar, bos_geometri = kml_oku(kml_yolu, ondalik)

    # 3) Sınır katmanları (opsiyonel) — projeksiyon denetimi için yol orta noktaları
    orta_noktalar = []
    for k in kayitlar:
        p0 = k["parcalar"][0]
        orta_noktalar.append(tuple(p0[len(p0) // 2]))
    adim = max(1, len(orta_noktalar) // 600)
    ornek_noktalar = orta_noktalar[::adim]

    ilceler, ilce_bilgi = sinir_yukle(veri_dizini / "ilce_sinirlari.geojson",
                                      ornek_noktalar, "İlçe")
    ilce_indeks = SinirIndeksi(ilceler) if ilceler else None

    mahalleler, mahalle_bilgi = sinir_yukle(veri_dizini / "mahalle_sinirlari.geojson",
                                            ornek_noktalar, "Mahalle")
    mahalle_ustu = {}
    mahalle_kisa = {}
    if mahalleler:
        # Aynı adlı mahalleleri ilçesiyle ayırt et (ör. 19 farklı "Atatürk")
        mahalleler, ust_adlari, mahalle_kisa = benzersiz_adlar(mahalleler, ilce_indeks)
        for (ad, _k, _p), ust in zip(mahalleler, ust_adlari):
            mahalle_ustu[ad] = ust
    mahalle_indeks = SinirIndeksi(mahalleler) if mahalleler else None

    # 4) Özellikleri üret
    ozellikler = []
    kategori_renkleri = {}   # durum -> {hex: adet}
    istatistik = {}          # durum -> {adet, uzunluk}
    tip_istatistik = {}
    ilce_istatistik = {}
    mahalle_istatistik = {}
    adlar = {}
    isimsiz = []
    cok_kisa = []
    durumsuz = []
    minx = miny = 1e9
    maxx = maxy = -1e9
    toplam_uzunluk = 0.0

    for idx, k in enumerate(kayitlar):
        oz = k["ozellik"]
        durum = (oz.get("DURUM") or oz.get("durum") or "").strip()
        durumu_bos = durum in ("", "None", "null")
        if durumu_bos:
            durum = "0"
        durum = str(durum).split(".")[0]  # "1.0" -> "1"

        ad = (oz.get("ADINUMARASI") or oz.get("ADI") or oz.get("ad") or "").strip()
        adsiz = not ad
        if adsiz:
            ad = "İsimsiz yol"
        tip = (oz.get("TIP1") or oz.get("TIP") or "").strip() or "Belirtilmemiş"
        fid = (oz.get("fid") or oz.get("FID") or "").strip()
        try:
            fid = str(int(float(fid)))
        except (ValueError, TypeError):
            fid = str(idx + 1)

        if k["renk"]:
            kategori_renkleri.setdefault(durum, {})
            kategori_renkleri[durum][k["renk"]] = kategori_renkleri[durum].get(k["renk"], 0) + 1

        uzunluk = sum(cizgi_uzunlugu(p) for p in k["parcalar"])
        toplam_uzunluk += uzunluk
        if adsiz:
            isimsiz.append(fid)
        if durumu_bos:
            durumsuz.append(fid)
        if uzunluk < 1.0:
            cok_kisa.append(fid)

        if len(k["parcalar"]) == 1:
            geom = {"type": "LineString", "coordinates": k["parcalar"][0]}
            orta = k["parcalar"][0][len(k["parcalar"][0]) // 2]
        else:
            geom = {"type": "MultiLineString", "coordinates": k["parcalar"]}
            orta = k["parcalar"][0][len(k["parcalar"][0]) // 2]

        for p in k["parcalar"]:
            for x, y in p:
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)

        prop = {
            "fid": fid,
            "ad": ad,
            "tip": tip,
            "durum": durum,
            "uzunluk_m": round(uzunluk, 1),
        }
        if ilce_indeks:
            prop["ilce"] = ilce_indeks.bul(orta[0], orta[1]) or "Belirlenemedi"
            ist = ilce_istatistik.setdefault(prop["ilce"],
                                             {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})
            ist["adet"] += 1
            ist["uzunluk_m"] += uzunluk
            ist["durumlar"][durum] = ist["durumlar"].get(durum, 0) + 1
        if mahalle_indeks:
            prop["mahalle"] = mahalle_indeks.bul(orta[0], orta[1]) or "Belirlenemedi"
            ist = mahalle_istatistik.setdefault(prop["mahalle"],
                                                {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})
            ist["adet"] += 1
            ist["uzunluk_m"] += uzunluk
            ist["durumlar"][durum] = ist["durumlar"].get(durum, 0) + 1

        ozellikler.append({"type": "Feature", "properties": prop, "geometry": geom})

        ist = istatistik.setdefault(durum, {"adet": 0, "uzunluk_m": 0.0})
        ist["adet"] += 1
        ist["uzunluk_m"] += uzunluk

        t = tip_istatistik.setdefault(tip, {"adet": 0, "uzunluk_m": 0.0})
        t["adet"] += 1
        t["uzunluk_m"] += uzunluk

        a = adlar.setdefault(ad, {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})
        a["adet"] += 1
        a["uzunluk_m"] += uzunluk
        a["durumlar"][durum] = a["durumlar"].get(durum, 0) + 1

    # Yolu olmayan alanlar da listede görünsün (çalışmanın kapsamı belli olsun)
    for _ad, _kutu, _poly in ilceler:
        ilce_istatistik.setdefault(_ad, {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})
    for _ad, _kutu, _poly in mahalleler:
        mahalle_istatistik.setdefault(_ad, {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})

    # 5) Kategori tanımlarını çöz (ayar > KML rengi > yedek renk)
    kategoriler = {}
    yedek_sayaci = 0
    for durum in istatistik:
        tanim = kategori_ayari.get(durum, {}) or {}
        renk = tanim.get("renk")
        if not renk:
            secenekler = kategori_renkleri.get(durum, {})
            if secenekler:
                renk = max(secenekler.items(), key=lambda x: x[1])[0]
        if not renk:
            renk = YEDEK_RENKLER[yedek_sayaci % len(YEDEK_RENKLER)]
            yedek_sayaci += 1
        bilinen = durum in kategori_ayari
        kategoriler[durum] = {
            "ad": tanim.get("ad") or ("Tanımsız durum kodu: %s" % durum),
            "kisa_ad": tanim.get("kisa_ad") or tanim.get("ad") or ("Durum %s" % durum),
            "aciklama": tanim.get("aciklama") or
                        ("Bu durum kodu veri/kategoriler.json dosyasında tanımlı değil. "
                         "Adını ve rengini oradan belirleyebilirsiniz."),
            "renk": renk,
            "renk_koyu": tanim.get("renk_koyu") or None,
            "sira": tanim.get("sira", 900 + int(durum) if durum.isdigit() else 999),
            "varsayilan_acik": tanim.get("varsayilan_acik", True),
            "tanimli": bilinen,
            "kml_renkleri": sorted(kategori_renkleri.get(durum, {}).keys()),
            "adet": istatistik[durum]["adet"],
            "uzunluk_km": round(istatistik[durum]["uzunluk_m"] / 1000.0, 2),
        }
        if not bilinen:
            log("  Uyarı: KML'de tanımsız DURUM kodu var -> '%s' (%d yol). "
                "veri/kategoriler.json içine ekleyebilirsiniz."
                % (durum, istatistik[durum]["adet"]))

    # 5b) Veri kalitesi uyarıları (QGIS'te düzeltmek isteyebileceğiniz kayıtlar)
    uyarilar = []
    if bos_geometri:
        uyarilar.append({
            "baslik": "Geometrisi boş kayıtlar",
            "mesaj": "%d kaydın çizgi geometrisi boş olduğu için haritaya eklenemedi. "
                     "QGIS'te bu kayıtları silebilir veya geometrilerini çizebilirsiniz." % len(bos_geometri),
            "adet": len(bos_geometri), "ornek": bos_geometri[:12]})
    if durumsuz:
        uyarilar.append({
            "baslik": "DURUM alanı boş kayıtlar",
            "mesaj": "%d kaydın DURUM alanı boş. Bunlar haritada 'Tanımsız durum kodu: 0' "
                     "olarak gösterilir." % len(durumsuz),
            "adet": len(durumsuz), "ornek": durumsuz[:12]})
    if isimsiz:
        uyarilar.append({
            "baslik": "Adı olmayan yollar",
            "mesaj": "%d kaydın ADINUMARASI alanı boş; haritada 'İsimsiz yol' olarak görünürler "
                     "ve arama ile bulunamazlar." % len(isimsiz),
            "adet": len(isimsiz), "ornek": isimsiz[:12]})
    if cok_kisa:
        uyarilar.append({
            "baslik": "Çok kısa (1 m altı) çizgiler",
            "mesaj": "%d kayıt 1 metreden kısa. Genellikle yanlışlıkla oluşmuş artık çizgilerdir."
                     % len(cok_kisa),
            "adet": len(cok_kisa), "ornek": cok_kisa[:12]})
    for _etiket, _bilgi in (("İlçe", ilce_bilgi), ("Mahalle", mahalle_bilgi)):
        if _bilgi and _bilgi.get("hata"):
            uyarilar.append({
                "baslik": "%s sınırları kullanılamadı" % _etiket,
                "mesaj": _bilgi["hata"], "adet": 1, "ornek": []})
        elif _bilgi and _bilgi.get("tutma", 1) < 0.95:
            uyarilar.append({
                "baslik": "%s eşleşmesi düşük" % _etiket,
                "mesaj": "Yolların yalnızca %%%.1f'i bir %s sınırının içine düştü. "
                         "Katman eksik olabilir ya da farklı bir projeksiyonda "
                         "kaydedilmiş olabilir." % (_bilgi["tutma"] * 100, _etiket.lower()),
                "adet": 1, "ornek": []})
    tanimsiz = [d for d in kategoriler if not kategoriler[d]["tanimli"]]
    if tanimsiz:
        uyarilar.append({
            "baslik": "Tanımsız DURUM kodları",
            "mesaj": "Şu DURUM kodları veri/kategoriler.json dosyasında tanımlı değil: %s. "
                     "Adlarını ve renklerini oradan belirleyebilirsiniz." % ", ".join(sorted(tanimsiz)),
            "adet": len(tanimsiz), "ornek": []})

    # 6) Dosyaları yaz
    cikti_dizini = Path(cikti_dizini).resolve()
    # Güvenlik: yanlışlıkla depo kökünü veya kaynak klasörleri silmeyi engelle
    if cikti_dizini == KOK or (cikti_dizini / ".git").exists() or \
            cikti_dizini in (veri_dizini.resolve(), site_dizini.resolve()):
        hata("Çıktı klasörü olarak '%s' kullanılamaz. Boş veya ayrı bir klasör seçin "
             "(örn. _site)." % cikti_dizini)
    if cikti_dizini.exists():
        shutil.rmtree(cikti_dizini)
    shutil.copytree(site_dizini, cikti_dizini)
    (cikti_dizini / ".nojekyll").write_text("", encoding="utf-8")
    veri_cikti = cikti_dizini / "veri"
    veri_cikti.mkdir(parents=True, exist_ok=True)

    geojson = {
        "type": "FeatureCollection",
        "name": "izmir_yollar",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": ozellikler,
    }
    gj_yolu = veri_cikti / "yollar.geojson"
    with gj_yolu.open("w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    # Sınırları haritada çizmek için sadeleştirilmiş kopyalar
    if ilceler:
        n = sinir_geojson_yaz(ilceler, veri_cikti / "ilceler.geojson")
        log("  ilceler.geojson    : %d alan, %.2f MB"
            % (n, (veri_cikti / "ilceler.geojson").stat().st_size / 1048576))
    if mahalleler:
        n = sinir_geojson_yaz(mahalleler, veri_cikti / "mahalleler.geojson",
                              ustKatman=ilce_indeks, kisaAdlar=mahalle_kisa)
        log("  mahalleler.geojson : %d alan, %.2f MB"
            % (n, (veri_cikti / "mahalleler.geojson").stat().st_size / 1048576))

    # Kaynak dosyayı indirilebilir yap — çok büyükse yayınlanan siteye konmaz
    KAYNAK_SINIRI_MB = 25
    kaynak_boyut = kml_yolu.stat().st_size / 1048576
    kaynak_indirme = None
    if kaynak_boyut <= KAYNAK_SINIRI_MB:
        shutil.copyfile(kml_yolu, veri_cikti / kml_yolu.name)
        kaynak_indirme = kml_yolu.name
    else:
        log("  Not: kaynak dosya %.1f MB (>%d MB); siteye kopyalanmadı. "
            "İndirme menüsünde GeoJSON sürümü sunuluyor."
            % (kaynak_boyut, KAYNAK_SINIRI_MB))

    guncelleme = datetime.now(TR_SAAT)
    ad_listesi = sorted(
        [{"ad": a, "n": v["adet"], "km": round(v["uzunluk_m"] / 1000.0, 2),
          "durumlar": v["durumlar"], "arama": normalize(a)}
         for a, v in adlar.items()],
        key=lambda x: -x["km"])

    ozet = {
        "site": {
            "baslik": site_ayari.get("baslik", "İzmir Köy Yolları Devir Haritası"),
            "alt_baslik": site_ayari.get("alt_baslik", ""),
            "kurum": site_ayari.get("kurum", ""),
            "not": site_ayari.get("not", ""),
        },
        "guncelleme": guncelleme.strftime("%d.%m.%Y %H:%M"),
        "guncelleme_iso": guncelleme.isoformat(),
        "kaynak_dosya": kml_yolu.name,
        "kaynak_boyut_mb": round(kaynak_boyut, 2),
        "kaynak_indirme": kaynak_indirme,
        "toplam_yol": len(ozellikler),
        "toplam_km": round(toplam_uzunluk / 1000.0, 2),
        "bbox": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
        "kategoriler": kategoriler,
        "tipler": {t: {"adet": v["adet"], "uzunluk_km": round(v["uzunluk_m"] / 1000.0, 2)}
                   for t, v in sorted(tip_istatistik.items(), key=lambda x: -x[1]["uzunluk_m"])},
        "ilceler": {i: {"adet": v["adet"], "uzunluk_km": round(v["uzunluk_m"] / 1000.0, 2),
                        "durumlar": v["durumlar"], "yol_yok": v["adet"] == 0}
                    for i, v in sorted(ilce_istatistik.items(),
                                       key=lambda x: (-x[1]["uzunluk_m"], x[0]))},
        "ilce_verisi_var": bool(ilceler),
        "ilce_bilgi": ilce_bilgi or {},
        "ilce_sinir": sinir_gorunumu(ayar.get("ilce_sinir"), "#6b7280", "#9ca3af", 1.2, 0),
        "mahalleler": {m: {"adet": v["adet"],
                           "uzunluk_km": round(v["uzunluk_m"] / 1000.0, 2),
                           "yol_yok": v["adet"] == 0,
                           "ilce": mahalle_ustu.get(m, "")}
                       for m, v in sorted(mahalle_istatistik.items(),
                                          key=lambda x: (-x[1]["uzunluk_m"], x[0]))},
        "mahalle_verisi_var": bool(mahalleler),
        "mahalle_bilgi": mahalle_bilgi or {},
        "mahalle_sinir": sinir_gorunumu(ayar.get("mahalle_sinir"),
                                        "#b45309", "#f59e0b", 0.8, 12, 11),
        "uyarilar": uyarilar,
        "depo": depo_bilgisi(),
        "ayar_ham": ayar,
        "adlar": ad_listesi,
        "veri_boyut_mb": round(gj_yolu.stat().st_size / 1048576, 2),
    }
    (veri_cikti / "ozet.json").write_text(
        json.dumps(ozet, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 7) Özet çıktı
    log("")
    log("  " + "-" * 58)
    log("  Toplam %d yol parçası, %.1f km" % (len(ozellikler), toplam_uzunluk / 1000.0))
    for durum, k in sorted(kategoriler.items(), key=lambda x: x[1]["sira"]):
        log("   %-42s %5d yol  %9.1f km" % (k["kisa_ad"][:42], k["adet"], k["uzunluk_km"]))
    for _etiket, _kayitlar, _ist in (("İlçe", ilceler, ilce_istatistik),
                                     ("Mahalle", mahalleler, mahalle_istatistik)):
        if not _ist:
            continue
        yollu = sorted([i for i, v in _ist.items()
                        if v["adet"] and i != "Belirlenemedi"],
                       key=lambda i: -_ist[i]["uzunluk_m"])
        log("  %s: %d sınır, %d tanesinde yol var (%s%s)"
            % (_etiket, len(_kayitlar), len(yollu), ", ".join(yollu[:5]),
               "…" if len(yollu) > 5 else ""))
    for u in uyarilar:
        log("  ! %s: %s" % (u["baslik"], u["mesaj"]))
    log("  " + "-" * 58)
    log("  yollar.geojson : %.2f MB" % ozet["veri_boyut_mb"])
    log("  Çıktı klasörü  : %s" % cikti_dizini)
    log("")
    return ozet


def kml_bul(veri_dizini):
    """Yol verisini bulur: ibb_yollar.(kml|kmz|zip|geojson|json|gz) ve benzerleri."""
    # Yol verisi olmayan, klasördeki diğer dosyalar
    ayrilmis_adlar = {"kategoriler.json"}
    ayrilmis_onekler = ("ilce_sinirlari", "mahalle_sinirlari")
    adaylar = []
    for dosya in sorted(veri_dizini.iterdir()):
        if not dosya.is_file():
            continue
        ad = dosya.name.lower()
        if not ad.endswith(YOL_UZANTILARI):
            continue
        if ad in ayrilmis_adlar or any(ad.startswith(o) for o in ayrilmis_onekler):
            continue
        adaylar.append(dosya)
    if not adaylar:
        hata("veri/ klasöründe yol verisi bulunamadı.\n"
             "QGIS'ten dışa aktardığınız dosyayı 'veri' klasörüne yükleyin.\n"
             "Kabul edilen biçimler: .kml, .kmz, .zip (içinde kml/geojson), "
             ".geojson, .json, .gz")
    if len(adaylar) > 1:
        # Dosya tarihleri git kopyasında güvenilir değildir; yanlış (eski) dosyayı
        # sessizce kullanmaktansa açıkça soruyoruz.
        hata("veri/ klasöründe birden fazla yol verisi var:\n  %s\n\n"
             "Hangisinin kullanılacağı belirsiz. Eski olanları silin, "
             "yalnızca bir tane kalsın.\n"
             "(GitHub'da dosyaya tıklayıp sağ üstteki çöp kutusu simgesiyle "
             "silebilirsiniz.)" % "\n  ".join(a.name for a in adaylar))
    return adaylar[0]


def main():
    ap = argparse.ArgumentParser(description="İzmir yol haritası sitesini derler.")
    ap.add_argument("--kml", help="KML dosyasının yolu (varsayılan: veri/ içindeki ilk .kml)")
    ap.add_argument("--cikti", default=str(KOK / "_site"), help="Çıktı klasörü (varsayılan: _site)")
    ap.add_argument("--ondalik", type=int, default=6,
                    help="Koordinat ondalık hane sayısı (varsayılan 6 ≈ 11 cm)")
    a = ap.parse_args()

    log("")
    log("  İzmir Köy Yolları Devir Haritası — derleme başlıyor")
    log("  " + "-" * 58)
    kml = Path(a.kml) if a.kml else kml_bul(KOK / "veri")
    if not kml.exists():
        hata("KML dosyası bulunamadı: %s" % kml)
    derle(kml, a.cikti, a.ondalik)
    log("  Tamamlandı. Yerelde görmek için:")
    log("    python3 -m http.server 8000 --directory %s" % a.cikti)
    log("")


if __name__ == "__main__":
    main()
