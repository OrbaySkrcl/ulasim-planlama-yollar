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
    parcalar: [],              // çizim/tıklama birimi: yol parçaları
    parcaDurum: {},            // durum -> parça kayıtları
    yuklenen: {},              // durum -> true (kategori verisi indirildi mi)
    yukleniyor: {},            // durum -> Promise
    katmanlar: {},
    izgara: null,
    seciliKategori: new Set(),
    seciliTip: new Set(),
    seciliIlce: new Set(),
    ozelKategori: {},          // kullanıcının kendi ad/renk değişiklikleri
    ozelSinir: {},             // sınır çizgisi görünümü değişiklikleri (tür bazlı)
    vurgu: null,
    hover: null,
    hoverKatman: null,
    olcum: null,
    sinir: {},                 // tür -> {veri, katman, vurgu, etiketler, goster}
    seciliMahalle: new Set(),
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

  function katCizimEsigi(durum) {
    var o = D.ozelKategori[durum] || {};
    if (o.cizim_min_zoom !== undefined && o.cizim_min_zoom !== null) return o.cizim_min_zoom;
    return (D.ozet.kategoriler[durum] || {}).cizim_min_zoom || 0;
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
      tumSinirlariGuncelle(true);
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
  // LatLng dizileri ilk kullanıldığında üretilir; 1,1 milyon noktalık veride
  // her şeyi baştan nesneye çevirmek gereksiz bellek harcar.
  function parcaLatLng(q) {
    if (!q.ll) {
      q.ll = q.p.map(function (c) { return L.latLng(c[1], c[0]); });
    }
    return q.ll;
  }

  function yolLatLng(f) {
    return f.kayitlar.map(parcaLatLng);
  }

  // Uzaktan bakarken her kırılma noktasını çizmenin anlamı yok: z10'da bir
  // piksel ~150 m, noktalar ise ~50 m aralıklı. Yakınlığa göre seyreltiyoruz.
  function seyreltmeOrani(z) {
    if (z >= 15) return 1;
    if (z >= 13) return 2;
    if (z >= 11) return 4;
    return 8;
  }

  function parcaLatLngSeyrek(q, oran) {
    if (oran <= 1 || q.p.length <= 4) return parcaLatLng(q);
    var anahtar = "ll" + oran;
    if (!q[anahtar]) {
      var p = q.p, out = [];
      for (var i = 0; i < p.length; i += oran) out.push(L.latLng(p[i][1], p[i][0]));
      var son = p[p.length - 1];
      var sonEklenen = out[out.length - 1];
      if (!sonEklenen || sonEklenen.lat !== son[1] || sonEklenen.lng !== son[0]) {
        out.push(L.latLng(son[1], son[0]));
      }
      q[anahtar] = out;
    }
    return q[anahtar];
  }

  function izgaraEkle(yeniler) {
    if (!D.izgara) D.izgara = new Map();
    var ekle = function (x, y, i) {
      var a = Math.round(x / IZGARA) + "|" + Math.round(y / IZGARA);
      var s = D.izgara.get(a);
      if (!s) { s = []; D.izgara.set(a, s); }
      if (s[s.length - 1] !== i) s.push(i);
    };
    yeniler.forEach(function (q) {
      var i = q.sira, p = q.p;
      for (var j = 0; j < p.length; j++) {
        ekle(p[j][0], p[j][1], i);
        if (j > 0) {                         // uzun kenarlarda ara noktalar
          var a = p[j - 1], b = p[j];
          var dx = b[0] - a[0], dy = b[1] - a[1];
          var n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (IZGARA * 0.5));
          for (var k = 1; k < n; k++) ekle(a[0] + dx * k / n, a[1] + dy * k / n, i);
        }
      }
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
      var kayit = D.parcalar[aday[n]];
      if (!kayit) continue;
      var f = kayit.f;
      if (!D.seciliKategori.has(f.properties.durum) || !gecerliMi(f.properties)) continue;
      if (D.harita.getZoom() < katCizimEsigi(f.properties.durum)) continue;
      var parca = parcaLatLng(kayit);
      for (var j = 1; j < parca.length; j++) {
        var a = D.harita.latLngToContainerPoint(parca[j - 1]);
        var b = D.harita.latLngToContainerPoint(parca[j]);
        var d = L.LineUtil.pointToSegmentDistance(p, a, b);
        if (d < enIyiD) { enIyiD = d; enIyi = f; }
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
    if (D.seciliMahalle.size && !D.seciliMahalle.has(p.mahalle || "Belirlenemedi")) return false;
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
    var simdikiZoom = D.harita.getZoom();
    var zoomGizli = [];
    kategoriSiralari().reverse().forEach(function (durum) {
      if (!D.seciliKategori.has(durum)) return;
      var esik = katCizimEsigi(durum);
      if (simdikiZoom < esik) { zoomGizli.push({ durum: durum, esik: esik }); return; }
      var cizgiler = [];
      var liste = D.parcaDurum[durum] || [];
      var oran = seyreltmeOrani(simdikiZoom);
      for (var n = 0; n < liste.length; n++) {
        var q = liste[n], b = q.b;
        if (b[0] > dogu || b[2] < bati || b[1] > kuzey || b[3] < guney) continue;
        if (!gecerliMi(q.f.properties)) continue;
        cizgiler.push(parcaLatLngSeyrek(q, oran));
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
    kategoriZoomNotu(zoomGizli, simdikiZoom);
    hashYaz();
  }

  // Kalabalık kategoriler uzaktan çizilmez; kullanıcı bunu bilsin
  function kategoriZoomNotu(gizliler, zoom) {
    var el = $("#kategori-zoom-notu");
    if (!el) return;
    if (!gizliler.length) { el.hidden = true; return; }
    var enDusuk = Math.min.apply(null, gizliler.map(function (g) { return g.esik; }));
    el.hidden = false;
    el.textContent = "🔍 " + gizliler.map(function (g) { return katAd(g.durum); }).join(", ") +
      ": çok kalabalık olduğu için z" + enDusuk + " yakınlıktan itibaren çiziliyor " +
      "(şu an z" + sayi(zoom, 1) + "). Yakınlaştırın ya da ✎ ile eşiği değiştirin.";
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
      (p.mahalle ? "<tr><td>Mahalle</td><td>" + kacar(p.mahalle) + "</td></tr>" : "") +
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
    var parca = yolLatLng(f)[0];
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
    D.hoverKatman = L.polyline(yolLatLng(f), {
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
    // Aranan yol henüz indirilmemiş bir kategoride olabilir
    var kayit = (D.ozet.adlar || []).filter(function (a) { return a.ad === ad; })[0];
    var gerekli = kayit ? Object.keys(kayit.durumlar || {}) : [];
    // Açık kategorilerde varsa yalnızca onları indir; hiçbirinde yoksa
    // kapalı kategoriyi açmak gerekir (yoksa yol hiç görünmez).
    var acik = gerekli.filter(function (d) { return D.seciliKategori.has(d); });
    var hedef = acik.length ? acik : gerekli;
    var eksik = hedef.filter(function (d) { return !D.yuklenen[d]; });
    if (eksik.length) {
      eksik.forEach(function (d) { D.seciliKategori.add(d); });
      kategoriListesiCiz();
      bildir("Veri yükleniyor…");
      kategorileriYukle(eksik).then(function () { adaGit(ad); });
      return;
    }
    var secilenler = D.ozellikler.filter(function (f) { return f.properties.ad === ad; });
    if (!secilenler.length) return;

    var degisti = false;
    secilenler.forEach(function (f) {
      if (!D.seciliKategori.has(f.properties.durum)) {
        D.seciliKategori.add(f.properties.durum); degisti = true;
      }
    });
    if (D.seciliTip.size || D.seciliIlce.size || D.seciliMahalle.size) {
      D.seciliTip.clear(); D.seciliIlce.clear(); D.seciliMahalle.clear();
      degisti = true;
    }
    if (degisti) {
      kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz(); mahalleListesiCiz();
      tumSinirlariGuncelle(true);
    }
    katmanlariYenile();

    vurguyuKaldir();
    var cizgiler = [];
    secilenler.forEach(function (f) {
      var llf = yolLatLng(f);
      for (var i = 0; i < llf.length; i++) cizgiler.push(llf[i]);
    });
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
        var durum = el.dataset.durum;
        if (el.checked) {
          D.seciliKategori.add(durum);
          kategoriYukle(durum).then(katmanlariYenile);
        } else {
          D.seciliKategori.delete(durum);
          katmanlariYenile();
        }
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
      '<label class="ed-etiket" style="margin-top:12px">Çizilmeye başladığı yakınlık</label>' +
      '<div class="ed-kaydirici">' +
        '<input type="range" class="ed-zoom" min="0" max="16" step="1" value="' +
          katCizimEsigi(durum) + '">' +
        '<span class="deger ed-zoomdeger">' +
          (katCizimEsigi(durum) ? "z" + katCizimEsigi(durum) : "her zaman") + "</span>" +
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
    var zoomGiris = kutu.querySelector(".ed-zoom");
    var zoomDeger = kutu.querySelector(".ed-zoomdeger");
    var zaman;

    var uygula = function (yeniAd, yeniRenk, yeniZoom) {
      var o = D.ozelKategori[durum] || {};
      if (yeniZoom !== undefined) {
        var vz = (D.ozet.kategoriler[durum] || {}).cizim_min_zoom || 0;
        if (yeniZoom === vz) delete o.cizim_min_zoom; else o.cizim_min_zoom = yeniZoom;
        zoomDeger.textContent = yeniZoom ? "z" + yeniZoom : "her zaman";
      }
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
    zoomGiris.addEventListener("input", function () {
      uygula(undefined, undefined, parseInt(zoomGiris.value, 10));
    });
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
    Object.keys(D.ozelSinir).forEach(function (tur) {
      var alan = tur + "_sinir";
      var sn = ham[alan] || (ham[alan] = {});
      Object.keys(D.ozelSinir[tur]).forEach(function (k) {
        sn[k] = D.ozelSinir[tur][k];
        if (k === "renk") delete sn.renk_koyu;
      });
    });
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

    var sinirOzeti = Object.keys(D.ozelSinir).map(function (tur) {
      return "<li><strong>" + kacar(SINIR_TURU[tur].ad) + " sınır çizgisi</strong>: " +
        Object.keys(D.ozelSinir[tur]).map(function (k) {
          return kacar(k) + " = " + kacar(String(D.ozelSinir[tur][k]));
        }).join(", ") + "</li>";
    }).join("");
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

  /* ------------------------------------------------------- sınır katmanları */
  // İlçe ve mahalle sınırları aynı kodla yürütülür; farkları burada tanımlı.
  var SINIR_TURU = {
    ilce: {
      ad: "İlçe", dosya: "veri/ilceler.geojson", pane: "ilcePane", paneZ: 380,
      varsayilanGoster: true,
      opaklik: 0.72,
      varsayilan: { renk: "#6b7280", renk_koyu: "#9ca3af", kalinlik: 1.2,
                    kesikli: true, etiket_goster: true,
                    etiket_min_zoom: 0, cizim_min_zoom: 0 }
    },
    mahalle: {
      ad: "Mahalle", dosya: "veri/mahalleler.geojson", pane: "mahallePane", paneZ: 375,
      varsayilanGoster: true,
      opaklik: 0.6,
      varsayilan: { renk: "#b45309", renk_koyu: "#f59e0b", kalinlik: 0.8,
                    kesikli: true, etiket_goster: true,
                    etiket_min_zoom: 12, cizim_min_zoom: 11 }
    }
  };

  function sinirDurum(tur) {
    if (!D.sinir[tur]) {
      D.sinir[tur] = { veri: null, katman: null, vurgu: null, etiketler: null,
                       goster: true, yukleniyor: false, kutu: null, zoom: null };
    }
    return D.sinir[tur];
  }

  function seciliKume(tur) {
    return tur === "ilce" ? D.seciliIlce : D.seciliMahalle;
  }

  function sinirVerisiVar(tur) {
    return !!(D.ozet && D.ozet[tur + "_verisi_var"]);
  }

  // Etkin görünüm: kullanıcı değişikliği > kategoriler.json > varsayılan
  function sinirAyar(tur) {
    var temel = {}, k;
    var tanim = SINIR_TURU[tur].varsayilan;
    for (k in tanim) temel[k] = tanim[k];
    var dosya = (D.ozet && D.ozet[tur + "_sinir"]) || {};
    for (k in dosya) if (dosya[k] !== null && dosya[k] !== undefined) temel[k] = dosya[k];
    var ozel = D.ozelSinir[tur] || {};
    for (k in ozel) if (ozel[k] !== null && ozel[k] !== undefined) temel[k] = ozel[k];
    return temel;
  }

  function sinirRengi(tur) {
    var a = sinirAyar(tur);
    var ozel = D.ozelSinir[tur] || {};
    if (ozel.renk) return koyuZeminMi() ? koyuIcinAyarla(ozel.renk) : ozel.renk;
    return koyuZeminMi() ? (a.renk_koyu || koyuIcinAyarla(a.renk)) : a.renk;
  }

  function sinirVurguRengi() { return koyuZeminMi() ? "#2dd4bf" : "#0a5f6a"; }

  function sinirYukle(tur) {
    var st = sinirDurum(tur);
    if (st.veri || st.yukleniyor || !sinirVerisiVar(tur)) return;
    st.yukleniyor = true;
    fetch(SINIR_TURU[tur].dosya, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (gj) {
        st.yukleniyor = false;
        if (!gj || !gj.features) return;
        // Sınır kutusu + LatLng halkaları bir kez hesaplanır
        gj.features.forEach(function (f) {
          var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          f.ll = f.geometry.coordinates.map(function (poly) {
            return poly.map(function (halka) {
              return halka.map(function (c) {
                if (c[0] < x0) x0 = c[0];
                if (c[0] > x1) x1 = c[0];
                if (c[1] < y0) y0 = c[1];
                if (c[1] > y1) y1 = c[1];
                return L.latLng(c[1], c[0]);
              });
            });
          });
          f.bbox = [x0, y0, x1, y1];
        });
        st.veri = gj;
        var tanim = SINIR_TURU[tur];
        if (!D.harita.getPane(tanim.pane)) {
          D.harita.createPane(tanim.pane);
          D.harita.getPane(tanim.pane).style.zIndex = tanim.paneZ;
        }
        st.cizer = L.canvas({ pane: tanim.pane, padding: 0.3 });
        st.etiketler = L.layerGroup();
        sinirGuncelle(tur, true);
      })
      .catch(function () { st.yukleniyor = false; });
  }

  function sinirCizimGerekliMi(tur) {
    var st = sinirDurum(tur);
    if (!st.kutu) return true;
    if (st.zoom !== D.harita.getZoom()) return true;
    return !st.kutu.contains(D.harita.getBounds());
  }

  function sinirGuncelle(tur, zorla) {
    var st = sinirDurum(tur);
    if (!st.veri) return;
    if (!zorla && !sinirCizimGerekliMi(tur)) return;

    [st.katman, st.vurgu].forEach(function (l) {
      if (l && D.harita.hasLayer(l)) D.harita.removeLayer(l);
    });
    st.katman = st.vurgu = null;
    if (st.etiketler) st.etiketler.clearLayers();

    var a = sinirAyar(tur);
    if (!st.goster || D.harita.getZoom() < (a.cizim_min_zoom || 0)) {
      if (st.etiketler && D.harita.hasLayer(st.etiketler)) D.harita.removeLayer(st.etiketler);
      st.kutu = null;
      sinirNotuYaz(tur);
      return;
    }

    var secili = seciliKume(tur);
    var sinirKutu = D.harita.getBounds().pad(0.4);
    st.kutu = sinirKutu;
    st.zoom = D.harita.getZoom();
    var bati = sinirKutu.getWest(), dogu = sinirKutu.getEast();
    var guney = sinirKutu.getSouth(), kuzey = sinirKutu.getNorth();

    var normal = [], vurgulu = [], etiketAdaylari = [];
    st.veri.features.forEach(function (f) {
      var b = f.bbox;
      if (b[0] > dogu || b[2] < bati || b[1] > kuzey || b[3] < guney) return;
      var hedef = secili.has(f.properties.ad) ? vurgulu : normal;
      for (var i = 0; i < f.ll.length; i++) hedef.push(f.ll[i]);
      etiketAdaylari.push(f);
    });

    var kesik = a.kesikli
      ? Math.max(3, a.kalinlik * 4).toFixed(1) + " " + Math.max(3, a.kalinlik * 3).toFixed(1)
      : null;
    var ortak = { pane: SINIR_TURU[tur].pane, renderer: st.cizer, interactive: false };

    if (normal.length) {
      st.katman = L.polygon(normal, Object.assign({}, ortak, {
        color: sinirRengi(tur), weight: a.kalinlik, dashArray: kesik,
        opacity: secili.size ? 0.28 : (SINIR_TURU[tur].opaklik || 0.72), fill: false
      })).addTo(D.harita);
    }
    if (vurgulu.length) {
      st.vurgu = L.polygon(vurgulu, Object.assign({}, ortak, {
        color: sinirVurguRengi(), weight: Math.max(2.2, a.kalinlik * 2),
        opacity: 1, dashArray: null,
        fill: true, fillColor: sinirVurguRengi(), fillOpacity: 0.07
      })).addTo(D.harita);
    }
    sinirEtiketleriCiz(tur, etiketAdaylari);
    sinirNotuYaz(tur);
  }

  function sinirEtiketleriCiz(tur, adaylar) {
    var st = sinirDurum(tur);
    if (!st.etiketler) return;
    st.etiketler.clearLayers();
    var a = sinirAyar(tur);
    if (!st.goster || !a.etiket_goster || D.harita.getZoom() < (a.etiket_min_zoom || 0)) {
      if (D.harita.hasLayer(st.etiketler)) D.harita.removeLayer(st.etiketler);
      return;
    }
    var koyu = koyuZeminMi();
    var secili = seciliKume(tur);
    var kayitlar = (D.ozet[tur === "ilce" ? "ilceler" : "mahalleler"]) || {};
    var gorunen = D.harita.getBounds();
    var sayac = 0;
    adaylar.forEach(function (f) {
      if (sayac >= 200) return;
      var e = f.properties.etiket;
      if (!e || !gorunen.contains([e[1], e[0]])) return;
      sayac++;
      var kayit = kayitlar[f.properties.ad];
      var sinif = "ilce-etiket " + tur + (koyu ? " koyu-zemin" : "") +
        (secili.has(f.properties.ad) ? " secili" : "") +
        (!kayit || kayit.yol_yok ? " yolsuz" : "");
      st.etiketler.addLayer(L.marker([e[1], e[0]], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: sinif, iconSize: null,
                          html: "<span>" +
                                kacar(f.properties.kisa || f.properties.ad) + "</span>" })
      }));
    });
    if (sayac && !D.harita.hasLayer(st.etiketler)) st.etiketler.addTo(D.harita);
    if (!sayac && D.harita.hasLayer(st.etiketler)) D.harita.removeLayer(st.etiketler);
  }

  // Katman açıkken yakınlık eşiği yüzünden gizliyse kullanıcıya söyle
  function sinirNotuYaz(tur) {
    var el = $("#" + tur + "-zoom-notu");
    if (!el) return;
    var st = sinirDurum(tur);
    var a = sinirAyar(tur);
    var esik = a.cizim_min_zoom || 0;
    if (st.goster && esik && D.harita.getZoom() < esik) {
      el.hidden = false;
      el.textContent = "🔍 " + SINIR_TURU[tur].ad + " sınırları z" + esik +
        " yakınlıktan itibaren çizilir (şu an z" + sayi(D.harita.getZoom(), 1) +
        "). Haritayı yakınlaştırın.";
    } else {
      el.hidden = true;
    }
  }

  function tumSinirlariGuncelle(zorla) {
    Object.keys(SINIR_TURU).forEach(function (tur) {
      if (sinirVerisiVar(tur)) sinirGuncelle(tur, zorla);
    });
  }

  /* ------------------------------------------------ sınır çizgisi düzenleyici */
  var SINIR_HAZIR_RENK = ["#6b7280", "#1f2937", "#0a5f6a", "#b45309",
                          "#7c3aed", "#be123c", "#15803d", "#0369a1"];

  function sinirDuzenleyiciAcKapat(tur) {
    var kutu = $("#" + tur + "-sinir-editor");
    if (!kutu) return;
    if (!kutu.hidden) { kutu.hidden = true; kutu.innerHTML = ""; return; }

    var a = sinirAyar(tur);
    kutu.innerHTML =
      '<label class="ed-etiket">Sınır çizgisi rengi</label>' +
      '<div class="renk-satir">' +
        '<input type="color" class="sn-renk" value="' + kacar(a.renk) + '">' +
        '<div class="hazir-renkler">' + SINIR_HAZIR_RENK.map(function (h) {
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
        "<span>" + kacar(SINIR_TURU[tur].ad) + " adlarını haritada göster</span></label>" +
      '<label class="ed-etiket" style="margin-top:12px">Sınırların görünmeye başladığı yakınlık</label>' +
      '<div class="ed-kaydirici">' +
        '<input type="range" class="sn-cizimzoom" min="0" max="16" step="1" value="' +
          (a.cizim_min_zoom || 0) + '">' +
        '<span class="deger sn-cizimdeger">' +
          (a.cizim_min_zoom ? "z" + a.cizim_min_zoom : "her zaman") + "</span>" +
      "</div>" +
      '<label class="ed-etiket" style="margin-top:12px">Adların görünmeye başladığı yakınlık</label>' +
      '<div class="ed-kaydirici">' +
        '<input type="range" class="sn-zoom" min="0" max="16" step="1" value="' +
          (a.etiket_min_zoom || 0) + '">' +
        '<span class="deger sn-zoomdeger">' +
          (a.etiket_min_zoom ? "z" + a.etiket_min_zoom : "her zaman") + "</span>" +
      "</div>" +
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
    var zoom = kutu.querySelector(".sn-zoom");
    var zoomDeger = kutu.querySelector(".sn-zoomdeger");
    var cizimZoom = kutu.querySelector(".sn-cizimzoom");
    var cizimDeger = kutu.querySelector(".sn-cizimdeger");

    var onizlemeYaz = function () {
      var g = sinirAyar(tur);
      onizleme.style.borderTop = Math.max(1, g.kalinlik) + "px " +
        (g.kesikli ? "dashed " : "solid ") + sinirRengi(tur);
      deger.textContent = sayi(g.kalinlik, 2) + " px";
      zoomDeger.textContent = g.etiket_min_zoom ? "z" + g.etiket_min_zoom : "her zaman";
      cizimDeger.textContent = g.cizim_min_zoom ? "z" + g.cizim_min_zoom : "her zaman";
    };

    var uygula = function (yeni) {
      var ozel = D.ozelSinir[tur] || (D.ozelSinir[tur] = {});
      Object.keys(yeni).forEach(function (anahtar) {
        var varsayilan = ((D.ozet || {})[tur + "_sinir"] || {})[anahtar];
        if (varsayilan === undefined) varsayilan = SINIR_TURU[tur].varsayilan[anahtar];
        if (String(yeni[anahtar]) === String(varsayilan)) delete ozel[anahtar];
        else ozel[anahtar] = yeni[anahtar];
      });
      if (!Object.keys(ozel).length) delete D.ozelSinir[tur];
      yerelYaz("sinirOzel", D.ozelSinir);
      sinirGuncelle(tur, true);
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
    etiket.addEventListener("change", function () { uygula({ etiket_goster: etiket.checked }); });
    zoom.addEventListener("input", function () {
      uygula({ etiket_min_zoom: parseInt(zoom.value, 10) });
    });
    cizimZoom.addEventListener("input", function () {
      uygula({ cizim_min_zoom: parseInt(cizimZoom.value, 10) });
    });
    kutu.querySelector(".sn-sifirla").onclick = function (e) {
      e.preventDefault();
      delete D.ozelSinir[tur];
      yerelYaz("sinirOzel", D.ozelSinir);
      sinirGuncelle(tur, true); ozelSatirGuncelle();
      kutu.hidden = true; kutu.innerHTML = "";
      bildir(SINIR_TURU[tur].ad + " sınır çizgisi varsayılana döndürüldü.");
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
        ilceListesiCiz(); mahalleListesiCiz(); katmanlariYenile();
      };
    });
    baslikSayisi("#bolum-ilce", D.seciliIlce.size);
    sinirGuncelle("ilce", true);
  }

  function mahalleListesiCiz() {
    if (!D.ozet.mahalle_verisi_var) return;
    var kap = $("#mahalle-liste");
    var giris = $("#mahalle-arama");
    var sorgu = normalize(giris ? giris.value : "");
    var hepsi = D.ozet.mahalleler || {};

    var liste = Object.keys(hepsi).filter(function (m) {
      var k = hepsi[m];
      if (sorgu.length >= 2) return normalize(m).indexOf(sorgu) !== -1;
      if (k.yol_yok) return false;                       // aramasız: yolu olanlar
      if (D.seciliIlce.size && !D.seciliIlce.has(k.ilce)) return false;
      return true;
    });
    liste.sort(function (a, b) {
      return (hepsi[b].uzunluk_km - hepsi[a].uzunluk_km) || a.localeCompare(b, "tr");
    });

    var gosterilen = liste.slice(0, 60);
    kap.innerHTML = gosterilen.map(function (m) {
      var k = hepsi[m];
      if (k.yol_yok) {
        return '<button class="rozet-secim yolsuz" disabled title="' + kacar(m) +
          ' mahallesinde henüz kayıtlı yol yok">' + kacar(m) + "<small>–</small></button>";
      }
      return '<button class="rozet-secim' + (D.seciliMahalle.has(m) ? " secili" : "") +
        '" data-mahalle="' + kacar(m) + '" title="' + kacar(k.ilce || "") + '">' +
        kacar(m) + "<small>" + sayi(k.uzunluk_km, 0) + " km</small></button>";
    }).join("") || '<span class="kucuk">Eşleşen mahalle yok.</span>';

    kap.querySelectorAll("[data-mahalle]").forEach(function (b) {
      b.onclick = function () {
        var m = b.dataset.mahalle;
        if (D.seciliMahalle.has(m)) D.seciliMahalle.delete(m);
        else D.seciliMahalle.add(m);
        mahalleListesiCiz(); katmanlariYenile(); sinirGuncelle("mahalle", true);
      };
    });

    var yollu = 0, toplam = 0;
    Object.keys(hepsi).forEach(function (m) {
      if (m === "Belirlenemedi") return;
      toplam++;
      if (!hepsi[m].yol_yok) yollu++;
    });
    var fazla = liste.length - gosterilen.length;
    $("#mahalle-not").textContent =
      sayi(toplam) + " mahalle sınırı okundu; " + sayi(yollu) + " mahallede kayıtlı yol var." +
      (fazla > 0 ? " Listede ilk 60 tanesi görünüyor (" + sayi(fazla) +
                   " tane daha var) — aramayı kullanın." : "") +
      (sorgu.length < 2 && D.seciliIlce.size
        ? " Seçili ilçeyle sınırlandırıldı." : "");
    baslikSayisi("#bolum-mahalle", D.seciliMahalle.size);
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
    if (D.seciliMahalle.size) p.push("m=" + kume(D.seciliMahalle));
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
    if (p.get("m")) sonuc.m = p.get("m").split(",");
    return sonuc;
  }

  /* ------------------------------------------------- kategori verisi yükleme */
  // Yollar kategori başına ayrı dosyalarda tutulur; yalnızca açık kategoriler
  // indirilir. 40 bin yolun tamamı 31 MB; hepsini birden yüklemek gereksiz.
  function kategoriYukle(durum) {
    if (D.yuklenen[durum]) return Promise.resolve();
    if (D.yukleniyor[durum]) return D.yukleniyor[durum];
    var k = (D.ozet.kategoriler || {})[durum];
    if (!k || !k.dosya) { D.yuklenen[durum] = true; return Promise.resolve(); }

    kategoriDurumYaz(durum, "yükleniyor…");
    var istek = fetch("veri/" + k.dosya, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error(k.dosya + " bulunamadı (" + r.status + ")");
        return r.json();
      })
      .then(function (gj) {
        var yeniler = [];
        (gj.features || []).forEach(function (f) {
          var g = f.geometry;
          f.parcalar = g.type === "LineString" ? [g.coordinates] : g.coordinates;
          var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (var q = 0; q < f.parcalar.length; q++) {
            var p = f.parcalar[q];
            for (var i = 0; i < p.length; i++) {
              if (p[i][0] < x0) x0 = p[i][0];
              if (p[i][0] > x1) x1 = p[i][0];
              if (p[i][1] < y0) y0 = p[i][1];
              if (p[i][1] > y1) y1 = p[i][1];
            }
          }
          f.bbox = [x0, y0, x1, y1];
          D.ozellikler.push(f);
          (D.durumaGore[durum] = D.durumaGore[durum] || []).push(f);
          // Çok parçalı yolları parça bazında indeksliyoruz: tek bir kaydın
          // parçaları ilin iki ucunda olabiliyor, bütün kaydın sınır kutusuyla
          // kırpmak işe yaramıyor.
          f.kayitlar = [];
          for (var pi = 0; pi < f.parcalar.length; pi++) {
            var pp = f.parcalar[pi];
            var a0 = 1e9, c0 = 1e9, a1 = -1e9, c1 = -1e9;
            for (var pj = 0; pj < pp.length; pj++) {
              if (pp[pj][0] < a0) a0 = pp[pj][0];
              if (pp[pj][0] > a1) a1 = pp[pj][0];
              if (pp[pj][1] < c0) c0 = pp[pj][1];
              if (pp[pj][1] > c1) c1 = pp[pj][1];
            }
            var kayit = { f: f, p: pp, b: [a0, c0, a1, c1], sira: D.parcalar.length };
            D.parcalar.push(kayit);
            f.kayitlar.push(kayit);
            (D.parcaDurum[durum] = D.parcaDurum[durum] || []).push(kayit);
            yeniler.push(kayit);
          }
        });
        izgaraEkle(yeniler);
        D.yuklenen[durum] = true;
        delete D.yukleniyor[durum];
        kategoriDurumYaz(durum, null);
      })
      .catch(function (e) {
        delete D.yukleniyor[durum];
        kategoriDurumYaz(durum, "yüklenemedi");
        console.error(e);
        bildir("Kategori verisi yüklenemedi: " + katAd(durum));
      });
    D.yukleniyor[durum] = istek;
    return istek;
  }

  function kategorileriYukle(liste) {
    return Promise.all(liste.map(kategoriYukle));
  }

  // Kategori satırındaki km yazısını geçici olarak durum bilgisiyle değiştirir
  function kategoriDurumYaz(durum, metin) {
    var satir = document.querySelector('.kat[data-kat="' + CSS.escape(durum) + '"] .sayi');
    if (!satir) return;
    var k = (D.ozet.kategoriler || {})[durum] || {};
    satir.textContent = metin || (sayi(k.uzunluk_km, 1) + " km");
    satir.classList.toggle("bekliyor", !!metin);
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

    D.harita.on("moveend", function () {
      katmanlariCiz(false);
      tumSinirlariGuncelle(false);
      hashYaz();
    });

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
      if (D.seciliKategori.size === hepsi.length) {
        D.seciliKategori.clear();
        kategoriListesiCiz(); katmanlariYenile();
      } else {
        hepsi.forEach(function (d) { D.seciliKategori.add(d); });
        kategoriListesiCiz();
        kategorileriYukle(hepsi).then(katmanlariYenile);
      }
    };

    Object.keys(SINIR_TURU).forEach(function (tur) {
      var duzenle = $("#" + tur + "-sinir-duzenle");
      if (duzenle) duzenle.onclick = function (e) {
        e.preventDefault(); sinirDuzenleyiciAcKapat(tur);
      };
      var kutu = $("#" + tur + "-sinir-goster");
      if (kutu) {
        kutu.checked = sinirDurum(tur).goster;
        kutu.onchange = function () {
          sinirDurum(tur).goster = kutu.checked;
          var kayit = yerelOku("sinirGoster", {}) || {};
          kayit[tur] = kutu.checked;
          yerelYaz("sinirGoster", kayit);
          if (kutu.checked && !sinirDurum(tur).veri) sinirYukle(tur);
          else sinirGuncelle(tur, true);
        };
      }
    });

    var mahalleArama = $("#mahalle-arama");
    if (mahalleArama) {
      var mzaman;
      mahalleArama.addEventListener("input", function () {
        clearTimeout(mzaman);
        mzaman = setTimeout(mahalleListesiCiz, 150);
      });
    }

    $("#btn-kalici").onclick = kaliciPencereAc;
    $("#btn-ozel-sifirla").onclick = function () {
      D.ozelKategori = {};
      D.ozelSinir = {};
      yerelYaz("kategoriOzel", D.ozelKategori);
      yerelYaz("sinirOzel", D.ozelSinir);
      Object.keys(SINIR_TURU).forEach(function (tur) {
        var se = $("#" + tur + "-sinir-editor");
        if (se) { se.hidden = true; se.innerHTML = ""; }
      });
      kategoriListesiCiz(); katmanlariYenile(); yardimCiz(); tumSinirlariGuncelle(true);
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
    var kaynakBaglanti = $("#indir-kaynak");
    if (kaynakBaglanti) {
      if (ozet.kaynak_indirme) {
        kaynakBaglanti.hidden = false;
        kaynakBaglanti.href = "veri/" + ozet.kaynak_indirme;
        kaynakBaglanti.firstChild.nodeValue =
          (/\.(kmz|zip|gz)$/i.test(ozet.kaynak_indirme) ? "Sıkıştırılmış kaynak" : "KML — kaynak dosya") + " (";
        $("#boyut-kml").textContent = ozet.kaynak_boyut_mb + " MB";
      } else {
        // Kaynak dosya siteye konmayacak kadar büyük; GeoJSON zaten sunuluyor
        kaynakBaglanti.hidden = true;
      }
    }
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
        if (h.m) h.m.forEach(function (m) { D.seciliMahalle.add(m); });
        if (h.gorunum) D.harita.setView([h.gorunum.lat, h.gorunum.lng], h.gorunum.z);

        var gosterKayit = yerelOku("sinirGoster", {}) || {};
        Object.keys(SINIR_TURU).forEach(function (tur) {
          var st = sinirDurum(tur);
          st.goster = gosterKayit[tur] === undefined
            ? SINIR_TURU[tur].varsayilanGoster : !!gosterKayit[tur];
        });
        if (ozet.mahalle_verisi_var) {
          var mbol = $("#bolum-mahalle");
          mbol.style.display = "";
        }
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
        kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz(); mahalleListesiCiz();
        kaliteCiz(); yardimCiz(); aramaKur(); aramaCiz(""); dugmeleriKur();

        return kategorileriYukle(Array.from(D.seciliKategori));
      })
      .then(function () {
        katmanlariYenile();
        Object.keys(SINIR_TURU).forEach(function (tur) {
          if (sinirVerisiVar(tur) && sinirDurum(tur).goster) sinirYukle(tur);
        });
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
