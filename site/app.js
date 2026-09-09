/* İzmir Köy Yolları Devir Haritası
   Saf JavaScript + Leaflet. Derleme aracı gerektirmez.
   Veri: veri/ozet.json (istatistik + ayarlar), veri/yollar.geojson (geometri)

   Çizim mimarisi: her kategori tek bir birleşik çizgi nesnesiyle çizilir
   (6.647 nesne yerine 4). Hangi yola tıklandığı, kendi ızgara indeksimizle
   yapılan "en yakın çizgi" testiyle bulunur. Bu, zoom/kaydırmayı akıcı tutar. */

(function () {
  "use strict";

  var IZGARA = 0.004;          // ~350 m: tıklama testi için mekânsal ızgara adımı
  var TIKLAMA_ESIGI = 14;      // piksel
  var DEPOLAMA = "izmirYollar.";

  var D = {
    ozet: null,
    ozellikler: [],
    durumaGore: {},
    katmanlar: {},
    izgara: null,
    seciliKategori: new Set(),
    seciliTip: new Set(),
    seciliIlce: new Set(),
    ozelKategori: {},          // kullanıcının kendi ad/renk değişiklikleri
    ozelSinir: {},             // ilçe sınır çizgisi görünümü değişiklikleri
    vurgu: null,
    hover: null,
    hoverKatman: null,
    olcum: null,
    ilceVerisi: null,
    ilceSinir: null,
    ilceEtiketler: null,
    ilceGoster: true,
    cizimSiniri: null,
    cizimZoom: null,
    konumIsaret: null,
    harita: null,
    cizer: null,
    altlik: null,
    altlikAdi: null
  };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------------------------------------------------------- yardımcılar */
  function sayi(n, hane) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    return Number(n).toLocaleString("tr-TR", {
      minimumFractionDigits: hane || 0, maximumFractionDigits: hane || 0
    });
  }

  function normalize(s) {
    if (!s) return "";
    return String(s)
      .replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i")
      .replace(/Ş/g, "s").replace(/ş/g, "s")
      .replace(/Ğ/g, "g").replace(/ğ/g, "g")
      .replace(/Ü/g, "u").replace(/ü/g, "u")
      .replace(/Ö/g, "o").replace(/ö/g, "o")
      .replace(/Ç/g, "c").replace(/ç/g, "c")
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function kacar(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function uzunlukYazi(m) {
    return m >= 1000 ? sayi(m / 1000, 2) + " km" : sayi(m, 0) + " m";
  }

  function yerelYaz(anahtar, deger) {
    try { localStorage.setItem(DEPOLAMA + anahtar, JSON.stringify(deger)); } catch (e) {}
  }
  function yerelOku(anahtar, varsayilan) {
    try {
      var v = localStorage.getItem(DEPOLAMA + anahtar);
      return v === null ? varsayilan : JSON.parse(v);
    } catch (e) { return varsayilan; }
  }

  var bildirimZaman;
  function bildir(mesaj) {
    var el = $("#bildirim");
    el.textContent = mesaj;
    el.classList.add("gorunur");
    clearTimeout(bildirimZaman);
    bildirimZaman = setTimeout(function () { el.classList.remove("gorunur"); }, 2600);
  }

  function panoyaKopyala(metin) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(metin).catch(function () {});
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = metin; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (err) {}
    document.body.removeChild(ta);
  }

  /* ------------------------------------------------------------- renkler */
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return [136, 136, 136];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbHex(c) {
    return "#" + c.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? "0" : "") + v.toString(16);
    }).join("");
  }
  function parlaklik(h) {
    var c = hexRgb(h).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Koyu temada görünmeyecek kadar koyu renkleri okunur hâle getirir
  function koyuIcinAyarla(h) {
    if (parlaklik(h) >= 0.09) return h;
    for (var t = 0.25; t <= 0.95; t += 0.05) {
      var yeni = rgbHex(hexRgb(h).map(function (v) { return v + (255 - v) * t; }));
      if (parlaklik(yeni) >= 0.45) return yeni;
    }
    return "#cbd5e1";
  }

  function koyuMu() {
    return document.documentElement.getAttribute("data-tema") === "koyu";
  }

  // Yol renkleri arayüz temasına değil, ALTLIK HARİTANIN koyuluğuna göre seçilir:
  // koyu tema + açık altlık seçildiğinde siyah yolların kaybolmasını önler.
  function koyuZeminMi() {
    return D.altlikAdi === "Koyu" || D.altlikAdi === "Uydu";
  }

  /* --------------------------------------------------- kategori ayarları */
  function katAd(durum) {
    var o = D.ozelKategori[durum];
    if (o && o.ad) return o.ad;
    var k = D.ozet.kategoriler[durum];
    return k ? k.ad : "Durum " + durum;
  }

  function katRenk(durum) {
    var o = D.ozelKategori[durum];
    if (o && o.renk) return koyuZeminMi() ? koyuIcinAyarla(o.renk) : o.renk;
    var k = D.ozet.kategoriler[durum] || {};
    if (koyuZeminMi()) return k.renk_koyu || koyuIcinAyarla(k.renk || "#888888");
    return k.renk || "#888888";
  }

  function katTemelRenk(durum) {           // düzenleyicideki renk kutusu için
    var o = D.ozelKategori[durum];
    if (o && o.renk) return o.renk;
    var k = D.ozet.kategoriler[durum] || {};
    return k.renk || "#888888";
  }

  function ozelVarMi() {
    return Object.keys(D.ozelKategori).length > 0 || Object.keys(D.ozelSinir).length > 0;
  }

  /* ------------------------------------------------------------- altlık */
  var OSM = {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları'
  };

  var ALTLIKLAR = {
    "Sokak": { url: OSM.url, opt: { maxZoom: 19, attribution: OSM.attribution } },
    "Sade": {
      url: OSM.url,
      opt: { maxZoom: 19, attribution: OSM.attribution, className: "altlik-sade" }
    },
    "Koyu": {
      url: OSM.url,
      opt: { maxZoom: 19, attribution: OSM.attribution, className: "altlik-koyu" }
    },
    "Uydu": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      opt: { maxZoom: 19, maxNativeZoom: 18, attribution: "Uydu görüntüsü: Esri, Maxar, Earthstar Geographics" }
    }
  };

  function altligiSec(ad) {
    if (!ALTLIKLAR[ad]) ad = "Sokak";
    var oncekiKoyu = koyuZeminMi();
    if (D.altlik) D.harita.removeLayer(D.altlik);
    D.altlik = L.tileLayer(ALTLIKLAR[ad].url, ALTLIKLAR[ad].opt).addTo(D.harita);
    D.altlik.bringToBack();
    D.altlikAdi = ad;
    $$("#altlik-secim button").forEach(function (b) {
      b.classList.toggle("secili", b.dataset.ad === ad);
    });
    yerelYaz("altlik", ad);
    if (D.ozet && D.ozellikler.length && oncekiKoyu !== koyuZeminMi()) {
      kategoriListesiCiz();
      katmanlariCiz(true);
      yardimCiz();
      ilceSinirGuncelle();
    }
  }

  function altlikKur() {
    var kap = $("#altlik-secim");
    kap.innerHTML = "";
    Object.keys(ALTLIKLAR).forEach(function (ad) {
      var b = document.createElement("button");
      b.textContent = ad;
      b.dataset.ad = ad;
      b.onclick = function () { altligiSec(ad); };
      kap.appendChild(b);
    });
    altligiSec(yerelOku("altlik", koyuMu() ? "Koyu" : "Sokak"));
  }

  /* --------------------------------------------------------------- tema */
  function temaUygula(tema) {
    document.documentElement.setAttribute("data-tema", tema);
    $("#btn-tema").textContent = tema === "koyu" ? "☀️" : "🌙";
    yerelYaz("tema", tema);
    if (D.harita) {
      if (tema === "koyu" && (D.altlikAdi === "Sokak" || D.altlikAdi === "Sade")) altligiSec("Koyu");
      else if (tema === "acik" && D.altlikAdi === "Koyu") altligiSec("Sokak");
    }
  }

  function temaBaslat() {
    var t = yerelOku("tema", null);
    if (!t) {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "koyu" : "acik";
    }
    document.documentElement.setAttribute("data-tema", t);
    $("#btn-tema").textContent = t === "koyu" ? "☀️" : "🌙";
  }

  /* ------------------------------------------------------- ızgara indeksi */
  function izgaraKur() {
    D.izgara = new Map();
    var ekle = function (x, y, i) {
      var a = Math.round(x / IZGARA) + "|" + Math.round(y / IZGARA);
      var s = D.izgara.get(a);
      if (!s) { s = []; D.izgara.set(a, s); }
      if (s[s.length - 1] !== i) s.push(i);
    };
    D.ozellikler.forEach(function (f, i) {
      f.parcalar.forEach(function (p) {
        for (var j = 0; j < p.length; j++) {
          ekle(p[j][0], p[j][1], i);
          if (j > 0) {                       // uzun kenarlarda ara noktalar
            var a = p[j - 1], b = p[j];
            var dx = b[0] - a[0], dy = b[1] - a[1];
            var n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (IZGARA * 0.5));
            for (var k = 1; k < n; k++) ekle(a[0] + dx * k / n, a[1] + dy * k / n, i);
          }
        }
      });
    });
  }

  function yakinAdaylar(lng, lat) {
    var cx = Math.round(lng / IZGARA), cy = Math.round(lat / IZGARA);
    var out = [];
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var s = D.izgara.get((cx + dx) + "|" + (cy + dy));
        if (s) for (var i = 0; i < s.length; i++) if (out.indexOf(s[i]) === -1) out.push(s[i]);
      }
    }
    return out;
  }

  function yolBul(latlng, esik) {
    if (!D.izgara) return null;
    var p = D.harita.latLngToContainerPoint(latlng);
    var enIyi = null, enIyiD = esik || TIKLAMA_ESIGI;
    var aday = yakinAdaylar(latlng.lng, latlng.lat);
    for (var n = 0; n < aday.length; n++) {
      var f = D.ozellikler[aday[n]];
      if (!D.seciliKategori.has(f.properties.durum) || !gecerliMi(f.properties)) continue;
      for (var q = 0; q < f.ll.length; q++) {
        var parca = f.ll[q];
        for (var j = 1; j < parca.length; j++) {
          var a = D.harita.latLngToContainerPoint(parca[j - 1]);
          var b = D.harita.latLngToContainerPoint(parca[j]);
          var d = L.LineUtil.pointToSegmentDistance(p, a, b);
          if (d < enIyiD) { enIyiD = d; enIyi = f; }
        }
      }
    }
    return enIyi;
  }

  /* ------------------------------------------------------------ çizgiler */
  function agirlik() {
    var z = D.harita.getZoom();
    if (z >= 16) return 5;
    if (z >= 14) return 3.8;
    if (z >= 12) return 2.6;
    if (z >= 10) return 1.9;
    return 1.4;
  }

  function gecerliMi(p) {
    if (D.seciliTip.size && !D.seciliTip.has(p.tip)) return false;
    if (D.seciliIlce.size && !D.seciliIlce.has(p.ilce || "Belirlenemedi")) return false;
    return true;
  }

  function kategoriSiralari() {
    return Object.keys(D.ozet.kategoriler).sort(function (a, b) {
      return (D.ozet.kategoriler[a].sira || 999) - (D.ozet.kategoriler[b].sira || 999);
    });
  }

  function katmanlariYenile() {
    istatistikGuncelle();
    katmanlariCiz(true);
  }

  // İstatistikler seçili filtrenin TAMAMINI kapsar (ekranda görünenle sınırlı değildir).
  function istatistikGuncelle() {
    var toplamKm = 0, adSayisi = 0;
    var adlar = Object.create(null), tipSayaci = {};
    Object.keys(D.durumaGore).forEach(function (durum) {
      if (!D.seciliKategori.has(durum)) return;
      D.durumaGore[durum].forEach(function (f) {
        var p = f.properties;
        if (!gecerliMi(p)) return;
        toplamKm += p.uzunluk_m / 1000;
        if (!adlar[p.ad]) { adlar[p.ad] = 1; adSayisi++; }
        var t = p.tip || "Belirtilmemiş";
        tipSayaci[t] = (tipSayaci[t] || 0) + p.uzunluk_m / 1000;
      });
    });
    $("#ist-km").textContent = sayi(toplamKm, 1);
    $("#ist-ad").textContent = sayi(adSayisi, 0);
    tipTablosuYaz(tipSayaci);
    kategoriSayilariYaz();
  }

  // Ekranda görünmeyen yolları Leaflet'e hiç vermiyoruz: asıl maliyet çizim değil,
  // her hareket/zoomda bütün noktaların yeniden projeksiyonu.
  function cizimGerekliMi() {
    if (!D.cizimSiniri) return true;
    if (D.cizimZoom !== D.harita.getZoom()) return true;
    return !D.cizimSiniri.contains(D.harita.getBounds());
  }

  function katmanlariCiz(zorla) {
    if (!D.ozellikler.length) return;
    if (!zorla && !cizimGerekliMi()) return;

    var sinir = D.harita.getBounds().pad(0.6);
    D.cizimSiniri = sinir;
    D.cizimZoom = D.harita.getZoom();
    var bati = sinir.getWest(), dogu = sinir.getEast();
    var guney = sinir.getSouth(), kuzey = sinir.getNorth();
    var w = agirlik();

    Object.keys(D.katmanlar).forEach(function (d) {
      D.harita.removeLayer(D.katmanlar[d]);
      delete D.katmanlar[d];
    });

    // Sıra numarası büyük olan altta kalsın diye tersten ekliyoruz
    kategoriSiralari().reverse().forEach(function (durum) {
      if (!D.seciliKategori.has(durum)) return;
      var cizgiler = [];
      var liste = D.durumaGore[durum] || [];
      for (var n = 0; n < liste.length; n++) {
        var f = liste[n], b = f.bbox;
        if (b[0] > dogu || b[2] < bati || b[1] > kuzey || b[3] < guney) continue;
        if (!gecerliMi(f.properties)) continue;
        for (var i = 0; i < f.ll.length; i++) cizgiler.push(f.ll[i]);
      }
      if (!cizgiler.length) return;
      D.katmanlar[durum] = L.polyline(cizgiler, {
        renderer: D.cizer,
        color: katRenk(durum),
        weight: w,
        opacity: 0.92,
        smoothFactor: 1.5,
        interactive: false,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(D.harita);
    });

    if (D.vurgu) { D.vurgu.setStyle({ weight: w + 9 }); D.vurgu.bringToBack(); }
    if (D.hoverKatman) { D.harita.removeLayer(D.hoverKatman); D.hoverKatman = null; D.hover = null; }
    hashYaz();
  }

  function tipTablosuYaz(tipSayaci) {
    var t = $("#tip-tablo");
    var satirlar = Object.keys(tipSayaci).sort(function (a, b) { return tipSayaci[b] - tipSayaci[a]; });
    if (!satirlar.length) {
      t.innerHTML = '<tr><td colspan="2" class="kucuk">Seçili filtreye uyan yol yok.</td></tr>';
      return;
    }
    t.innerHTML = satirlar.map(function (ad) {
      return "<tr><td>" + kacar(ad) + "</td><td>" + sayi(tipSayaci[ad], 1) + " km</td></tr>";
    }).join("");
  }

  /* ------------------------------------------------------ yol seçimi/popup */
  function yolSec(f, latlng) {
    var p = f.properties;
    var orta = latlng || ortaNokta(f);
    var koord = orta.lat.toFixed(6) + ", " + orta.lng.toFixed(6);

    var html = '<div class="pop-ad">' + kacar(p.ad) + "</div>" +
      '<div class="pop-kat"><i style="background:' + kacar(katRenk(p.durum)) + '"></i>' +
      kacar(katAd(p.durum)) + "</div>" +
      '<table class="pop-tablo">' +
      "<tr><td>Yol tipi</td><td>" + kacar(p.tip) + "</td></tr>" +
      "<tr><td>Uzunluk</td><td>" + uzunlukYazi(p.uzunluk_m) + "</td></tr>" +
      (p.ilce ? "<tr><td>İlçe</td><td>" + kacar(p.ilce) + "</td></tr>" : "") +
      "<tr><td>Kayıt no</td><td>#" + kacar(p.fid) + "</td></tr>" +
      "<tr><td>Koordinat</td><td>" + koord + "</td></tr>" +
      "</table>" +
      '<div class="pop-eylem">' +
      '<button data-kopyala="' + koord + '">Koordinatı kopyala</button>' +
      '<a href="https://www.google.com/maps?q=' + orta.lat.toFixed(6) + "," + orta.lng.toFixed(6) +
      '" target="_blank" rel="noopener">Google Maps</a>' +
      "</div>" +
      '<div class="pop-eylem"><button data-ayniad="' + kacar(p.ad) +
      '">Bu isimli tüm yolları göster</button></div>';

    L.popup({ maxWidth: 320, autoPanPadding: [30, 30] })
      .setLatLng(orta).setContent(html).openOn(D.harita);
  }

  function ortaNokta(f) {
    var parca = f.ll[0];
    return parca[Math.floor(parca.length / 2)];
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.kopyala) {
      panoyaKopyala(t.dataset.kopyala);
      bildir("Koordinat kopyalandı: " + t.dataset.kopyala);
    }
    if (t.dataset.ayniad) {
      adaGit(t.dataset.ayniad);
      D.harita.closePopup();
    }
  });

  /* ------------------------------------------------------------- vurgular */
  function vurguyuKaldir() {
    if (D.vurgu) { D.harita.removeLayer(D.vurgu); D.vurgu = null; }
  }

  function hoverGoster(f) {
    if (D.hover === f) return;
    D.hover = f;
    if (D.hoverKatman) { D.harita.removeLayer(D.hoverKatman); D.hoverKatman = null; }
    D.harita.getContainer().style.cursor = f ? "pointer" : "";
    if (!f) return;
    D.hoverKatman = L.polyline(f.ll, {
      renderer: D.cizer, color: katRenk(f.properties.durum),
      weight: agirlik() + 4, opacity: 1, interactive: false,
      lineCap: "round", lineJoin: "round"
    }).addTo(D.harita);
  }

  /* -------------------------------------------------------- mesafe ölçümü */
  function olcumAcKapat() {
    if (D.olcum) { olcumBitir(); return; }
    D.olcum = { noktalar: [], cizgi: null, isaretler: [] };
    D.harita.doubleClickZoom.disable();
    D.harita.getContainer().classList.add("olcum-modu");
    $("#btn-olcum").classList.add("etkin");
    $("#olcum-kutu").hidden = false;
    olcumYaz();
    bildir("Ölçmek için haritaya tıklayın. Bitirmek için çift tıklayın.");
  }

  function olcumBitir() {
    if (!D.olcum) return;
    olcumTemizle();
    D.olcum = null;
    D.harita.doubleClickZoom.enable();
    D.harita.getContainer().classList.remove("olcum-modu");
    $("#btn-olcum").classList.remove("etkin");
    $("#olcum-kutu").hidden = true;
  }

  function olcumTemizle() {
    if (!D.olcum) return;
    if (D.olcum.cizgi) D.harita.removeLayer(D.olcum.cizgi);
    D.olcum.isaretler.forEach(function (m) { D.harita.removeLayer(m); });
    D.olcum.cizgi = null;
    D.olcum.isaretler = [];
    D.olcum.noktalar = [];
    olcumYaz();
  }

  function olcumNoktaEkle(latlng) {
    var o = D.olcum;
    o.noktalar.push(latlng);
    var m = L.circleMarker(latlng, {
      radius: 4, color: "#fff", weight: 2, fillColor: "#f59e0b", fillOpacity: 1
    }).addTo(D.harita);
    o.isaretler.push(m);
    if (o.cizgi) D.harita.removeLayer(o.cizgi);
    if (o.noktalar.length > 1) {
      o.cizgi = L.polyline(o.noktalar, {
        color: "#f59e0b", weight: 3, dashArray: "6 5", interactive: false
      }).addTo(D.harita);
    }
    olcumYaz();
  }

  function olcumToplam() {
    var o = D.olcum, t = 0;
    if (!o) return 0;
    for (var i = 1; i < o.noktalar.length; i++) t += o.noktalar[i - 1].distanceTo(o.noktalar[i]);
    return t;
  }

  function olcumYaz() {
    var o = D.olcum;
    if (!o) return;
    var t = olcumToplam();
    $("#olcum-deger").textContent = o.noktalar.length < 2 ? "Haritaya tıklayın" : uzunlukYazi(t);
    $("#olcum-adet").textContent = o.noktalar.length
      ? o.noktalar.length + " nokta" : "";
  }

  /* ---------------------------------------------------------------- arama */
  function aramaKur() {
    var giris = $("#arama"), temizle = $("#arama-temizle"), zaman;
    giris.addEventListener("input", function () {
      temizle.style.display = giris.value ? "block" : "none";
      clearTimeout(zaman);
      zaman = setTimeout(function () { aramaCiz(giris.value); }, 130);
    });
    temizle.onclick = function () {
      giris.value = ""; temizle.style.display = "none"; aramaCiz("");
      vurguyuKaldir(); giris.focus();
    };
  }

  function aramaCiz(sorgu) {
    var kap = $("#arama-sonuc");
    var q = normalize(sorgu);
    if (q.length < 2) {
      kap.innerHTML = q.length === 1
        ? '<div class="bos">En az 2 harf yazın.</div>'
        : '<div class="bos">' + sayi(D.ozet.adlar.length) + " farklı yol adı kayıtlı.</div>";
      return;
    }
    var sonuc = D.ozet.adlar.filter(function (a) { return a.arama.indexOf(q) !== -1; });
    sonuc.sort(function (a, b) {
      var ab = a.arama.indexOf(q) === 0 ? 0 : 1, bb = b.arama.indexOf(q) === 0 ? 0 : 1;
      return ab - bb || b.km - a.km;
    });
    if (!sonuc.length) { kap.innerHTML = '<div class="bos">Sonuç bulunamadı.</div>'; return; }

    kap.innerHTML = sonuc.slice(0, 60).map(function (a) {
      var noktalar = Object.keys(a.durumlar).sort().map(function (d) {
        return '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
          kacar(katRenk(d)) + ';margin-right:3px" title="' + kacar(katAd(d)) + '"></i>';
      }).join("");
      return '<div class="satir" data-ad="' + kacar(a.ad) + '">' + noktalar +
        '<span class="ad">' + kacar(a.ad) + '</span>' +
        '<span class="bilgi">' + sayi(a.km, 1) + " km</span></div>";
    }).join("") + (sonuc.length > 60
      ? '<div class="bos">… ve ' + (sonuc.length - 60) + " sonuç daha. Aramayı daraltın.</div>" : "");

    kap.querySelectorAll(".satir").forEach(function (el) {
      el.onclick = function () { adaGit(el.dataset.ad); };
    });
  }

  function adaGit(ad) {
    var secilenler = D.ozellikler.filter(function (f) { return f.properties.ad === ad; });
    if (!secilenler.length) return;

    var degisti = false;
    secilenler.forEach(function (f) {
      if (!D.seciliKategori.has(f.properties.durum)) {
        D.seciliKategori.add(f.properties.durum); degisti = true;
      }
    });
    if (D.seciliTip.size || D.seciliIlce.size) {
      D.seciliTip.clear(); D.seciliIlce.clear(); degisti = true;
    }
    if (degisti) { kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz(); }
    katmanlariYenile();

    vurguyuKaldir();
    var cizgiler = [];
    secilenler.forEach(function (f) { for (var i = 0; i < f.ll.length; i++) cizgiler.push(f.ll[i]); });
    D.vurgu = L.polyline(cizgiler, {
      renderer: D.cizer, color: "#f59e0b", weight: agirlik() + 9,
      opacity: 0.5, interactive: false, lineCap: "round"
    }).addTo(D.harita);
    D.vurgu.bringToBack();

    D.harita.fitBounds(D.vurgu.getBounds(), { padding: [60, 60], maxZoom: 16 });
    var km = secilenler.reduce(function (t, f) { return t + f.properties.uzunluk_m; }, 0);
    bildir(ad + " — " + uzunlukYazi(km));
    if (window.innerWidth <= 860) $("#panel").classList.add("kapali");
  }

  /* -------------------------------------------------- kategori listesi/düzenleyici */
  var HAZIR_RENKLER = ["#a855f7", "#e11d48", "#2563eb", "#1f2937", "#059669",
                       "#ea580c", "#0891b2", "#ca8a04", "#be185d", "#4338ca"];

  function kategoriListesiCiz() {
    var kap = $("#kategori-liste");
    var kategoriler = D.ozet.kategoriler;
    var enBuyuk = Math.max.apply(null, Object.keys(kategoriler).map(function (d) {
      return kategoriler[d].uzunluk_km;
    }).concat([1]));

    kap.innerHTML = kategoriSiralari().map(function (durum) {
      var k = kategoriler[durum];
      var acik = D.seciliKategori.has(durum);
      var ozel = D.ozelKategori[durum];
      return '<div class="kat" data-kat="' + kacar(durum) + '">' +
        '<div class="ust">' +
          '<label class="kat-etiket">' +
            '<input type="checkbox" data-durum="' + kacar(durum) + '"' + (acik ? " checked" : "") + ">" +
            '<span class="cizgi-ornek" style="background:' + kacar(katRenk(durum)) + '"></span>' +
            '<span class="ad">' + kacar(katAd(durum)) +
              (k.tanimli === false ? " ⚠️" : "") + (ozel ? ' <em title="Siz değiştirdiniz">•</em>' : "") +
            "</span>" +
          "</label>" +
          '<span class="sayi">' + sayi(k.uzunluk_km, 1) + " km</span>" +
          '<button class="kat-duzenle" data-duzenle="' + kacar(durum) +
            '" title="Adını ve rengini değiştir" aria-label="Adını ve rengini değiştir">✎</button>' +
        "</div>" +
        '<div class="aciklama">' + kacar(k.aciklama) + "</div>" +
        '<div class="bar"><i style="width:' + (k.uzunluk_km / enBuyuk * 100).toFixed(1) +
          "%;background:" + kacar(katRenk(durum)) + '"></i></div>' +
        '<div class="kat-editor" data-editor="' + kacar(durum) + '" hidden></div>' +
      "</div>";
    }).join("");

    kap.querySelectorAll("input[data-durum]").forEach(function (el) {
      el.onchange = function () {
        if (el.checked) D.seciliKategori.add(el.dataset.durum);
        else D.seciliKategori.delete(el.dataset.durum);
        katmanlariYenile();
      };
    });
    kap.querySelectorAll("[data-duzenle]").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        duzenleyiciAcKapat(b.dataset.duzenle);
      };
    });
    kategoriSayilariYaz();
    ozelSatirGuncelle();
  }

  function duzenleyiciAcKapat(durum) {
    var kutu = $('[data-editor="' + CSS.escape(durum) + '"]');
    if (!kutu) return;
    if (!kutu.hidden) { kutu.hidden = true; kutu.innerHTML = ""; return; }
    $$(".kat-editor").forEach(function (e) { e.hidden = true; e.innerHTML = ""; });

    var renk = katTemelRenk(durum);
    kutu.innerHTML =
      '<label class="ed-etiket">Görünen ad</label>' +
      '<input type="text" class="ed-ad" value="' + kacar(katAd(durum)) + '" maxlength="80">' +
      '<label class="ed-etiket">Çizgi rengi</label>' +
      '<div class="renk-satir">' +
        '<input type="color" class="ed-renk" value="' + kacar(renk) + '">' +
        '<div class="hazir-renkler">' + HAZIR_RENKLER.map(function (h) {
          return '<button class="hazir" data-renk="' + h + '" style="background:' + h +
            '" title="' + h + '"></button>';
        }).join("") + "</div>" +
      "</div>" +
      '<div class="ed-dugmeler">' +
        '<button class="dbtn ed-sifirla">Varsayılana dön</button>' +
        '<button class="dbtn ed-kapat">Kapat</button>' +
      "</div>" +
      '<p class="kucuk" style="margin:8px 0 0">Değişiklik anında uygulanır ve bu tarayıcıda saklanır. ' +
      "Herkes için kalıcı yapmak isterseniz listenin altındaki düğmeyi kullanın.</p>";
    kutu.hidden = false;

    var adGiris = kutu.querySelector(".ed-ad");
    var renkGiris = kutu.querySelector(".ed-renk");
    var zaman;

    var uygula = function (yeniAd, yeniRenk) {
      var o = D.ozelKategori[durum] || {};
      if (yeniAd !== undefined) {
        var varsayilan = (D.ozet.kategoriler[durum] || {}).ad;
        if (yeniAd && yeniAd !== varsayilan) o.ad = yeniAd; else delete o.ad;
      }
      if (yeniRenk !== undefined) {
        var vr = (D.ozet.kategoriler[durum] || {}).renk;
        if (yeniRenk && yeniRenk.toLowerCase() !== String(vr).toLowerCase()) o.renk = yeniRenk;
        else delete o.renk;
      }
      if (Object.keys(o).length) D.ozelKategori[durum] = o;
      else delete D.ozelKategori[durum];
      yerelYaz("kategoriOzel", D.ozelKategori);
      katmanlariYenile();
      rozetleriTazele(durum);
      ozelSatirGuncelle();
      yardimCiz();
    };

    adGiris.addEventListener("input", function () {
      clearTimeout(zaman);
      zaman = setTimeout(function () { uygula(adGiris.value.trim(), undefined); }, 250);
    });
    renkGiris.addEventListener("input", function () { uygula(undefined, renkGiris.value); });
    kutu.querySelectorAll(".hazir").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        renkGiris.value = b.dataset.renk;
        uygula(undefined, b.dataset.renk);
      };
    });
    kutu.querySelector(".ed-sifirla").onclick = function (e) {
      e.preventDefault();
      delete D.ozelKategori[durum];
      yerelYaz("kategoriOzel", D.ozelKategori);
      katmanlariYenile(); kategoriListesiCiz(); yardimCiz();
      bildir("Kategori varsayılana döndürüldü.");
    };
    kutu.querySelector(".ed-kapat").onclick = function (e) {
      e.preventDefault(); kutu.hidden = true; kutu.innerHTML = "";
    };
    adGiris.focus();
  }

  // Düzenleyici açıkken listeyi baştan çizmeden rengi/adı tazeler
  function rozetleriTazele(durum) {
    var satir = document.querySelector('.kat[data-kat="' + CSS.escape(durum) + '"]');
    if (!satir) return;
    satir.querySelector(".cizgi-ornek").style.background = katRenk(durum);
    var bar = satir.querySelector(".bar > i");
    if (bar) bar.style.background = katRenk(durum);
    var ad = satir.querySelector(".ad");
    if (ad) {
      ad.innerHTML = kacar(katAd(durum)) +
        ((D.ozet.kategoriler[durum] || {}).tanimli === false ? " ⚠️" : "") +
        (D.ozelKategori[durum] ? ' <em title="Siz değiştirdiniz">•</em>' : "");
    }
  }

  function ozelSatirGuncelle() {
    var satir = $("#kat-ozel-satir");
    if (!satir) return;
    satir.hidden = !ozelVarMi();
  }

  function kategoriSayilariYaz() {
    var hepsi = Object.keys(D.ozet.kategoriler).length;
    $("#kategori-hepsi").textContent = D.seciliKategori.size === hepsi ? "tümünü kapat" : "tümünü seç";
  }

  /* ------------------------------------------- ayarları kalıcı yapma penceresi */
  function kaliciPencereAc() {
    var ham = JSON.parse(JSON.stringify(D.ozet.ayar_ham || { kategoriler: {} }));
    if (!ham.kategoriler) ham.kategoriler = {};
    Object.keys(D.ozelKategori).forEach(function (durum) {
      var o = D.ozelKategori[durum];
      var hedef = ham.kategoriler[durum] || (ham.kategoriler[durum] = {});
      if (o.ad) hedef.ad = o.ad;
      if (o.renk) { hedef.renk = o.renk; delete hedef.renk_koyu; }
    });
    if (Object.keys(D.ozelSinir).length) {
      var sn = ham.ilce_sinir || (ham.ilce_sinir = {});
      Object.keys(D.ozelSinir).forEach(function (k) {
        sn[k] = D.ozelSinir[k];
        if (k === "renk") delete sn.renk_koyu;
      });
    }
    var metin = JSON.stringify(ham, null, 2);
    $("#kalici-json").value = metin;

    var d = D.ozet.depo || {};
    var baglanti = d.sahip && d.depo
      ? "https://github.com/" + d.sahip + "/" + d.depo + "/edit/" +
        encodeURIComponent(d.dal || "main") + "/veri/kategoriler.json"
      : null;
    var a = $("#kalici-link");
    if (baglanti) { a.href = baglanti; a.hidden = false; $("#kalici-linkyok").hidden = true; }
    else { a.hidden = true; $("#kalici-linkyok").hidden = false; }

    var sinirOzeti = Object.keys(D.ozelSinir).length
      ? "<li><strong>İlçe sınır çizgisi</strong>: " +
        Object.keys(D.ozelSinir).map(function (k) {
          return kacar(k) + " = " + kacar(String(D.ozelSinir[k]));
        }).join(", ") + "</li>"
      : "";
    $("#kalici-ozet").innerHTML = (Object.keys(D.ozelKategori).length || sinirOzeti)
      ? "<ul>" + Object.keys(D.ozelKategori).map(function (durum) {
          var o = D.ozelKategori[durum];
          return "<li><strong>" + kacar(katAd(durum)) + "</strong>: " +
            (o.ad ? "ad değişti" : "") + (o.ad && o.renk ? ", " : "") +
            (o.renk ? 'renk <span style="display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;background:' +
              kacar(o.renk) + '"></span> ' + kacar(o.renk) : "") + "</li>";
        }).join("") + sinirOzeti + "</ul>"
      : "<p>Henüz bir değişiklik yapmadınız.</p>";

    $("#perde-kalici").classList.add("acik");
  }

  /* -------------------------------------------------------- ilçe sınırları */
  var SINIR_VARSAYILAN = { renk: "#6b7280", renk_koyu: "#9ca3af",
                           kalinlik: 1.2, kesikli: true, etiket_goster: true };

  // Etkin sınır görünümü: kullanıcı değişikliği > kategoriler.json > varsayılan
  function sinirAyar() {
    var temel = {};
    var k;
    for (k in SINIR_VARSAYILAN) temel[k] = SINIR_VARSAYILAN[k];
    var dosya = (D.ozet && D.ozet.ilce_sinir) || {};
    for (k in dosya) if (dosya[k] !== null && dosya[k] !== undefined) temel[k] = dosya[k];
    for (k in D.ozelSinir) if (D.ozelSinir[k] !== null && D.ozelSinir[k] !== undefined) {
      temel[k] = D.ozelSinir[k];
    }
    return temel;
  }

  function ilceSinirRengi() {
    var a = sinirAyar();
    if (D.ozelSinir.renk) return koyuZeminMi() ? koyuIcinAyarla(a.renk) : a.renk;
    return koyuZeminMi() ? (a.renk_koyu || koyuIcinAyarla(a.renk)) : a.renk;
  }
  function ilceVurguRengi() { return koyuZeminMi() ? "#2dd4bf" : "#0a5f6a"; }

  function ilceSinirStil(ad) {
    var a = sinirAyar();
    var secimVar = D.seciliIlce.size > 0;
    var kesik = a.kesikli ? Math.max(3, a.kalinlik * 4).toFixed(1) + " " +
                            Math.max(3, a.kalinlik * 3).toFixed(1) : null;
    if (secimVar && D.seciliIlce.has(ad)) {
      return { color: ilceVurguRengi(), weight: Math.max(2.2, a.kalinlik * 2),
               opacity: 1, dashArray: null,
               fill: true, fillColor: ilceVurguRengi(), fillOpacity: 0.07 };
    }
    return { color: ilceSinirRengi(), weight: a.kalinlik, dashArray: kesik,
             opacity: secimVar ? 0.3 : 0.75, fill: false };
  }

  function ilceSinirlariYukle() {
    if (!D.ozet.ilce_verisi_var) return;
    fetch("veri/ilceler.geojson", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (gj) {
        if (!gj || !gj.features) return;
        D.ilceVerisi = gj;
        // Sınırlar yolların ALTINDA kalsın diye ayrı bir katman düzlemi
        if (!D.harita.getPane("ilcePane")) {
          D.harita.createPane("ilcePane");
          D.harita.getPane("ilcePane").style.zIndex = 380;
        }
        D.ilceSinir = L.geoJSON(gj, {
          pane: "ilcePane",
          renderer: L.canvas({ pane: "ilcePane", padding: 0.3 }),
          interactive: false,
          style: function (f) { return ilceSinirStil(f.properties.ad); }
        });
        D.ilceEtiketler = L.layerGroup();
        ilceSinirGuncelle();
      })
      .catch(function () {});
  }

  function ilceEtiketleriCiz() {
    if (!D.ilceEtiketler || !D.ilceVerisi) return;
    D.ilceEtiketler.clearLayers();
    if (!sinirAyar().etiket_goster) return;
    var koyu = koyuZeminMi();
    var ilceler = D.ozet.ilceler || {};
    D.ilceVerisi.features.forEach(function (f) {
      var e = f.properties.etiket;
      if (!e) return;
      var kayit = ilceler[f.properties.ad];
      var sinif = "ilce-etiket" + (koyu ? " koyu-zemin" : "") +
        (D.seciliIlce.has(f.properties.ad) ? " secili" : "") +
        (!kayit || kayit.yol_yok ? " yolsuz" : "");
      D.ilceEtiketler.addLayer(L.marker([e[1], e[0]], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: sinif, iconSize: null,
                          html: "<span>" + kacar(f.properties.ad) + "</span>" })
      }));
    });
  }

  function ilceSinirGuncelle() {
    if (!D.ilceSinir) return;
    if (D.ilceGoster) {
      if (!D.harita.hasLayer(D.ilceSinir)) D.ilceSinir.addTo(D.harita);
      D.ilceSinir.setStyle(function (f) { return ilceSinirStil(f.properties.ad); });
      ilceEtiketleriCiz();
      if (!D.harita.hasLayer(D.ilceEtiketler)) D.ilceEtiketler.addTo(D.harita);
    } else {
      if (D.harita.hasLayer(D.ilceSinir)) D.harita.removeLayer(D.ilceSinir);
      if (D.harita.hasLayer(D.ilceEtiketler)) D.harita.removeLayer(D.ilceEtiketler);
    }
  }

  /* ------------------------------------------------ sınır çizgisi düzenleyici */
  function sinirDuzenleyiciAcKapat() {
    var kutu = $("#sinir-editor");
    if (!kutu) return;
    if (!kutu.hidden) { kutu.hidden = true; kutu.innerHTML = ""; return; }

    var a = sinirAyar();
    kutu.innerHTML =
      '<label class="ed-etiket">Sınır çizgisi rengi</label>' +
      '<div class="renk-satir">' +
        '<input type="color" class="sn-renk" value="' + kacar(a.renk) + '">' +
        '<div class="hazir-renkler">' + ["#6b7280", "#1f2937", "#0a5f6a", "#b45309",
          "#7c3aed", "#be123c", "#15803d", "#0369a1"].map(function (h) {
          return '<button class="hazir" data-renk="' + h + '" style="background:' + h +
            '" title="' + h + '"></button>';
        }).join("") + "</div>" +
      "</div>" +
      '<label class="ed-etiket" style="margin-top:12px">Çizgi kalınlığı</label>' +
      '<div class="ed-kaydirici">' +
        '<input type="range" class="sn-kalinlik" min="0.4" max="6" step="0.1" value="' +
          a.kalinlik + '">' +
        '<span class="deger sn-deger">' + sayi(a.kalinlik, 2) + " px</span>" +
      "</div>" +
      '<div class="ed-onizleme"><i class="sn-onizleme"></i></div>' +
      '<label class="satir-secim" style="margin:12px 0 0">' +
        '<input type="checkbox" class="sn-kesikli"' + (a.kesikli ? " checked" : "") + ">" +
        "<span>Kesikli çizgi</span></label>" +
      '<label class="satir-secim" style="margin:6px 0 0">' +
        '<input type="checkbox" class="sn-etiket"' + (a.etiket_goster ? " checked" : "") + ">" +
        "<span>İlçe adlarını haritada göster</span></label>" +
      '<div class="ed-dugmeler">' +
        '<button class="dbtn sn-sifirla">Varsayılana dön</button>' +
        '<button class="dbtn sn-kapat">Kapat</button>' +
      "</div>" +
      '<p class="kucuk" style="margin:8px 0 0">Değişiklik anında uygulanır ve bu tarayıcıda ' +
      "saklanır. Herkes için kalıcı yapmak isterseniz Kategoriler bölümünün altındaki " +
      "düğmeyi kullanın.</p>";
    kutu.hidden = false;

    var renk = kutu.querySelector(".sn-renk");
    var kalinlik = kutu.querySelector(".sn-kalinlik");
    var deger = kutu.querySelector(".sn-deger");
    var onizleme = kutu.querySelector(".sn-onizleme");
    var kesikli = kutu.querySelector(".sn-kesikli");
    var etiket = kutu.querySelector(".sn-etiket");

    var onizlemeYaz = function () {
      var g = sinirAyar();
      onizleme.style.borderTop = Math.max(1, g.kalinlik) + "px " +
        (g.kesikli ? "dashed " : "solid ") + ilceSinirRengi();
      deger.textContent = sayi(g.kalinlik, 2) + " px";
    };

    var uygula = function (yeni) {
      var anahtar;
      for (anahtar in yeni) {
        var varsayilan = (D.ozet.ilce_sinir || {})[anahtar];
        if (varsayilan === undefined) varsayilan = SINIR_VARSAYILAN[anahtar];
        if (String(yeni[anahtar]) === String(varsayilan)) delete D.ozelSinir[anahtar];
        else D.ozelSinir[anahtar] = yeni[anahtar];
      }
      yerelYaz("sinirOzel", D.ozelSinir);
      ilceSinirGuncelle();
      onizlemeYaz();
      ozelSatirGuncelle();
    };

    renk.addEventListener("input", function () { uygula({ renk: renk.value }); });
    kutu.querySelectorAll(".hazir").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        renk.value = b.dataset.renk;
        uygula({ renk: b.dataset.renk });
      };
    });
    kalinlik.addEventListener("input", function () {
      uygula({ kalinlik: parseFloat(kalinlik.value) });
    });
    kesikli.addEventListener("change", function () { uygula({ kesikli: kesikli.checked }); });
    etiket.addEventListener("change", function () {
      uygula({ etiket_goster: etiket.checked });
    });
    kutu.querySelector(".sn-sifirla").onclick = function (e) {
      e.preventDefault();
      D.ozelSinir = {};
      yerelYaz("sinirOzel", D.ozelSinir);
      ilceSinirGuncelle(); ozelSatirGuncelle();
      kutu.hidden = true; kutu.innerHTML = "";
      bildir("Sınır çizgisi varsayılana döndürüldü.");
    };
    kutu.querySelector(".sn-kapat").onclick = function (e) {
      e.preventDefault(); kutu.hidden = true; kutu.innerHTML = "";
    };
    onizlemeYaz();
  }

  /* ---------------------------------------------------------- tip / ilçe */
  function tipListesiCiz() {
    var kap = $("#tip-liste");
    kap.innerHTML = Object.keys(D.ozet.tipler).map(function (t) {
      return '<button class="rozet-secim' + (D.seciliTip.has(t) ? " secili" : "") +
        '" data-tip="' + kacar(t) + '">' + kacar(t) +
        "<small>" + sayi(D.ozet.tipler[t].uzunluk_km, 0) + " km</small></button>";
    }).join("");
    kap.querySelectorAll("[data-tip]").forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.tip;
        if (D.seciliTip.has(t)) D.seciliTip.delete(t); else D.seciliTip.add(t);
        tipListesiCiz(); katmanlariYenile();
      };
    });
    baslikSayisi("#bolum-tip", D.seciliTip.size);
  }

  function ilceListesiCiz() {
    if (!D.ozet.ilce_verisi_var) return;
    var kap = $("#ilce-liste");
    kap.innerHTML = Object.keys(D.ozet.ilceler).map(function (i) {
      var k = D.ozet.ilceler[i];
      if (k.yol_yok) {
        return '<button class="rozet-secim yolsuz" disabled title="' + kacar(i) +
          ' ilçesinde henüz kayıtlı yol yok">' + kacar(i) + "<small>–</small></button>";
      }
      return '<button class="rozet-secim' + (D.seciliIlce.has(i) ? " secili" : "") +
        '" data-ilce="' + kacar(i) + '">' + kacar(i) +
        "<small>" + sayi(k.uzunluk_km, 0) + " km</small></button>";
    }).join("");
    kap.querySelectorAll("[data-ilce]").forEach(function (b) {
      b.onclick = function () {
        var i = b.dataset.ilce;
        if (D.seciliIlce.has(i)) D.seciliIlce.delete(i); else D.seciliIlce.add(i);
        ilceListesiCiz(); katmanlariYenile();
      };
    });
    baslikSayisi("#bolum-ilce", D.seciliIlce.size);
    ilceSinirGuncelle();
  }

  function baslikSayisi(secici, adet) {
    var h = document.querySelector(secici + " h2");
    if (!h) return;
    var temel = h.dataset.temel || h.textContent.trim();
    h.dataset.temel = temel;
    h.textContent = adet ? temel + " (" + adet + " seçili)" : temel;
  }

  /* ------------------------------------------------------- kalite / yardım */
  function kaliteCiz() {
    var u = D.ozet.uyarilar || [];
    if (!u.length) return;
    $("#bolum-kalite").style.display = "";
    $("#kalite-liste").innerHTML = u.map(function (x) {
      return '<div class="not-kutu" style="margin-bottom:8px"><strong>' + kacar(x.baslik) + "</strong><br>" +
        kacar(x.mesaj) + (x.ornek && x.ornek.length
          ? '<br><span class="kucuk" style="color:inherit;opacity:.85">Kayıt no: ' +
            kacar(x.ornek.join(", ")) + (x.adet > x.ornek.length ? " …" : "") + "</span>"
          : "") + "</div>";
    }).join("");
  }

  function yardimCiz() {
    var el = $("#yardim-kategoriler");
    if (!el) return;
    el.innerHTML = "<ul>" + kategoriSiralari().map(function (d) {
      var k = D.ozet.kategoriler[d];
      return "<li><span style='display:inline-block;width:14px;height:5px;border-radius:3px;background:" +
        kacar(katRenk(d)) + ";vertical-align:middle;margin-right:7px'></span><strong>" +
        kacar(katAd(d)) + "</strong> — " + kacar(k.aciklama) + " (" + sayi(k.uzunluk_km, 1) + " km)</li>";
    }).join("") + "</ul>";
    $("#yardim-not").textContent = D.ozet.site["not"] || "";
  }

  /* ------------------------------------------------------------------ hash */
  function hashYaz() {
    if (!D.harita) return;
    var c = D.harita.getCenter();
    var kume = function (s) { return Array.from(s).map(encodeURIComponent).join(","); };
    var p = ["h=" + Math.round(D.harita.getZoom() * 100) / 100 +
      "/" + c.lat.toFixed(5) + "/" + c.lng.toFixed(5)];
    if (D.seciliKategori.size !== Object.keys(D.ozet.kategoriler).length) {
      p.push("k=" + kume(D.seciliKategori));
    }
    if (D.seciliTip.size) p.push("t=" + kume(D.seciliTip));
    if (D.seciliIlce.size) p.push("i=" + kume(D.seciliIlce));
    history.replaceState(null, "", "#" + p.join("&"));
  }

  function hashOku() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return null;
    var p = new URLSearchParams(h), sonuc = {};
    if (p.get("h")) {
      var b = p.get("h").split("/");
      if (b.length === 3) sonuc.gorunum = { z: +b[0], lat: +b[1], lng: +b[2] };
    }
    if (p.get("k")) sonuc.k = p.get("k").split(",");
    if (p.get("t")) sonuc.t = p.get("t").split(",");
    if (p.get("i")) sonuc.i = p.get("i").split(",");
    return sonuc;
  }

  /* -------------------------------------------------------------- başlangıç */
  function haritaKur(ozet) {
    D.harita = L.map("harita", {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 7,
      maxZoom: 19,
      zoomSnap: 0.5,
      zoomDelta: 0.5
    });
    L.control.zoom({ position: "topright" }).addTo(D.harita);
    L.control.scale({ imperial: false, position: "bottomright", maxWidth: 120 }).addTo(D.harita);
    D.cizer = L.canvas({ padding: 0.2 });
    altlikKur();

    var b = ozet.bbox;
    D.harita.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [24, 24] });

    D.harita.on("moveend", function () { katmanlariCiz(false); hashYaz(); });

    var beklemede = false, sonLatLng = null;
    D.harita.on("mousemove", function (e) {
      $("#koordinat").textContent = e.latlng.lat.toFixed(5) + ", " + e.latlng.lng.toFixed(5);
      if (D.olcum) return;
      sonLatLng = e.latlng;
      if (beklemede) return;
      beklemede = true;
      requestAnimationFrame(function () {
        beklemede = false;
        hoverGoster(yolBul(sonLatLng, 10));
      });
    });
    D.harita.on("mouseout", function () { hoverGoster(null); });

    D.harita.on("click", function (e) {
      if (D.olcum) { olcumNoktaEkle(e.latlng); return; }
      if (e.originalEvent && e.originalEvent.altKey) {
        var k = e.latlng.lat.toFixed(6) + ", " + e.latlng.lng.toFixed(6);
        panoyaKopyala(k); bildir("Koordinat kopyalandı: " + k);
        return;
      }
      var f = yolBul(e.latlng, TIKLAMA_ESIGI);
      if (f) { yolSec(f, e.latlng); }
      else { vurguyuKaldir(); D.harita.closePopup(); }
    });
    D.harita.on("dblclick", function () { if (D.olcum) olcumBitir(); });
  }

  function dugmeleriKur() {
    $("#btn-tema").onclick = function () {
      temaUygula(koyuMu() ? "acik" : "koyu");
    };

    $("#btn-konum").onclick = function () {
      bildir("Konum alınıyor…");
      D.harita.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    };

    $("#btn-olcum").onclick = olcumAcKapat;
    $("#olcum-temizle").onclick = olcumTemizle;
    $("#olcum-bitir").onclick = olcumBitir;

    $("#btn-indir").onclick = function (e) {
      e.stopPropagation();
      $("#menu-indir").classList.toggle("acik");
    };
    document.addEventListener("click", function () { $("#menu-indir").classList.remove("acik"); });
    $("#menu-indir").addEventListener("click", function (e) { e.stopPropagation(); });

    $("#btn-link").onclick = function () {
      hashYaz(); panoyaKopyala(location.href);
      bildir("Bağlantı kopyalandı — bu görünümü paylaşabilirsiniz.");
      $("#menu-indir").classList.remove("acik");
    };

    function yardimAc(e) { if (e) e.preventDefault(); $("#perde-yardim").classList.add("acik"); }
    $("#btn-yardim").onclick = yardimAc;
    $("#link-yardim").onclick = yardimAc;

    $$("[data-kapat]").forEach(function (b) {
      b.onclick = function () { document.getElementById(b.dataset.kapat).classList.remove("acik"); };
    });
    $$(".perde").forEach(function (p) {
      p.addEventListener("click", function (e) { if (e.target === p) p.classList.remove("acik"); });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        $$(".perde").forEach(function (p) { p.classList.remove("acik"); });
        $("#menu-indir").classList.remove("acik");
        if (D.olcum) olcumBitir();
        vurguyuKaldir();
        D.harita.closePopup();
      }
      if (e.key === "/" && document.activeElement !== $("#arama")) {
        e.preventDefault(); $("#arama").focus();
      }
    });

    $("#panel-ac").onclick = function () { $("#panel").classList.toggle("kapali"); };

    $("#kategori-hepsi").onclick = function () {
      var hepsi = Object.keys(D.ozet.kategoriler);
      if (D.seciliKategori.size === hepsi.length) D.seciliKategori.clear();
      else hepsi.forEach(function (d) { D.seciliKategori.add(d); });
      kategoriListesiCiz(); katmanlariYenile();
    };

    var sinirDuzenle = $("#sinir-duzenle");
    if (sinirDuzenle) sinirDuzenle.onclick = function (e) {
      e.preventDefault(); sinirDuzenleyiciAcKapat();
    };

    var sinirKutu = $("#ilce-sinir-goster");
    if (sinirKutu) {
      sinirKutu.checked = D.ilceGoster;
      sinirKutu.onchange = function () {
        D.ilceGoster = sinirKutu.checked;
        yerelYaz("ilceGoster", D.ilceGoster);
        ilceSinirGuncelle();
      };
    }

    $("#btn-kalici").onclick = kaliciPencereAc;
    $("#btn-ozel-sifirla").onclick = function () {
      D.ozelKategori = {};
      D.ozelSinir = {};
      yerelYaz("kategoriOzel", D.ozelKategori);
      yerelYaz("sinirOzel", D.ozelSinir);
      var se = $("#sinir-editor");
      if (se) { se.hidden = true; se.innerHTML = ""; }
      kategoriListesiCiz(); katmanlariYenile(); yardimCiz(); ilceSinirGuncelle();
      bildir("Tüm görünüm değişiklikleri sıfırlandı.");
    };
    $("#kalici-kopyala").onclick = function () {
      panoyaKopyala($("#kalici-json").value);
      bildir("JSON panoya kopyalandı.");
    };

    $$(".bolum.kapanabilir h2").forEach(function (h) {
      h.onclick = function () { h.parentElement.classList.toggle("kapali"); };
    });

    D.harita.on("locationfound", function (e) {
      if (D.konumIsaret) D.harita.removeLayer(D.konumIsaret);
      D.konumIsaret = L.circleMarker(e.latlng, {
        radius: 8, color: "#fff", weight: 3, fillColor: "#0d7c8a", fillOpacity: 1
      }).addTo(D.harita).bindPopup("Buradasınız (±" + Math.round(e.accuracy) + " m)").openPopup();
    });
    D.harita.on("locationerror", function () {
      bildir("Konum alınamadı. Tarayıcı izinlerini kontrol edin.");
    });
  }

  function basligiYaz(ozet) {
    document.title = ozet.site.baslik + " · İzmir";
    $("#site-baslik").textContent = ozet.site.baslik;
    $("#site-altbaslik").textContent = ozet.site.alt_baslik;
    $("#site-not").textContent = ozet.site["not"];
    $("#guncelleme").textContent = ozet.guncelleme;
    $("#kaynak").textContent = ozet.kaynak_dosya + " · " + sayi(ozet.toplam_km, 1) +
      " km · " + sayi(ozet.adlar.length) + " farklı yol adı";
    $("#boyut-geojson").textContent = ozet.veri_boyut_mb + " MB";
    $("#boyut-kml").textContent = ozet.kaynak_boyut_mb + " MB";
  }

  function baslat() {
    temaBaslat();
    D.ozelKategori = yerelOku("kategoriOzel", {}) || {};
    D.ozelSinir = yerelOku("sinirOzel", {}) || {};

    fetch("veri/ozet.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("ozet.json bulunamadı (" + r.status + ")");
        return r.json();
      })
      .then(function (ozet) {
        D.ozet = ozet;
        basligiYaz(ozet);
        $("#yukleniyor-alt").textContent = "Yaklaşık " + ozet.veri_boyut_mb + " MB veri";
        haritaKur(ozet);

        var h = hashOku() || {};
        Object.keys(ozet.kategoriler).forEach(function (d) {
          var acik = ozet.kategoriler[d].varsayilan_acik !== false;
          if (h.k) acik = h.k.indexOf(d) !== -1;
          if (acik) D.seciliKategori.add(d);
        });
        if (h.t) h.t.forEach(function (t) { D.seciliTip.add(t); });
        if (h.i) h.i.forEach(function (i) { D.seciliIlce.add(i); });
        if (h.gorunum) D.harita.setView([h.gorunum.lat, h.gorunum.lng], h.gorunum.z);

        D.ilceGoster = yerelOku("ilceGoster", true) !== false;
        if (ozet.ilce_verisi_var) {
          var bol = $("#bolum-ilce");
          bol.style.display = "";
          bol.classList.remove("kapali");
          var bilgi = ozet.ilce_bilgi || {};
          var oran = bilgi.tutma === undefined ? null : Math.round(bilgi.tutma * 1000) / 10;
          var yollu = 0, yolsuz = 0;
          Object.keys(ozet.ilceler || {}).forEach(function (i) {
            if (i === "Belirlenemedi") return;
            if (ozet.ilceler[i].yol_yok) yolsuz++; else yollu++;
          });
          $("#ilce-not").textContent =
            sayi(bilgi.adet || 0) + " ilçe sınırı okundu" +
            (bilgi.projeksiyon ? " (" + bilgi.projeksiyon + ")" : "") +
            (oran !== null ? "; yolların %" + sayi(oran, 1) + "'i bir ilçeye atandı" : "") +
            ". " + sayi(yollu) + " ilçede kayıtlı yol var" +
            (yolsuz ? ", " + sayi(yolsuz) + " ilçede henüz yok (soluk gösterilenler)" : "") + ".";
        }
        kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz();
        kaliteCiz(); yardimCiz(); aramaKur(); aramaCiz(""); dugmeleriKur();

        return fetch("veri/yollar.geojson", { cache: "no-cache" });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("yollar.geojson bulunamadı (" + r.status + ")");
        return r.json();
      })
      .then(function (gj) {
        D.ozellikler = gj.features;
        D.ozellikler.forEach(function (f) {
          var g = f.geometry;
          f.parcalar = g.type === "LineString" ? [g.coordinates] : g.coordinates;
          f.ll = f.parcalar.map(function (p) {
            return p.map(function (c) { return L.latLng(c[1], c[0]); });
          });
          var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          f.parcalar.forEach(function (p) {
            for (var i = 0; i < p.length; i++) {
              if (p[i][0] < x0) x0 = p[i][0];
              if (p[i][0] > x1) x1 = p[i][0];
              if (p[i][1] < y0) y0 = p[i][1];
              if (p[i][1] > y1) y1 = p[i][1];
            }
          });
          f.bbox = [x0, y0, x1, y1];
          var d = f.properties.durum;
          (D.durumaGore[d] = D.durumaGore[d] || []).push(f);
        });
        izgaraKur();
        katmanlariYenile();
        ilceSinirlariYukle();
        $("#yukleniyor").style.display = "none";
        if (window.innerWidth <= 860) $("#panel").classList.add("kapali");
        window.IZMIR_HARITA = D;                 // ileri düzey kullanım / hata ayıklama
        document.body.dataset.hazir = "1";
      })
      .catch(function (e) {
        $("#yukleniyor").innerHTML =
          '<div style="max-width:440px;padding:24px;text-align:center">' +
          '<div style="font-size:34px;margin-bottom:8px">⚠️</div>' +
          '<div style="font-weight:700;margin-bottom:6px">Veri yüklenemedi</div>' +
          '<div class="kucuk">' + kacar(e.message) + "<br><br>" +
          "Site henüz derlenmemiş olabilir. GitHub deposunda <b>Actions</b> sekmesinden " +
          "son derlemenin başarılı olup olmadığını kontrol edin.</div></div>";
        console.error(e);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", baslat);
  else baslat();
})();
