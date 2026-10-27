"""QGIS stil dosyası (.qml) üretir — kategoriler.json'dan.

Amaç: ana katmanı QGIS'te açtığınızda renkler sitedekiyle birebir aynı olsun ve
DURUM elle yazılan bir alan değil **açılır liste** olsun. Böylece yolları seçip
tek hamlede devretmek saniyeler sürer, yazım hatası da imkânsız olur.

Bu dosya tek başına çalıştırılmaz; araclar/ana_katman.py kullanır.
"""

QGIS_SURUM = "3.34.0"


def _kacar(m):
    return (str(m).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _rgba(hex_renk, saydam=255):
    """'#a855f7' -> '168,85,247,255'"""
    h = (hex_renk or "#888888").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r, g, b = 136, 136, 136
    return "%d,%d,%d,%d" % (r, g, b, saydam)


def _cizgi_sembolu(ad, renk, kalinlik):
    """Tek bir çizgi sembolü (SimpleLine)."""
    return (
        '<symbol type="line" name="%s" frame_rate="10" alpha="1" '
        'clip_to_extent="1" force_rhr="0" is_animated="0">\n'
        '  <layer class="SimpleLine" enabled="1" pass="0" locked="0">\n'
        '    <Option type="Map">\n'
        '      <Option name="align_dash_pattern" type="QString" value="0"/>\n'
        '      <Option name="capstyle" type="QString" value="round"/>\n'
        '      <Option name="joinstyle" type="QString" value="round"/>\n'
        '      <Option name="line_color" type="QString" value="%s"/>\n'
        '      <Option name="line_style" type="QString" value="solid"/>\n'
        '      <Option name="line_width" type="QString" value="%s"/>\n'
        '      <Option name="line_width_unit" type="QString" value="MM"/>\n'
        '      <Option name="offset" type="QString" value="0"/>\n'
        '      <Option name="offset_unit" type="QString" value="MM"/>\n'
        '      <Option name="use_custom_dash" type="QString" value="0"/>\n'
        '    </Option>\n'
        '  </layer>\n'
        '</symbol>' % (_kacar(ad), _rgba(renk), kalinlik))


def _deger_listesi(esleme):
    """ValueMap (açılır liste) yapılandırması. esleme: {kod: etiket}"""
    satirlar = []
    for kod in sorted(esleme, key=lambda k: (len(k), k)):
        satirlar.append(
            '        <Option type="Map">\n'
            '          <Option name="%s" type="QString" value="%s"/>\n'
            '        </Option>' % (_kacar(esleme[kod]), _kacar(kod)))
    return "\n".join(satirlar)


def qml_uret(kategoriler, yol_tipleri, salt_okunur=("ilce", "mahalle", "uzunluk_m")):
    """Kategorili renklendirme + DURUM/TIP açılır listeleri içeren QML üretir.

    kategoriler : {"1": {"ad": ..., "renk": "#a855f7", "sira": 1}, ...}
    yol_tipleri : {"1": "Sokak", "2": "Cadde", ...}
    """
    kodlar = sorted(kategoriler, key=lambda k: (kategoriler[k].get("sira", 999), k))

    kategori_satirlari = []
    sembol_satirlari = []
    for i, kod in enumerate(kodlar):
        k = kategoriler[kod]
        # Karayolları gibi ana yollar biraz daha kalın çizilsin
        kalinlik = "0.96" if k.get("sira") == 4 else "0.66"
        kategori_satirlari.append(
            '    <category symbol="%d" value="%s" label="%s" type="string" '
            'render="true" uuid="{kat-%s}"/>'
            % (i, _kacar(kod), _kacar(k.get("ad") or ("Durum " + kod)), _kacar(kod)))
        sembol_satirlari.append(_cizgi_sembolu(str(i), k.get("renk"), kalinlik))

    # Listede olmayan bir kod çıkarsa görünmez olmasın
    kategori_satirlari.append(
        '    <category symbol="%d" value="" label="(tanımsız kod)" type="string" '
        'render="true" uuid="{kat-bos}"/>' % len(kodlar))
    sembol_satirlari.append(_cizgi_sembolu(str(len(kodlar)), "#9ca3af", "0.5"))

    durum_eslemesi = {kod: "%s — %s" % (kod, kategoriler[kod].get("ad") or kod)
                      for kod in kodlar}
    tip_eslemesi = {kod: "%s — %s" % (kod, ad)
                    for kod, ad in yol_tipleri.items() if not kod.startswith("_")}

    alan_yapilandirmasi = []
    for alan, esleme in (("durum", durum_eslemesi), ("tip", tip_eslemesi)):
        alan_yapilandirmasi.append(
            '    <field name="%s" configurationFlags="NoFlag">\n'
            '      <editWidget type="ValueMap">\n'
            '        <config>\n'
            '          <Option type="Map">\n'
            '            <Option name="map" type="List">\n'
            '%s\n'
            '            </Option>\n'
            '          </Option>\n'
            '        </config>\n'
            '      </editWidget>\n'
            '    </field>' % (alan, _deger_listesi(esleme)))
    for alan in salt_okunur:
        alan_yapilandirmasi.append(
            '    <field name="%s" configurationFlags="NoFlag">\n'
            '      <editWidget type="TextEdit"><config><Option/></config></editWidget>\n'
            '    </field>' % alan)

    # Türetilmiş alanlar elle değiştirilmesin (her derlemede yeniden hesaplanır)
    duzenlenebilir = "\n".join(
        '    <field name="%s" editable="%d"/>' % (a, 0 if a in salt_okunur else 1)
        for a in ("durum", "tip", "ad", "aciklama", "ilce", "mahalle", "uzunluk_m"))

    ipuclari = "\n".join(
        '    <field name="%s" comment="%s"/>' % (a, _kacar(y)) for a, y in (
            ("durum", "Yolun sorumluluk durumu — açılır listeden seçin"),
            ("tip", "Yol tipi (Sokak, Cadde, Bulvar…)"),
            ("ad", "ADINUMARASI — yolun adı"),
            ("aciklama", "Serbest not: karar numarası, tarih, gerekçe…"),
            ("ilce", "Otomatik hesaplanır, elle değiştirmeyin"),
            ("mahalle", "Otomatik hesaplanır, elle değiştirmeyin"),
            ("uzunluk_m", "Otomatik hesaplanır, elle değiştirmeyin")))

    return (
        '<!DOCTYPE qgis PUBLIC \'http://mrcc.com/qgis.dtd\' \'SYSTEM\'>\n'
        '<qgis version="%s" styleCategories="AllStyleCategories" '
        'simplifyDrawingHints="1" simplifyDrawingTol="1" simplifyLocal="1" '
        'simplifyMaxScale="1" simplifyAlgorithm="0" readOnly="0" '
        'labelsEnabled="0" maxScale="0" minScale="100000000">\n'
        '  <renderer-v2 type="categorizedSymbol" attr="durum" '
        'forceraster="0" symbollevels="0" enableorderby="0" '
        'referencescale="-1">\n'
        '  <categories>\n%s\n  </categories>\n'
        '  <symbols>\n%s\n  </symbols>\n'
        '  </renderer-v2>\n'
        '  <fieldConfiguration>\n%s\n  </fieldConfiguration>\n'
        '  <aliases>\n'
        '    <alias field="durum" name="Durum" index="0"/>\n'
        '    <alias field="tip" name="Yol tipi" index="1"/>\n'
        '    <alias field="ad" name="Yol adı" index="2"/>\n'
        '    <alias field="aciklama" name="Not" index="3"/>\n'
        '    <alias field="ilce" name="İlçe (otomatik)" index="4"/>\n'
        '    <alias field="mahalle" name="Mahalle (otomatik)" index="5"/>\n'
        '    <alias field="uzunluk_m" name="Uzunluk (m, otomatik)" index="6"/>\n'
        '  </aliases>\n'
        '  <editable>\n%s\n  </editable>\n'
        '  <fieldComments>\n%s\n  </fieldComments>\n'
        '  <layerGeometryType>1</layerGeometryType>\n'
        '</qgis>\n'
        % (QGIS_SURUM, "\n".join(kategori_satirlari),
           "\n".join(sembol_satirlari), "\n".join(alan_yapilandirmasi),
           duzenlenebilir, ipuclari))
