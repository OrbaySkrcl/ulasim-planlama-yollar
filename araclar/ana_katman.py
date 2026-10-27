#!/usr/bin/env python3
"""Ana katmanı üretir/tazeler: veri/yollar_master.gpkg

Bu, QGIS'te doğrudan düzenlediğiniz dosyadır. Dışa aktarma, dissolve, KML
dönüşümü yok: açın, yolları seçin, Durum'u değiştirin, kaydedin, yükleyin.

    python3 araclar/ana_katman.py

İlk çalıştırmada veri/ klasöründeki kaynaktan (KML/zip/GeoJSON) temizlenmiş ana
katmanı üretir:
  - Birleşik (dissolve) kayıtlar birbirine bağlı yollara ayrılır
  - Üst üste çizilmiş yollar ayıklanır (bkz. kategoriler.json → ustun_durum)
  - Her yola kalıcı bir kimlik (fid) verilir
  - QGIS stili dosyanın içine gömülür: renkler sitedekiyle aynı, Durum açılır liste

Dosya zaten varsa, **düzenlemelerinize dokunmadan** yalnızca otomatik alanları
(ilçe, mahalle, uzunluk) yeniden hesaplar ve stili tazeler.

ÖNEMLİ: Bu dosyayı QGIS'te "Farklı Kaydet" ile dışa aktarmayın; yerinde
düzenleyin. Dışa aktarım kalıcı kimlikleri (fid) yeniden numaralandırır.
"""
import argparse
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("derle", KOK / "araclar" / "derle.py")
derle = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(derle)
sys.path.insert(0, str(KOK / "araclar"))
from qgis_stili import qml_uret                                   # noqa: E402

ANA_KATMAN = "yollar"
ALANLAR = ("durum", "tip", "ad", "aciklama", "ilce", "mahalle", "uzunluk_m")


def log(m=""):
    print("  " + m if m else "")


def _stil_tablosu(c, katman, qml):
    """QGIS stilini dosyanın içine gömer (layer_styles tablosu)."""
    c.execute("""CREATE TABLE IF NOT EXISTS layer_styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        f_table_catalog TEXT, f_table_schema TEXT, f_table_name TEXT,
        f_geometry_column TEXT, styleName TEXT, styleQML TEXT, styleSLD TEXT,
        useAsDefault BOOLEAN, description TEXT, owner TEXT, ui TEXT,
        update_time DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))""")
    c.execute("DELETE FROM layer_styles WHERE f_table_name = ?", (katman,))
    c.execute("INSERT INTO layer_styles (f_table_catalog, f_table_schema, "
              "f_table_name, f_geometry_column, styleName, styleQML, styleSLD, "
              "useAsDefault, description, owner, ui) "
              "VALUES ('', '', ?, 'geom', ?, ?, NULL, 1, ?, '', NULL)",
              (katman, "Devir haritası",
               qml, "Renkler ve açılır listeler kategoriler.json'dan üretilir."))


def gpkg_kur(hedef, satirlar, qml, katman=ANA_KATMAN):
    """Ana katmanı GeoPackage olarak yazar. satirlar: (fid, parcalar, {alan: deger})"""
    if hedef.exists():
        hedef.unlink()
    baglanti = sqlite3.connect(str(hedef))
    try:
        c = baglanti.cursor()
        c.execute("PRAGMA application_id = 1196444487")
        c.execute("PRAGMA user_version = 10200")
        c.execute("PRAGMA journal_mode = MEMORY")
        c.execute("PRAGMA synchronous = OFF")

        c.execute("""CREATE TABLE gpkg_spatial_ref_sys (
            srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY,
            organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
            definition TEXT NOT NULL, description TEXT)""")
        c.executemany("INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)",
                      [("Undefined cartesian SRS", -1, "NONE", -1, "undefined", ""),
                       ("Undefined geographic SRS", 0, "NONE", 0, "undefined", ""),
                       ("WGS 84 geodetic", 4326, "EPSG", 4326, derle._WGS84_WKT,
                        "longitude/latitude coordinates in decimal degrees")])
        c.execute("""CREATE TABLE gpkg_contents (
            table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL,
            identifier TEXT UNIQUE, description TEXT DEFAULT '',
            last_change DATETIME NOT NULL
                DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)""")
        c.execute("""CREATE TABLE gpkg_geometry_columns (
            table_name TEXT NOT NULL, column_name TEXT NOT NULL,
            geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
            z TINYINT NOT NULL, m TINYINT NOT NULL,
            CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
            CONSTRAINT uk_gc_table_name UNIQUE (table_name))""")
        c.execute("""CREATE TABLE gpkg_extensions (
            table_name TEXT, column_name TEXT, extension_name TEXT NOT NULL,
            definition TEXT NOT NULL, scope TEXT NOT NULL,
            CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name))""")

        c.execute('CREATE TABLE "%s" (fid INTEGER PRIMARY KEY AUTOINCREMENT, '
                  "geom MULTILINESTRING, durum TEXT, tip TEXT, ad TEXT, "
                  "aciklama TEXT, ilce TEXT, mahalle TEXT, uzunluk_m REAL)"
                  % katman)

        minx = miny = 1e30
        maxx = maxy = -1e30
        kutular = []

        def uret():
            nonlocal minx, miny, maxx, maxy
            for fid, parcalar, oz in satirlar:
                blob, kutu = derle._gpkg_geometri(parcalar)
                kutular.append((fid, kutu[0], kutu[1], kutu[2], kutu[3]))
                minx = min(minx, kutu[0]); maxx = max(maxx, kutu[1])
                miny = min(miny, kutu[2]); maxy = max(maxy, kutu[3])
                yield (fid, blob) + tuple(oz.get(a) for a in ALANLAR)

        c.executemany('INSERT INTO "%s" (fid, geom, %s) VALUES (?,?,%s)'
                      % (katman, ", ".join(ALANLAR), ",".join("?" * len(ALANLAR))),
                      uret())

        c.execute("INSERT INTO gpkg_contents (table_name, data_type, identifier, "
                  "description, min_x, min_y, max_x, max_y, srs_id) "
                  "VALUES (?,?,?,?,?,?,?,?,?)",
                  (katman, "features", katman,
                   "Izmir yol devir calismasi - ana katman",
                   minx, miny, maxx, maxy, 4326))
        c.execute("INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,?,?)",
                  (katman, "geom", "MULTILINESTRING", 4326, 0, 0))
        try:
            c.execute('CREATE VIRTUAL TABLE "rtree_%s_geom" USING rtree('
                      "id, minx, maxx, miny, maxy)" % katman)
            c.executemany('INSERT INTO "rtree_%s_geom" VALUES (?,?,?,?,?)' % katman,
                          kutular)
            c.execute("INSERT INTO gpkg_extensions VALUES (?,?,?,?,?)",
                      (katman, "geom", "gpkg_rtree_index",
                       "http://www.geopackage.org/spec120/#extension_rtree",
                       "write-only"))
            for sql in derle._gpkg_rtree_tetikleyicileri(katman):
                c.execute(sql)
        except sqlite3.Error as e:
            log("Uyarı: mekânsal indeks oluşturulamadı (%s)." % e)

        _stil_tablosu(c, katman, qml)
        baglanti.commit()
        c.execute("ANALYZE")
        baglanti.commit()
    finally:
        baglanti.close()
    return hedef.stat().st_size


def mevcut_oku(yol):
    """Var olan ana katmanı okur: fid, parçalar ve kullanıcının girdiği alanlar."""
    baglanti = sqlite3.connect("file:%s?mode=ro" % yol, uri=True)
    try:
        c = baglanti.cursor()
        katman = c.execute("SELECT table_name FROM gpkg_geometry_columns "
                           "LIMIT 1").fetchone()[0]
        sutunlar = [r[1] for r in c.execute('PRAGMA table_info("%s")' % katman)]
        elde = [a for a in ("durum", "tip", "ad", "aciklama") if a in sutunlar]
        c.execute('SELECT fid, geom, %s FROM "%s" ORDER BY fid'
                  % (", ".join('"%s"' % a for a in elde), katman))
        kayitlar = []
        for satir in c:
            parcalar = derle.gpkg_geometri_coz(satir[1])
            if not parcalar:
                continue
            oz = {a: satir[2 + i] for i, a in enumerate(elde)}
            kayitlar.append((satir[0], parcalar, oz))
        return kayitlar
    finally:
        baglanti.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--yeniden", action="store_true",
                    help="Var olan ana katmanı yok sayıp kaynaktan baştan üret "
                         "(DİKKAT: elle yaptığınız düzenlemeler kaybolur)")
    a = ap.parse_args()

    veri = KOK / "veri"
    hedef = veri / "yollar_master.gpkg"
    ayar = {}
    ayar_yolu = veri / "kategoriler.json"
    if ayar_yolu.exists():
        ayar = json.loads(ayar_yolu.read_text(encoding="utf-8"))
    kategoriler = ayar.get("kategoriler", {})
    tipler = {k: v for k, v in (ayar.get("yol_tipleri") or {}).items()
              if not k.startswith("_")}

    log("")
    log("Ana katman: %s" % hedef.name)
    log("-" * 58)

    tazeleme = hedef.exists() and not a.yeniden
    if tazeleme:
        log("Var olan ana katman tazeleniyor (düzenlemeleriniz korunur).")
        satirlar = mevcut_oku(hedef)
        log("%d yol okundu." % len(satirlar))
    else:
        if hedef.exists():
            log("--yeniden verildi: ana katman kaynaktan BAŞTAN üretiliyor.")
        kaynak = derle.kml_bul(veri, gpkg_haric=True)
        kayitlar, _bos = derle.kml_oku(kaynak)

        ustun = ayar.get("ustun_durum", "1")
        if ustun not in (None, False, ""):
            kayitlar, rapor = derle.ustun_durum_ayikla(kayitlar, str(ustun))
            if rapor:
                km = sum(r["silinen_m"] for r in rapor.values()) / 1000.0
                log("Çakışma giderildi: %.1f km (DURUM %s üstün)." % (km, ustun))
        if ayar.get("yollari_ayir", True):
            onceki = len(kayitlar)
            kayitlar, ayrilan = derle.kayitlari_ayir(kayitlar)
            if ayrilan:
                log("Birleşik kayıt ayrıldı: %d → %d yol." % (onceki, len(kayitlar)))

        satirlar = []
        for i, k in enumerate(kayitlar, 1):
            oz = k["ozellik"]
            satirlar.append((i, k["parcalar"], {
                "durum": (oz.get("DURUM") or "").strip() or "0",
                "tip": (oz.get("TIP1") or "").strip(),
                "ad": (oz.get("ADINUMARASI") or "").strip(),
                "aciklama": None}))
        log("%d yola kalıcı kimlik verildi." % len(satirlar))

    # Türetilmiş alanlar her seferinde yeniden hesaplanır
    ornek = [tuple(p[len(p) // 2]) for _f, pr, _o in satirlar for p in pr]
    adim = max(1, len(ornek) // 600)
    ilceler, _ = derle.sinir_yukle(veri / "ilce_sinirlari.geojson",
                                   ornek[::adim], "İlçe")
    mahalleler, _ = derle.sinir_yukle(veri / "mahalle_sinirlari.geojson",
                                      ornek[::adim], "Mahalle")
    if mahalleler:
        mahalleler, _ust, _kisa = derle.benzersiz_adlar(
            mahalleler, derle.SinirIndeksi(ilceler) if ilceler else None)
    ilce_indeks = derle.SinirIndeksi(ilceler) if ilceler else None
    mahalle_indeks = derle.SinirIndeksi(mahalleler) if mahalleler else None

    toplam_m = 0.0
    for _fid, parcalar, oz in satirlar:
        uzunluk = sum(derle.cizgi_uzunlugu(p) for p in parcalar)
        toplam_m += uzunluk
        oz["uzunluk_m"] = round(uzunluk, 1)
        oz["ilce"] = (derle.baskin_alan(ilce_indeks, parcalar, uzunluk)
                      if ilce_indeks else None) or None
        oz["mahalle"] = (derle.baskin_alan(mahalle_indeks, parcalar, uzunluk)
                         if mahalle_indeks else None) or None

    qml = qml_uret(kategoriler, tipler)
    boyut = gpkg_kur(hedef, satirlar, qml)

    dagilim = {}
    for _fid, _pr, oz in satirlar:
        d = dagilim.setdefault(oz.get("durum") or "", [0, 0.0])
        d[0] += 1
        d[1] += oz.get("uzunluk_m") or 0.0
    log("")
    log("Durum dağılımı:")
    for kod in sorted(dagilim, key=lambda k: (kategoriler.get(k, {}).get("sira", 999), k)):
        adet, m = dagilim[kod]
        ad = kategoriler.get(kod, {}).get("ad", "Tanımsız kod %s" % kod)
        log("  %-3s %-38s %6d yol  %10.1f km" % (kod, ad[:38], adet, m / 1000))
    log("")
    log("Toplam %d yol, %.1f km → %.2f MB" % (len(satirlar), toplam_m / 1000,
                                              boyut / 1048576))
    log("")
    log("Sırada: bu dosyayı QGIS'te açın (sürükleyip bırakmanız yeter).")
    log("Renkler ve Durum açılır listesi hazır gelir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
