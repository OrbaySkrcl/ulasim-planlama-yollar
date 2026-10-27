"""Ana katmanı gerçek QGIS ile denetler.

QGIS kurulu bir makinede çalışır:
    python3 araclar/testler/ana_katman_testi.py

Denetlenen: katman açılıyor mu, gömülü stil kendiliğinden geliyor mu, Durum
açılır liste mi, ve asıl soru — bir yolun durumunu değiştirip kaydettiğinizde
dosyaya yazılıyor ve kalıcı kimlik (fid) korunuyor mu.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
KOK = Path(__file__).resolve().parents[2]
ANA = KOK / "veri" / "yollar_master.gpkg"

basarisiz = 0


def denetle(ad, deger, kosul):
    global basarisiz
    try:
        ok = bool(kosul(deger))
    except Exception:
        ok = False
    if not ok:
        basarisiz += 1
    print(("  ok   " if ok else "  HATA ") + ad + ": " + repr(deger))


def main():
    global basarisiz
    if not ANA.exists():
        print("HATA: %s yok. Önce 'python3 araclar/ana_katman.py' çalıştırın." % ANA)
        return 2
    try:
        from qgis.core import QgsApplication, QgsVectorLayer, QgsFeature
    except ImportError:
        print("QGIS Python modülü yok; bu denetim atlanıyor.")
        print("(Kurmak için: apt-get install python3-qgis)")
        return 0

    gecici = Path(tempfile.mkdtemp(prefix="ana-katman-"))
    kopya = gecici / "yollar_master.gpkg"
    shutil.copy2(ANA, kopya)

    qgs = QgsApplication([], False)
    qgs.initQgis()
    try:
        katman = QgsVectorLayer(str(kopya) + "|layername=yollar", "yollar", "ogr")
        denetle("katman açılıyor", katman.isValid(), lambda v: v is True)
        if not katman.isValid():
            return 1
        denetle("kayıt sayısı", katman.featureCount(), lambda v: v > 10000)

        alanlar = [f.name() for f in katman.fields()]
        denetle("alanlar", alanlar,
                lambda v: all(a in v for a in
                              ("durum", "tip", "ad", "aciklama", "ilce",
                               "mahalle", "uzunluk_m")))

        # Gömülü stil kendiliğinden geliyor mu?
        stil, ok = katman.loadDefaultStyle()
        r = katman.renderer()
        denetle("gömülü stil yüklendi", ok, lambda v: v is True)
        denetle("renklendirme durum alanına göre",
                (r.type(), getattr(r, "classAttribute", lambda: None)()),
                lambda v: v[0] == "categorizedSymbol" and v[1] == "durum")
        if r.type() == "categorizedSymbol":
            renkler = {k.value(): k.symbol().color().name() for k in r.categories()}
            denetle("devredilen yollar mor", renkler.get("1"),
                    lambda v: v == "#a855f7")
            denetle("kategori sayısı", len(r.categories()), lambda v: v >= 6)

        for alan in ("durum", "tip"):
            i = katman.fields().indexOf(alan)
            kur = katman.editorWidgetSetup(i)
            denetle("%s açılır liste" % alan,
                    (kur.type(), len(kur.config().get("map", []))),
                    lambda v: v[0] == "ValueMap" and v[1] >= 5)

        # Asıl soru: durumu değiştirip kaydedince dosyaya yazılıyor mu?
        ozellik = next(katman.getFeatures())
        fid = ozellik.id()
        eski = ozellik["durum"]
        yeni = "1" if eski != "1" else "5"
        katman.startEditing()
        katman.changeAttributeValue(fid, katman.fields().indexOf("durum"), yeni)
        katman.changeAttributeValue(
            katman.fields().indexOf("aciklama") and fid,
            katman.fields().indexOf("aciklama"), "deneme notu")
        kaydedildi = katman.commitChanges()
        denetle("düzenleme kaydedildi", kaydedildi, lambda v: v is True)
        if not kaydedildi:
            denetle("kaydetme hataları", katman.commitErrors(), lambda v: False)
        katman = None

        # Dosyayı yeniden açıp gerçekten yazıldığını doğrula
        tekrar = QgsVectorLayer(str(kopya) + "|layername=yollar", "y2", "ogr")
        bulunan = tekrar.getFeature(fid)
        denetle("yeni durum dosyada", (bulunan["durum"], yeni),
                lambda v: v[0] == v[1])
        denetle("kalıcı kimlik korundu", (bulunan.id(), fid), lambda v: v[0] == v[1])
        denetle("not alanı yazılabiliyor", bulunan["aciklama"],
                lambda v: v == "deneme notu")
        denetle("kayıt sayısı değişmedi", tekrar.featureCount(),
                lambda v: v > 10000)
        tekrar = None
    finally:
        qgs.exitQgis()
        shutil.rmtree(gecici, ignore_errors=True)

    print()
    print("BASARISIZ: %d" % basarisiz)
    return 1 if basarisiz else 0


if __name__ == "__main__":
    sys.exit(main())
