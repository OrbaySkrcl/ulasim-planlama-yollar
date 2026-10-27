"""Üst üste çizilmiş yol kalmadığını denetler.

Aynı yol veride birden fazla DURUM ile çizilmiş olabiliyor. Derleme bunu
gideriyor (bkz. kategoriler.json → "ustun_durum"); bu betik işin gerçekten
yapıldığını bağımsız olarak ölçer.

Kullanımı:
    python3 araclar/derle.py
    python3 araclar/testler/ortusme_denetimi.py

Çıktı: üstün durumla birebir örtüşen kilometre her kategori için 0 olmalı.
Ayrıca "iki ucu da yakın" segmentler ayrı raporlanır — bunlar birebir
olmayan ama şüpheli örtüşmelerdir; küçük bir kalıntı normaldir.
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
GJ = KOK / "_site" / "veri" / "yollar.geojson"
AYAR = KOK / "veri" / "kategoriler.json"
HUCRE = 0.00002          # ~2 m ızgara
YAKIN_M = 2.0
SUPHE_EN_AZ_M = 10.0     # bu uzunluktan kısa parçalar kavşak gürültüsü sayılır


def metre(a, b):
    return math.hypot((a[0] - b[0]) * 88000.0, (a[1] - b[1]) * 111000.0)


def parcalar(f):
    g = f["geometry"]
    return g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]


def anahtar(p, q):
    a, b = (p[0], p[1]), (q[0], q[1])
    return (a, b) if a <= b else (b, a)


def main():
    if not GJ.exists():
        print("HATA: %s yok. Önce 'python3 araclar/derle.py' çalıştırın." % GJ)
        return 2
    ustun = "1"
    if AYAR.exists():
        try:
            d = json.loads(AYAR.read_text(encoding="utf-8")).get("ustun_durum", "1")
            if d in (None, False, ""):
                print("kategoriler.json'da ustun_durum kapalı; denetim atlanıyor.")
                return 0
            ustun = str(d)
        except ValueError:
            pass

    ozellikler = json.loads(GJ.read_text(encoding="utf-8"))["features"]
    print("kayıt: %d · üstün durum: %s" % (len(ozellikler), ustun))

    segmentler = set()
    izgara = defaultdict(list)
    for f in ozellikler:
        if f["properties"]["durum"] != ustun:
            continue
        for pr in parcalar(f):
            for i, p in enumerate(pr):
                izgara[(int(p[0] / HUCRE), int(p[1] / HUCRE))].append(p)
                if i:
                    segmentler.add(anahtar(pr[i - 1], p))
    print("üstün durumun segmenti: %d" % len(segmentler))

    def yakin_mi(p):
        cx, cy = int(p[0] / HUCRE), int(p[1] / HUCRE)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in izgara.get((cx + dx, cy + dy), ()):
                    if metre(p, q) <= YAKIN_M:
                        return True
        return False

    sonuc = defaultdict(lambda: {"birebir_m": 0.0, "suphe_m": 0.0, "toplam_m": 0.0})
    for f in ozellikler:
        d = f["properties"]["durum"]
        if d == ustun:
            continue
        s = sonuc[d]
        for pr in parcalar(f):
            yk = [yakin_mi(p) for p in pr]
            for i in range(len(pr) - 1):
                m = metre(pr[i], pr[i + 1])
                s["toplam_m"] += m
                if anahtar(pr[i], pr[i + 1]) in segmentler:
                    s["birebir_m"] += m
                elif yk[i] and yk[i + 1] and m > SUPHE_EN_AZ_M:
                    s["suphe_m"] += m

    print()
    print("%-8s %14s %16s %14s" % ("durum", "birebir örtüşen", "şüpheli (yakın)", "toplam"))
    birebir = 0.0
    suphe = 0.0
    for d in sorted(sonuc):
        s = sonuc[d]
        birebir += s["birebir_m"]
        suphe += s["suphe_m"]
        print("%-8s %11.2f km %13.2f km %11.1f km"
              % (d, s["birebir_m"] / 1000, s["suphe_m"] / 1000, s["toplam_m"] / 1000))

    print()
    print("birebir örtüşen toplam : %.2f km  (0 olmalı)" % (birebir / 1000))
    print("şüpheli (birebir değil): %.2f km  (küçük bir kalıntı normaldir)"
          % (suphe / 1000))
    if birebir > 0.5:
        print("\nBAŞARISIZ: hâlâ birebir örtüşen çizgi var.")
        return 1
    print("\nGEÇTI: üstün durumla birebir örtüşen çizgi kalmadı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
