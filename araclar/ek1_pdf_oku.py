#!/usr/bin/env python3
"""EK-1 listesini taranmış Meclis kararı PDF'inden çıkarır.

    python3 araclar/ek1_pdf_oku.py karar.pdf veri/ek1_listesi.txt

DERLEMENİN PARÇASI DEĞİLDİR. derle.py yalnızca üretilen metin dosyasını
okur ve hiçbir dış bağımlılığı yoktur. Bu araç listeyi bir kez üretmek,
sonradan denetlemek ya da yeni bir karar geldiğinde yeniden türetmek içindir.

Gerekenler (yalnızca bu araç için):
    apt-get install poppler-utils tesseract-ocr tesseract-ocr-tur
    pip install Pillow

Neden bu kadar uğraş: PDF taranmış, metin katmanı yok. Tesseract'in kendi
sayfa çözümleyicisi bu tabloda satırların çoğunu atlıyor. Bu yüzden tablo
çizgilerini kendimiz buluyor, her hücreyi tek tek OCR'lıyoruz.

Çıktı her zaman gözle denetlenmelidir: OCR %100 değildir.
"""

# --------------------------------------------------------------------------
# Taranmış sayfalardan tablo okuma
# --------------------------------------------------------------------------

import difflib
import io as _io
import math
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

from PIL import Image

KOYU = 175          # bu degerin altindaki piksel "koyu"
ORNEK = 3           # her 3 pikselde bir ornekle (hiz)


def _birlestir(cizgi, en_az=15):
    """Birbirine cok yakin cizgileri tek cizgi say."""
    out = []
    for v in cizgi:
        if out and v - out[-1] < en_az:
            out[-1] = (out[-1] + v) // 2
        else:
            out.append(v)
    return out


def _en_uzun_kosu(px, y, x0, x1, bosluk=8):
    """y satirindaki en uzun kesintisiz koyu dizinin uzunlugu (piksel).

    Metin satiri da cok koyu piksel icerir; ayiran sey sureklilik.
    """
    en_iyi = simdi = bos = 0
    bas = None
    for x in range(x0, x1, ORNEK):
        if px[x, y] < KOYU:
            if bas is None:
                bas = x
            bos = 0
            simdi = x - bas
        else:
            bos += 1
            if bos > bosluk:
                en_iyi = max(en_iyi, simdi)
                bas, simdi, bos = None, 0, 0
    return max(en_iyi, simdi)


def dikey_cizgiler(px, w, y0, y1, esik=0.55):
    """Verilen y araliginda dikey cizgilerin x degerleri."""
    n = (y1 - y0) // ORNEK
    out = []
    x = 0
    while x < w:
        if sum(1 for y in range(y0, y1, ORNEK) if px[x, y] < KOYU) > n * esik:
            bas = x
            while x < w and sum(1 for y in range(y0, y1, ORNEK)
                                if px[x, y] < KOYU) > n * esik:
                x += 1
            out.append((bas + x) // 2)
        x += 1
    return _birlestir(out)


PENCERELER = [(0.30, 0.44), (0.50, 0.64), (0.68, 0.82)]


def sutunlar(px, w, h):
    """(sol kenar, sutun ayraci, sag kenar) ya da None."""
    bulgu = []
    for a, b in PENCERELER:
        d = [x for x in dikey_cizgiler(px, w, int(h * a), int(h * b))
             if 100 < x < w - 100]
        if len(d) >= 3:
            bulgu.append((d[0], d[len(d) // 2], d[-1]))
    if not bulgu:
        return None
    orta = lambda i: sorted(x[i] for x in bulgu)[len(bulgu) // 2]  # noqa: E731
    sol, ayrac, sag = orta(0), orta(1), orta(2)
    if not (sol + 0.3 * (sag - sol) < ayrac < sol + 0.8 * (sag - sol)):
        ayrac = sol + int((sag - sol) * 0.62)
    return sol, ayrac, sag


def yatay_cizgiler(px, h, ayrac, sag, esik=0.70):
    """Tablo yatay kurallari — sag sutunda aranir."""
    genislik = sag - ayrac - 20
    out = []
    y = 0
    while y < h:
        if _en_uzun_kosu(px, y, ayrac + 10, sag - 10) > genislik * esik:
            bas = y
            while y < h and _en_uzun_kosu(px, y, ayrac + 10,
                                          sag - 10) > genislik * esik:
                y += 1
            out.append((bas + y) // 2)
        y += 1
    return _birlestir(out)


def egrilik_duzelt(im):
    """Taramanin egriligini sol dikey cizginin kaymasindan bulup duzeltir."""
    px, (w, h) = im.load(), im.size
    nokta = []
    for a, b in ((0.30, 0.44), (0.68, 0.82)):
        y0, y1 = int(h * a), int(h * b)
        d = [x for x in dikey_cizgiler(px, w, y0, y1) if 100 < x < w - 100]
        if d:
            nokta.append(((y0 + y1) / 2, d[0]))
    if len(nokta) < 2:
        return im
    (ya, xa), (yb, xb) = nokta
    aci = math.degrees(math.atan2(xb - xa, yb - ya))
    if abs(aci) < 0.05 or abs(aci) > 3:
        return im

    def kural_sayisi(resim):
        p = resim.load()
        s = sutunlar(p, w, h)
        return len(yatay_cizgiler(p, h, s[1], s[2])) if s else 0

    adaylar = []
    for a in (0.0, -aci, aci):
        r = im if a == 0.0 else im.rotate(a, resample=Image.BILINEAR,
                                          fillcolor=255)
        adaylar.append((kural_sayisi(r), a, r))
    adaylar.sort(key=lambda t: t[0], reverse=True)
    return adaylar[0][2]


def ocr(im, gecici, psm="7"):
    im.save(gecici)
    sonuc = subprocess.run(
        ["tesseract", str(gecici), "stdout", "-l", "tur", "--psm", psm],
        capture_output=True, text=True)
    return " ".join(sonuc.stdout.split())


def sayfa_isle(yol, gecici):
    im = egrilik_duzelt(Image.open(yol).convert("L"))
    px, (w, h) = im.load(), im.size
    s = sutunlar(px, w, h)
    if not s:
        return []
    sol, ayrac, sag = s
    yatay = yatay_cizgiler(px, h, ayrac, sag)
    satirlar = []
    for ust, alt in zip(yatay, yatay[1:]):
        if alt - ust < 30:
            continue
        psm = "7" if alt - ust < 95 else "6"
        adi = ocr(im.crop((sol + 16, ust + 7, ayrac - 16, alt - 7)),
                  gecici, psm)
        gen = ocr(im.crop((ayrac + 16, ust + 7, sag - 16, alt - 7)),
                  gecici, psm)
        if adi or gen:
            satirlar.append((adi, gen))
    return satirlar



# --------------------------------------------------------------------------
# OCR çıktısını ilçe + yol adı listesine çevirme
# --------------------------------------------------------------------------

ILCELER = ["ALİAĞA", "BALÇOVA", "BAYINDIR", "BAYRAKLI", "BERGAMA", "BEYDAĞ",
           "BORNOVA", "BUCA", "ÇEŞME", "ÇİĞLİ", "DİKİLİ", "FOÇA", "GAZİEMİR",
           "GÜZELBAHÇE", "KARABAĞLAR", "KARABURUN", "KARŞIYAKA", "KEMALPAŞA",
           "KINIK", "KİRAZ", "KONAK", "MENDERES", "MENEMEN", "NARLIDERE",
           "ÖDEMİŞ", "SEFERİHİSAR", "SELÇUK", "TİRE", "TORBALI", "URLA"]

DUZGUN = {"ALİAĞA": "Aliağa", "BALÇOVA": "Balçova", "BAYINDIR": "Bayındır",
          "BAYRAKLI": "Bayraklı", "BERGAMA": "Bergama", "BEYDAĞ": "Beydağ",
          "BORNOVA": "Bornova", "BUCA": "Buca", "ÇEŞME": "Çeşme",
          "ÇİĞLİ": "Çiğli", "DİKİLİ": "Dikili", "FOÇA": "Foça",
          "GAZİEMİR": "Gaziemir", "GÜZELBAHÇE": "Güzelbahçe",
          "KARABAĞLAR": "Karabağlar", "KARABURUN": "Karaburun",
          "KARŞIYAKA": "Karşıyaka", "KEMALPAŞA": "Kemalpaşa",
          "KINIK": "Kınık", "KİRAZ": "Kiraz", "KONAK": "Konak",
          "MENDERES": "Menderes", "MENEMEN": "Menemen",
          "NARLIDERE": "Narlıdere", "ÖDEMİŞ": "Ödemiş",
          "SEFERİHİSAR": "Seferihisar", "SELÇUK": "Selçuk", "TİRE": "Tire",
          "TORBALI": "Torbalı", "URLA": "Urla"}


def sade(m):
    m = m.replace("İ", "i").replace("I", "ı").lower()
    m = unicodedata.normalize("NFKD", m)
    m = "".join(c for c in m if not unicodedata.combining(c))
    for a, b in (("ı", "i"), ("ş", "s"), ("ğ", "g"), ("ç", "c"), ("ö", "o"),
                 ("ü", "u")):
        m = m.replace(a, b)
    return re.sub(r"[^a-z0-9]+", " ", m).strip()


ILCE_SADE = {sade(i): i for i in ILCELER}


def ilce_mi(ad, genislik):
    """Baslik satiri mi? Sag hucre 'IMAR DURUMU' diyorsa evet."""
    if "DURUMU" not in genislik.upper() and "METRE" not in genislik.upper():
        return None
    s = sade(ad)
    if s in ILCE_SADE:
        return ILCE_SADE[s]
    yakin = difflib.get_close_matches(s, list(ILCE_SADE), n=1, cutoff=0.7)
    return ILCE_SADE[yakin[0]] if yakin else None


COP = re.compile(r"(İZMİR BÜYÜKŞEHİR|MEVCUT LİSTE|İMAR DURUMU|Meclisin|"
                 r"sayılı karar|SORUMLULU)", re.IGNORECASE)


def ad_temizle(m):
    m = m.strip()
    # Satir sonundaki/basindaki tablo cizgisi artiklarini at
    m = re.sub(r"^[^0-9A-ZÇĞİÖŞÜ]+", "", m)
    m = re.sub(r"\s+[|—\-–_.,;:]+\s*$", "", m)
    # Sonda kalan tek-iki harflik anlamsiz kuyruklar (cizgi artigi)
    while True:
        y = re.sub(r"\s+(?:[a-zçğıöşü]{1,3}|[A-Za-z]\s*[.,|]|[|_—–]+)$", "", m)
        if y == m:
            break
        m = y
    return " ".join(m.split())


# --------------------------------------------------------------------------
# Liste dosyasını yazma
# --------------------------------------------------------------------------

ANAHTAR = re.compile(r"SOKAK|SOKAĞ|CADDE|BULVAR|MEYDAN|YOL|ANAYOL|BÖLGES|"
                     r"ASFALT|KÖPRÜ|KAVŞAK")
GENISLIK_OK = re.compile(r"^(-|[0-9][0-9,\.\s\-–/]*)$")

# Meclis kararinin metninde EK-1'e EKLENEN, ekteki tabloda henuz yer almayan
# yollar (Konak, Tarihi Kemeralti Bolgesi).
KARAR_EKLERI = [
    ("Konak", "HAVRA SOKAĞI", ""),
    ("Konak", "920 SOKAK", ""),
    ("Konak", "926 SOKAK", ""),
    ("Konak", "937 SOKAK", ""),
]

BASLIK = """\
# EK-1 LİSTESİ — Büyükşehir sorumluluğundaki yollar ve meydanlar (17 m+)
#
# Kaynak: İzmir Büyükşehir Belediye Meclisi'nin 10.03.2021 tarih ve 05.251
# sayılı kararı eki "İzmir Büyükşehir Belediyesi Sorumluluğunda Kalan Yollar
# ve Meydanlar Listesi".
#
# Bu yollar MECLİS KARARIYLA alınmıştır, yani zaten Büyükşehir'dedir.
# genis_yollar.xlsx'teki mavi satırlar ise "onaylanırsa geçecek" yollardır.
# İkisi aynı çalışmanın parçasıdır ama haritada ayrı renkte gösterilir.
#
# ---------------------------------------------------------------------------
# BİÇİM:  İlçe ; Yol adı ; imar genişliği (metre)
#
#   Üçüncü alan yalnızca bilgi içindir, eşleştirmeyi etkilemez.
#   "#" ile başlayan satırlar nottur.
#
# YENİ YOL EKLEMEK:  Uygun ilçenin altına bir satır yazın.
# YOLU ÇIKARMAK:     Satırın başına "#" koyun (geçmişi kaybetmezsiniz).
# YANLIŞ ÇİZGİ:      veri/genis_yollar_duzeltme.txt dosyasını kullanın;
#                    kurallar bu listeye de uygulanır.
#
# Meydanların ve bölgelerin haritada çizgisi yoktur; listede dururlar ama
# eşleştirmeye girmezler.
# ---------------------------------------------------------------------------
"""


# --------------------------------------------------------------------------
# Akış
# --------------------------------------------------------------------------
def sayfalari_cevir(pdf, dizin, ilk, son, dpi=300):
    """PDF sayfalarını PNG'ye çevirir (pdftoppm)."""
    subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", "-png",
                    "-f", str(ilk), "-l", str(son), str(pdf),
                    str(dizin / "s")], check=True)
    return sorted(dizin.glob("s-*.png"))


def satirlari_coz(ham_satirlar):
    """(ad, genişlik) çiftlerinden ilçe + yol kayıtları üretir."""
    kayitlar, ilce, atlanan = [], None, []
    for adi, gen in ham_satirlar:
        yeni = ilce_mi(adi, gen)
        if yeni:
            ilce = yeni
            continue
        if COP.search(adi) or COP.search(gen) or ilce is None:
            atlanan.append((adi, gen))
            continue
        temiz = ad_temizle(adi)
        if sum(1 for c in temiz if c.isalnum()) < 4:
            atlanan.append((adi, gen))
            continue
        govde_ = re.sub(r"\([^)]*\)?", " ", temiz)
        alfa = sum(1 for c in govde_ if c.isalpha())
        buyuk = sum(1 for c in govde_ if c.isalpha() and c == c.upper())
        if alfa and buyuk / alfa < 0.6:
            atlanan.append((adi, gen))
            continue
        if not ANAHTAR.search(temiz):
            atlanan.append((adi, gen))      # sayfa alt kenarı vb.
            continue
        # Sağ hücre OCR'da sık bozuluyor; sayıya benzemiyorsa boş bırak.
        if gen and not GENISLIK_OK.match(gen):
            gen = ""
        kayitlar.append((DUZGUN[ilce], temiz, gen))
    return kayitlar, atlanan


def dosyayi_yaz(kayitlar, cikti):
    mevcut = {(i, re.sub(r"\s+", " ", a.upper())) for i, a, _ in kayitlar}
    eklenen = [k for k in KARAR_EKLERI if (k[0], k[1]) not in mevcut]
    with _io.open(str(cikti), "w", encoding="utf-8", newline="\n") as f:
        f.write(BASLIK)
        onceki = None
        for ilce, ad, gen in kayitlar:
            if ilce != onceki:
                f.write("\n# --- %s ---\n" % ilce)
                onceki = ilce
            f.write("%s ; %s%s\n" % (ilce, ad, (" ; " + gen) if gen else ""))
        if eklenen:
            f.write("\n# --- Karar metniyle EK-1'e eklenenler ---\n")
            for ilce, ad, _g in eklenen:
                f.write("%s ; %s\n" % (ilce, ad))
    return len(eklenen)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    pdf, cikti = Path(sys.argv[1]), Path(sys.argv[2])
    ilk = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    son = int(sys.argv[4]) if len(sys.argv) > 4 else 20
    for arac in ("pdftoppm", "tesseract"):
        if not shutil.which(arac):
            print("Eksik araç: %s — başlıktaki kurulum satırına bakın." % arac)
            return 2
    gecici_kok = Path(tempfile.mkdtemp(prefix="ek1_"))
    try:
        sayfalar = sayfalari_cevir(pdf, gecici_kok, ilk, son)
        print("%d sayfa çevrildi" % len(sayfalar), file=sys.stderr)
        ham = []
        for yol in sayfalar:
            satirlar = sayfa_isle(yol, gecici_kok / "_hucre.png")
            print("  %s: %d satır" % (yol.name, len(satirlar)), file=sys.stderr)
            ham += satirlar
        kayitlar, atlanan = satirlari_coz(ham)
        ek = dosyayi_yaz(kayitlar, cikti)
    finally:
        shutil.rmtree(gecici_kok, ignore_errors=True)
    print("\n%s: %d kayıt (+%d karar eki), %d satır atlandı."
          % (cikti, len(kayitlar), ek, len(atlanan)))
    print("OCR kusursuz değildir: çıktıyı gözden geçirin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
