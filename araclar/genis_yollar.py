"""Geniş yollar (17 m+) listesini Excel'den okur — ayrı bir proje, ayrı katman.

Bu dosya, "Yol Sorumluluğu Tespiti" Excel listesindeki **mavi** satırları
(ileride onaylanırsa Büyükşehir sorumluluğuna geçecek yollar) ana yol ağıyla
eşleştirir. Ana projenin DURUM kategorileriyle hiçbir ilgisi yoktur ve
toplam kilometreye karışmaz.

Excel'i okumak için dış kütüphane kullanılmaz: .xlsx zaten bir zip içinde XML.
Böylece GitHub'daki derleme ek kurulum gerektirmez.

Renk tanıma tema indeksine bağlı değildir: hücrenin rengi gerçek RGB'ye
indirgenir (tema rengi + tint hesaplanarak), sonra "mavi mi" diye bakılır.
Böylece liste başka bir programda kaydedilse de çalışır.
"""
import re
import unicodedata
import zipfile
from xml.etree import ElementTree as ET

AD_ALANI = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CIZIM_ALANI = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

# Tema renk sırası (openpyxl ile aynı): 0=lt1, 1=dk1, 2=lt2, 3=dk2, 4=accent1 …
TEMA_SIRASI = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3",
               "accent4", "accent5", "accent6", "hlink", "folHlink"]

# Excel'in standart 56 renk paleti (indexed renkler için gereken kısmı)
INDEKSLI = {0: "000000", 1: "FFFFFF", 2: "FF0000", 3: "00FF00", 4: "0000FF",
            5: "FFFF00", 6: "FF00FF", 7: "00FFFF", 8: "000000", 9: "FFFFFF",
            64: "000000", 65: "FFFFFF"}


def _etiket(e):
    return e.tag.split("}")[-1]


def _tint_uygula(hex6, tint):
    """Excel tint: pozitif açar, negatif koyultur."""
    r, g, b = (int(hex6[i:i + 2], 16) for i in (0, 2, 4))

    def d(k):
        if tint > 0:
            return int(round(k * (1 - tint) + 255 * tint))
        return int(round(k * (1 + tint)))
    return "%02X%02X%02X" % (d(r), d(g), d(b))


def _tema_paleti(zf):
    ad = [n for n in zf.namelist() if n.endswith("theme1.xml")]
    if not ad:
        return {}
    kok = ET.fromstring(zf.read(ad[0]))
    sema = kok.find(".//" + CIZIM_ALANI + "clrScheme")
    if sema is None:
        return {}
    palet = {}
    for cocuk in sema:
        ad_renk = _etiket(cocuk)
        srgb = cocuk.find(CIZIM_ALANI + "srgbClr")
        sysc = cocuk.find(CIZIM_ALANI + "sysClr")
        if srgb is not None and srgb.get("val"):
            palet[ad_renk] = srgb.get("val").upper()
        elif sysc is not None and sysc.get("lastClr"):
            palet[ad_renk] = sysc.get("lastClr").upper()
    return palet


def _dolgu_renkleri(zf, palet):
    """styles.xml → stil indeksi başına '#RRGGBB' (dolgu yoksa None)."""
    try:
        kok = ET.fromstring(zf.read("xl/styles.xml"))
    except KeyError:
        return []
    dolgular = []
    dolgu_kok = kok.find(AD_ALANI + "fills")
    for dolgu in (dolgu_kok if dolgu_kok is not None else []):
        desen = dolgu.find(AD_ALANI + "patternFill")
        if desen is None or desen.get("patternType") in (None, "none"):
            dolgular.append(None)
            continue
        on = desen.find(AD_ALANI + "fgColor")
        if on is None:
            dolgular.append(None)
            continue
        hex6 = None
        if on.get("rgb"):
            ham = on.get("rgb").upper()
            hex6 = ham[-6:]                       # ARGB ise alfayı at
        elif on.get("theme") is not None:
            try:
                i = int(on.get("theme"))
            except ValueError:
                i = -1
            if 0 <= i < len(TEMA_SIRASI):
                temel = palet.get(TEMA_SIRASI[i])
                if temel:
                    hex6 = _tint_uygula(temel, float(on.get("tint") or 0))
        elif on.get("indexed") is not None:
            try:
                hex6 = INDEKSLI.get(int(on.get("indexed")))
            except ValueError:
                hex6 = None
        dolgular.append("#" + hex6 if hex6 else None)

    stiller = []
    xf_kok = kok.find(AD_ALANI + "cellXfs")
    for xf in (xf_kok if xf_kok is not None else []):
        try:
            i = int(xf.get("fillId") or 0)
        except ValueError:
            i = 0
        stiller.append(dolgular[i] if 0 <= i < len(dolgular) else None)
    return stiller


def _paylasilan_metinler(zf):
    try:
        kok = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    metinler = []
    for si in kok:
        metinler.append("".join(t.text or "" for t in si.iter(AD_ALANI + "t")))
    return metinler


def _ilk_sayfa_yolu(zf):
    adlar = sorted(n for n in zf.namelist()
                   if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    return adlar[0] if adlar else None


def _sutun(ref):
    """'B12' -> 2"""
    harf = "".join(c for c in (ref or "") if c.isalpha())
    n = 0
    for c in harf:
        n = n * 26 + (ord(c.upper()) - 64)
    return n


def satirlari_oku(yol):
    """[(satir_no, {sutun: (metin, '#RRGGBB' | None)})] döndürür."""
    with zipfile.ZipFile(str(yol)) as zf:
        palet = _tema_paleti(zf)
        stiller = _dolgu_renkleri(zf, palet)
        metinler = _paylasilan_metinler(zf)
        sayfa = _ilk_sayfa_yolu(zf)
        if not sayfa:
            return []
        kok = ET.fromstring(zf.read(sayfa))

    sonuc = []
    for satir in kok.iter(AD_ALANI + "row"):
        try:
            no = int(satir.get("r") or 0)
        except ValueError:
            continue
        hucreler = {}
        for h in satir:
            if _etiket(h) != "c":
                continue
            s = _sutun(h.get("r"))
            tip = h.get("t")
            if tip == "inlineStr":
                deger = "".join(t.text or "" for t in h.iter(AD_ALANI + "t"))
            else:
                v = h.find(AD_ALANI + "v")
                ham = v.text if v is not None else None
                if ham is None:
                    deger = ""
                elif tip == "s":
                    try:
                        deger = metinler[int(ham)]
                    except (ValueError, IndexError):
                        deger = ""
                else:
                    deger = ham
            try:
                stil = int(h.get("s") or 0)
            except ValueError:
                stil = 0
            renk = stiller[stil] if 0 <= stil < len(stiller) else None
            hucreler[s] = ((deger or "").strip(), renk)
        if hucreler:
            sonuc.append((no, hucreler))
    return sonuc


def mavi_mi(hex_renk):
    """Mavi tonu mu? Kırmızı/turuncu/beyaz/gri elenir."""
    if not hex_renk or len(hex_renk) != 7:
        return None
    r, g, b = (int(hex_renk[i:i + 2], 16) for i in (1, 3, 5))
    if not (b > r + 20 and b > g + 20):
        return None
    # Parlaklık: açık mavi mi koyu mavi mi
    parlaklik = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    return "acik" if parlaklik >= 0.6 else "koyu"


# --------------------------------------------------------------------------
# Ad normalleştirme — ana katmanda ad "ABDİ İPEKÇİ", tip ayrı alanda
# --------------------------------------------------------------------------
TIP_SONEKLERI = ("CADDESI", "CADDE", "CAD", "BULVARI", "BULVAR", "BLV",
                 "MEYDANI", "MEYDAN", "SOKAGI", "SOKAK", "SOK", "SK",
                 "CIKMAZI", "CIKMAZ", "YOLU", "YOL", "ASFALTI")


def sade(metin):
    """Türkçe duyarsız, noktalama atılmış anahtar."""
    s = (metin or "").strip().upper()
    for a, b in (("İ", "I"), ("Ş", "S"), ("Ğ", "G"), ("Ü", "U"),
                 ("Ö", "O"), ("Ç", "C"), ("Â", "A"), ("Î", "I"), ("Û", "U")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def govde(metin, sonek_at=True):
    """'PLAJ CADDESİ (120 SOKAK BAĞLANTISI)' -> 'PLAJ'"""
    s = re.sub(r"\(.*?\)", " ", metin or "", flags=re.S)
    s = s.split("\n")[0]
    # '1580SOKAK' gibi bitişik yazımları ayır
    s = re.sub(r"(?i)(\d)(SOKAK|CADDE|CADDESI|BULVAR)", r"\1 \2", s)
    k = sade(s)
    if not sonek_at:
        return k
    degisti = True
    while degisti:
        degisti = False
        for son in TIP_SONEKLERI:
            if k.endswith(" " + son):
                k = k[: -(len(son) + 1)].strip()
                degisti = True
                break
            if k == son:
                return ""
    return k


def duzeltmeleri_oku(yol):
    """veri/genis_yollar_duzeltme.txt dosyasini okur.

    Excel'de geometri olmadigi icin ayni adi tasiyan birden fazla yol varsa
    hepsi eslesir. Bu dosya o yanlis eslesmeleri elle duzeltmeye yarar.

    Donus: {"cikar_fid": {...}, "kurallar": [{"ilce","govde","yalniz","haric"}]}
    """
    sonuc = {"cikar_fid": set(), "kurallar": [], "hatali": []}
    if not yol or not yol.exists():
        return sonuc
    for no, satir in enumerate(yol.read_text(encoding="utf-8").splitlines(), 1):
        ham = satir.strip()
        if not ham or ham.startswith("#"):
            continue
        dusuk = sade(ham)
        # "cikar: 53089"  /  "çıkar: 53089"
        if dusuk.startswith("CIKAR "):
            kimlik = ham.split(":", 1)[-1].strip() if ":" in ham else ""
            kimlik = kimlik.strip()
            if kimlik:
                sonuc["cikar_fid"].add(kimlik)
            else:
                sonuc["hatali"].append((no, ham))
            continue
        # "Torbalı ; 502 SOKAK ; yalnız: Torbalı Organize Sanayi Bölgesi"
        parcalar = [p.strip() for p in ham.split(";")]
        if len(parcalar) < 3:
            sonuc["hatali"].append((no, ham))
            continue
        ilce, yol_adi, kosul = parcalar[0], parcalar[1], ";".join(parcalar[2:])
        if ":" not in kosul:
            sonuc["hatali"].append((no, ham))
            continue
        tur_ham, deger = kosul.split(":", 1)
        tur = sade(tur_ham)
        mahalleler = [sade(m) for m in deger.split(",") if m.strip()]
        if tur not in ("YALNIZ", "HARIC") or not mahalleler or not ilce or not yol_adi:
            sonuc["hatali"].append((no, ham))
            continue
        sonuc["kurallar"].append({
            "satir": no, "ham": ham, "ilce": sade(ilce), "govde": govde(yol_adi),
            "yalniz": mahalleler if tur == "YALNIZ" else None,
            "haric": mahalleler if tur == "HARIC" else None})
    return sonuc


def listeyi_coz(yol, ilce_adlari):
    """Excel'den mavi satırları çıkarır.

    Döndürür: (kayitlar, istatistik)
    kayitlar: [{"ilce", "ad", "renk", "genislik", "satir"}]
    """
    satirlar = satirlari_oku(yol)
    ilce_anahtar = {sade(i): i for i in ilce_adlari}
    suanki = None
    kayitlar = []
    renk_sayaci = {}
    ilcesiz = []
    for no, hucreler in satirlar:
        ad, renk = hucreler.get(1, ("", None))
        if not ad:
            continue
        ikinci = hucreler.get(2, ("", None))[0]
        anahtar = sade(ad)
        # İlçe başlığı: A sütunu bir ilçe adı, B sütunu başlık metni ya da boş
        if anahtar in ilce_anahtar and ("IMAR" in sade(ikinci) or not ikinci):
            suanki = ilce_anahtar[anahtar]
            continue
        ton = mavi_mi(renk)
        if renk:
            renk_sayaci[renk] = renk_sayaci.get(renk, 0) + 1
        if not ton:
            continue
        if suanki is None:
            ilcesiz.append((no, ad))
            continue
        kayitlar.append({"ilce": suanki, "ad": ad, "renk": ton,
                         "genislik": ikinci, "satir": no})
    return kayitlar, {"renkler": renk_sayaci, "ilcesiz": ilcesiz,
                      "satir": len(satirlar)}
