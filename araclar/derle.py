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
# KML okuma
# --------------------------------------------------------------------------

def kml_oku(yol, ondalik=6):
    log("  KML okunuyor: %s (%.1f MB)" % (yol.name, yol.stat().st_size / 1048576))
    try:
        agac = ET.parse(str(yol))
    except ET.ParseError as e:
        hata("KML dosyası okunamadı (bozuk XML olabilir): %s" % e)
    kok = agac.getroot()

    kayitlar = []
    atlanan = []
    for pm in kok.iter():
        if etiket(pm) != "Placemark":
            continue

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
            atlanan.append(str(ozellik.get("fid") or "?").split(".")[0])
            continue

        kayitlar.append({"ozellik": ozellik, "renk": renk, "parcalar": parcalar})

    if atlanan:
        log("  Uyarı: çizgi geometrisi olmayan %d kayıt atlandı (fid: %s)."
            % (len(atlanan), ", ".join(atlanan[:10]) + ("…" if len(atlanan) > 10 else "")))
    if not kayitlar:
        hata("KML dosyasında hiç yol (LineString) bulunamadı. QGIS'ten çizgi katmanını "
             "KML olarak dışa aktardığınızdan emin olun.")
    log("  %d yol parçası okundu." % len(kayitlar))
    return kayitlar, atlanan


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


def ilce_yukle(yol):
    """veri/ilce_sinirlari.geojson varsa [(ad, bbox, [poligonlar])] döndürür."""
    if not yol.exists():
        return []
    try:
        gj = json.loads(yol.read_text(encoding="utf-8"))
    except Exception as e:
        log("  Uyarı: ilçe sınırları okunamadı (%s), ilçe etiketi eklenmeyecek." % e)
        return []

    ad_adaylari = ["ilce", "ILCE", "İlçe", "ilce_adi", "ILCE_ADI", "adi", "ADI",
                   "ad", "AD", "name", "NAME", "Name", "ILCEADI", "district"]
    sonuc = []
    for f in gj.get("features", []):
        p = f.get("properties") or {}
        ad = None
        for k in ad_adaylari:
            if p.get(k):
                ad = str(p[k]).strip()
                break
        if ad is None:
            for v in p.values():
                if isinstance(v, str) and v.strip():
                    ad = v.strip()
                    break
        g = f.get("geometry") or {}
        poligonlar = []
        if g.get("type") == "Polygon":
            poligonlar = [g["coordinates"]]
        elif g.get("type") == "MultiPolygon":
            poligonlar = g["coordinates"]
        else:
            continue
        xs, ys = [], []
        for poly in poligonlar:
            for halka in poly:
                for pt in halka:
                    xs.append(pt[0]); ys.append(pt[1])
        if not xs:
            continue
        sonuc.append((ad or "Bilinmiyor", (min(xs), min(ys), max(xs), max(ys)), poligonlar))
    if sonuc:
        log("  İlçe sınırları yüklendi: %d ilçe." % len(sonuc))
    return sonuc


def ilce_bul(ilceler, x, y):
    for ad, (x0, y0, x1, y1), poligonlar in ilceler:
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

    # 3) İlçeler (opsiyonel)
    ilceler = ilce_yukle(veri_dizini / "ilce_sinirlari.geojson")

    # 4) Özellikleri üret
    ozellikler = []
    kategori_renkleri = {}   # durum -> {hex: adet}
    istatistik = {}          # durum -> {adet, uzunluk}
    tip_istatistik = {}
    ilce_istatistik = {}
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
        if ilceler:
            il = ilce_bul(ilceler, orta[0], orta[1])
            prop["ilce"] = il or "Belirlenemedi"
            ist = ilce_istatistik.setdefault(prop["ilce"], {"adet": 0, "uzunluk_m": 0.0, "durumlar": {}})
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

    # orijinal KML'i indirilebilir yap
    shutil.copyfile(kml_yolu, veri_cikti / "ibb_yollar.kml")

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
        "kaynak_boyut_mb": round(kml_yolu.stat().st_size / 1048576, 2),
        "toplam_yol": len(ozellikler),
        "toplam_km": round(toplam_uzunluk / 1000.0, 2),
        "bbox": [round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
        "kategoriler": kategoriler,
        "tipler": {t: {"adet": v["adet"], "uzunluk_km": round(v["uzunluk_m"] / 1000.0, 2)}
                   for t, v in sorted(tip_istatistik.items(), key=lambda x: -x[1]["uzunluk_m"])},
        "ilceler": {i: {"adet": v["adet"], "uzunluk_km": round(v["uzunluk_m"] / 1000.0, 2),
                        "durumlar": v["durumlar"]}
                    for i, v in sorted(ilce_istatistik.items(), key=lambda x: -x[1]["uzunluk_m"])},
        "ilce_verisi_var": bool(ilceler),
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
    if ilce_istatistik:
        log("  İlçe sayısı: %d" % len(ilce_istatistik))
    for u in uyarilar:
        log("  ! %s: %s" % (u["baslik"], u["mesaj"]))
    log("  " + "-" * 58)
    log("  yollar.geojson : %.2f MB" % ozet["veri_boyut_mb"])
    log("  Çıktı klasörü  : %s" % cikti_dizini)
    log("")
    return ozet


def kml_bul(veri_dizini):
    adaylar = sorted(veri_dizini.glob("*.kml")) + sorted(veri_dizini.glob("*.KML"))
    if not adaylar:
        hata("veri/ klasöründe .kml dosyası bulunamadı.\n"
             "QGIS'ten dışa aktardığınız KML dosyasını 'veri' klasörüne yükleyin.")
    tercih = [a for a in adaylar if a.name.lower() == "ibb_yollar.kml"]
    return (tercih or adaylar)[0]


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
