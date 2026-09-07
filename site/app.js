/* İzmir Köy Yolları Devir Haritası
   Saf JavaScript + Leaflet. Derleme aracı gerektirmez.
   Veri: veri/ozet.json (istatistik + ayarlar) ve veri/yollar.geojson (geometri) */

(function () {
  "use strict";

  var D = {                       // uygulama durumu
    ozet: null,
    ozellikler: [],               // tüm yollar (GeoJSON Feature)
    duruma_gore: {},              // durum kodu -> Feature[]
    katmanlar: {},                // durum kodu -> L.GeoJSON
    seciliKategori: new Set(),
    seciliTip: new Set(),
    seciliIlce: new Set(),
    vurgu: null,
    konumIsaret: null,
    harita: null,
    cizer: null,
    altlik: null,
    agirlikKademe: null,
    hashYaziliyor: false
  };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

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

  var bildirimZaman;
  function bildir(mesaj) {
    var el = $("#bildirim");
    el.textContent = mesaj;
    el.classList.add("gorunur");
    clearTimeout(bildirimZaman);
    bildirimZaman = setTimeout(function () { el.classList.remove("gorunur"); }, 2400);
  }

  /* ------------------------------------------------------------------ tema */
  function temaUygula(tema) {
    document.documentElement.setAttribute("data-tema", tema);
    $("#btn-tema").textContent = tema === "koyu" ? "☀️" : "🌙";
    try { localStorage.setItem("tema", tema); } catch (e) {}
    if (D.harita && D.altlikTanim) {
      var ad = D.altlikAdi;
      if (tema === "koyu" && (ad === "Sade" || ad === "Sokak")) altligiSec("Koyu");
      else if (tema === "acik" && ad === "Koyu") altligiSec("Sokak");
    }
    if (D.ozet && D.ozellikler.length) {
      kategoriListesiCiz();
      katmanlariYenile();
      yardimCiz();
    }
  }

  function temaBaslat() {
    var t = null;
    try { t = localStorage.getItem("tema"); } catch (e) {}
    if (!t) {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "koyu" : "acik";
    }
    document.documentElement.setAttribute("data-tema", t);
    $("#btn-tema").textContent = t === "koyu" ? "☀️" : "🌙";
  }

  /* --------------------------------------------------------------- altlık */
  var ALTLIKLAR = {
    "Sokak": {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      opt: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları' }
    },
    "Sade": {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      opt: { maxZoom: 20, subdomains: "abcd", attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>' }
    },
    "Koyu": {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      opt: { maxZoom: 20, subdomains: "abcd", attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>' }
    },
    "Uydu": {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      opt: { maxZoom: 19, attribution: 'Uydu görüntüsü: Esri, Maxar, Earthstar Geographics' }
    }
  };

  function altligiSec(ad) {
    if (!ALTLIKLAR[ad]) ad = "Sokak";
    if (D.altlik) D.harita.removeLayer(D.altlik);
    D.altlik = L.tileLayer(ALTLIKLAR[ad].url, ALTLIKLAR[ad].opt).addTo(D.harita);
    D.altlik.bringToBack();
    D.altlikAdi = ad;
    $$("#altlik-secim button").forEach(function (b) {
      b.classList.toggle("secili", b.dataset.ad === ad);
    });
    try { localStorage.setItem("altlik", ad); } catch (e) {}
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
    D.altlikTanim = true;
    var kayit = null;
    try { kayit = localStorage.getItem("altlik"); } catch (e) {}
    altligiSec(kayit || (document.documentElement.getAttribute("data-tema") === "koyu" ? "Koyu" : "Sokak"));
  }

  /* -------------------------------------------------------------- çizgiler */
  function koyuMu() {
    return document.documentElement.getAttribute("data-tema") === "koyu";
  }

  function katRenk(durum) {
    var k = D.ozet && D.ozet.kategoriler[durum];
    if (!k) return "#888";
    return (koyuMu() && k.renk_koyu) ? k.renk_koyu : k.renk;
  }

  function agirlik(z) {
    if (z >= 16) return 5.5;
    if (z >= 14) return 4;
    if (z >= 12) return 2.8;
    if (z >= 10) return 2;
    return 1.4;
  }

  function stilUret(durum) {
    return {
      color: katRenk(durum),
      weight: agirlik(D.harita.getZoom()),
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function gecerliMi(p) {
    if (D.seciliTip.size && !D.seciliTip.has(p.tip)) return false;
    if (D.seciliIlce.size && !D.seciliIlce.has(p.ilce || "Belirlenemedi")) return false;
    return true;
  }

  function katmanlariYenile() {
    var toplamKm = 0, toplamAdet = 0;
    var tipSayaci = {};

    Object.keys(D.duruma_gore).forEach(function (durum) {
      if (D.katmanlar[durum]) {
        D.harita.removeLayer(D.katmanlar[durum]);
        delete D.katmanlar[durum];
      }
      if (!D.seciliKategori.has(durum)) return;

      var secilenler = D.duruma_gore[durum].filter(function (f) { return gecerliMi(f.properties); });
      secilenler.forEach(function (f) {
        toplamKm += f.properties.uzunluk_m / 1000;
        toplamAdet++;
        var t = f.properties.tip || "Belirtilmemiş";
        tipSayaci[t] = (tipSayaci[t] || 0) + f.properties.uzunluk_m / 1000;
      });
      if (!secilenler.length) return;

      var katman = L.geoJSON({ type: "FeatureCollection", features: secilenler }, {
        renderer: D.cizer,
        style: stilUret(durum),
        onEachFeature: function (f, l) {
          l.on("click", function (e) {
            L.DomEvent.stopPropagation(e);
            yolSec(f, e.latlng);
          });
          l.on("mouseover", function () {
            l.setStyle({ weight: agirlik(D.harita.getZoom()) + 3, opacity: 1 });
          });
          l.on("mouseout", function () { l.setStyle(stilUret(durum)); });
        }
      });
      katman.addTo(D.harita);
      D.katmanlar[durum] = katman;
    });

    if (D.vurgu) D.vurgu.bringToFront();

    $("#ist-km").textContent = sayi(toplamKm, 1);
    $("#ist-adet").textContent = sayi(toplamAdet, 0);
    tipTablosuYaz(tipSayaci);
    kategoriSayilariYaz();
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

  function agirlikGuncelle() {
    var kademe = agirlik(D.harita.getZoom());
    if (kademe === D.agirlikKademe) return;
    D.agirlikKademe = kademe;
    Object.keys(D.katmanlar).forEach(function (durum) {
      D.katmanlar[durum].setStyle(stilUret(durum));
    });
    if (D.vurgu) D.vurgu.setStyle({ weight: kademe + 9 });
  }

  /* ------------------------------------------------------------ yol seçimi */
  function yolSec(f, latlng) {
    var p = f.properties;
    var k = D.ozet.kategoriler[p.durum] || { ad: "Bilinmiyor" };
    var orta = latlng || haritaMerkeziBul(f);
    var koord = orta.lat.toFixed(6) + ", " + orta.lng.toFixed(6);

    var html = '<div class="pop-ad">' + kacar(p.ad) + "</div>" +
      '<div class="pop-kat"><i style="background:' + kacar(katRenk(p.durum)) + '"></i>' + kacar(k.ad) + "</div>" +
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
      '<div class="pop-eylem"><button data-ayniad="' + kacar(p.ad) + '">Bu isimli tüm parçaları göster</button></div>';

    L.popup({ maxWidth: 320, autoPanPadding: [30, 30] })
      .setLatLng(orta).setContent(html).openOn(D.harita);
  }

  function haritaMerkeziBul(f) {
    var c = f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates[0];
    var n = c[Math.floor(c.length / 2)];
    return L.latLng(n[1], n[0]);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.kopyala) {
      panoyaKopyala(t.dataset.kopyala);
      bildir("Koordinat kopyalandı: " + t.dataset.kopyala);
    }
    if (t && t.dataset && t.dataset.ayniad) {
      adaGit(t.dataset.ayniad);
      D.harita.closePopup();
    }
  });

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

  /* ---------------------------------------------------------------- arama */
  function aramaKur() {
    var giris = $("#arama"), temizle = $("#arama-temizle");
    var zaman;
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
    if (!sonuc.length) {
      kap.innerHTML = '<div class="bos">Sonuç bulunamadı.</div>';
      return;
    }
    kap.innerHTML = sonuc.slice(0, 60).map(function (a) {
      var noktalar = Object.keys(a.durumlar).sort().map(function (d) {
        var k = D.ozet.kategoriler[d];
        return '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
          kacar(k ? katRenk(d) : "#888") + ';margin-right:3px" title="' + kacar(k ? k.ad : d) + '"></i>';
      }).join("");
      return '<div class="satir" data-ad="' + kacar(a.ad) + '">' + noktalar +
        '<span class="ad">' + kacar(a.ad) + '</span>' +
        '<span class="bilgi">' + sayi(a.km, 1) + " km · " + a.n + " parça</span></div>";
    }).join("") + (sonuc.length > 60
      ? '<div class="bos">… ve ' + (sonuc.length - 60) + " sonuç daha. Aramayı daraltın.</div>" : "");

    kap.querySelectorAll(".satir").forEach(function (el) {
      el.onclick = function () { adaGit(el.dataset.ad); };
    });
  }

  function vurguyuKaldir() {
    if (D.vurgu) { D.harita.removeLayer(D.vurgu); D.vurgu = null; }
  }

  function adaGit(ad) {
    var secilenler = D.ozellikler.filter(function (f) { return f.properties.ad === ad; });
    if (!secilenler.length) return;

    // ilgili kategoriler kapalıysa aç
    var acildi = false;
    secilenler.forEach(function (f) {
      if (!D.seciliKategori.has(f.properties.durum)) { D.seciliKategori.add(f.properties.durum); acildi = true; }
    });
    if (D.seciliTip.size || D.seciliIlce.size) { D.seciliTip.clear(); D.seciliIlce.clear(); acildi = true; }
    if (acildi) { kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz(); }
    katmanlariYenile();

    vurguyuKaldir();
    D.vurgu = L.geoJSON({ type: "FeatureCollection", features: secilenler }, {
      renderer: D.cizer,
      style: { color: "#f59e0b", weight: agirlik(D.harita.getZoom()) + 9, opacity: 0.5, lineCap: "round" },
      interactive: false
    }).addTo(D.harita);
    D.vurgu.bringToBack();

    var sinir = L.geoJSON({ type: "FeatureCollection", features: secilenler }).getBounds();
    D.harita.fitBounds(sinir, { padding: [60, 60], maxZoom: 16 });

    var km = secilenler.reduce(function (t, f) { return t + f.properties.uzunluk_m; }, 0);
    bildir(ad + " — " + secilenler.length + " parça, " + uzunlukYazi(km));
    if (window.innerWidth <= 860) $("#panel").classList.add("kapali");
  }

  /* ------------------------------------------------------------ arayüz çizim */
  function kategoriSiralari() {
    return Object.keys(D.ozet.kategoriler).sort(function (a, b) {
      return (D.ozet.kategoriler[a].sira || 999) - (D.ozet.kategoriler[b].sira || 999);
    });
  }

  function kategoriListesiCiz() {
    var kap = $("#kategori-liste");
    var enBuyuk = Math.max.apply(null, Object.keys(D.ozet.kategoriler).map(function (d) {
      return D.ozet.kategoriler[d].uzunluk_km;
    }).concat([1]));

    kap.innerHTML = kategoriSiralari().map(function (durum) {
      var k = D.ozet.kategoriler[durum];
      var acik = D.seciliKategori.has(durum);
      return '<label class="kat">' +
        '<span class="ust">' +
        '<input type="checkbox" data-durum="' + kacar(durum) + '"' + (acik ? " checked" : "") + ">" +
        '<span class="cizgi-ornek" style="background:' + kacar(katRenk(durum)) + '"></span>' +
        '<span class="ad">' + kacar(k.ad) + (k.tanimli === false ? " ⚠️" : "") + "</span>" +
        '<span class="sayi">' + sayi(k.uzunluk_km, 1) + " km</span>" +
        "</span>" +
        '<span class="aciklama">' + kacar(k.aciklama) + " (" + sayi(k.adet) + " parça)</span>" +
        '<span class="bar"><i style="width:' + (k.uzunluk_km / enBuyuk * 100).toFixed(1) +
        '%;background:' + kacar(katRenk(durum)) + '"></i></span>' +
        "</label>";
    }).join("");

    kap.querySelectorAll("input[data-durum]").forEach(function (el) {
      el.onchange = function () {
        if (el.checked) D.seciliKategori.add(el.dataset.durum);
        else D.seciliKategori.delete(el.dataset.durum);
        katmanlariYenile();
      };
    });
    kategoriSayilariYaz();
  }

  function kategoriSayilariYaz() {
    var hepsi = Object.keys(D.ozet.kategoriler).length;
    $("#kategori-hepsi").textContent = D.seciliKategori.size === hepsi ? "tümünü kapat" : "tümünü seç";
  }

  function tipListesiCiz() {
    var kap = $("#tip-liste");
    var tipler = Object.keys(D.ozet.tipler);
    kap.innerHTML = tipler.map(function (t) {
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
      return '<button class="rozet-secim' + (D.seciliIlce.has(i) ? " secili" : "") +
        '" data-ilce="' + kacar(i) + '">' + kacar(i) +
        "<small>" + sayi(D.ozet.ilceler[i].uzunluk_km, 0) + " km</small></button>";
    }).join("");
    kap.querySelectorAll("[data-ilce]").forEach(function (b) {
      b.onclick = function () {
        var i = b.dataset.ilce;
        if (D.seciliIlce.has(i)) D.seciliIlce.delete(i); else D.seciliIlce.add(i);
        ilceListesiCiz(); katmanlariYenile();
      };
    });
    baslikSayisi("#bolum-ilce", D.seciliIlce.size);
  }

  function baslikSayisi(secici, adet) {
    var h = document.querySelector(secici + " h2");
    if (!h) return;
    var temel = h.textContent.replace(/\s*\(\d+ seçili\)/, "").replace(/▾/, "").trim();
    h.textContent = adet ? temel + " (" + adet + " seçili)" : temel;
  }

  function kaliteCiz() {
    var u = (D.ozet.uyarilar || []);
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
    $("#yardim-kategoriler").innerHTML = "<ul>" + kategoriSiralari().map(function (d) {
      var k = D.ozet.kategoriler[d];
      return "<li><span style='display:inline-block;width:14px;height:5px;border-radius:3px;background:" +
        kacar(katRenk(d)) + ";vertical-align:middle;margin-right:7px'></span><strong>" +
        kacar(k.ad) + "</strong> — " + kacar(k.aciklama) + " (" + sayi(k.adet) + " parça, " +
        sayi(k.uzunluk_km, 1) + " km)</li>";
    }).join("") + "</ul>";
    $("#yardim-not").textContent = D.ozet.site["not"] || "";
  }

  /* ------------------------------------------------------------------ hash */
  function hashYaz() {
    if (!D.harita) return;
    var c = D.harita.getCenter();
    var kume = function (s) {
      return Array.from(s).map(encodeURIComponent).join(",");
    };
    var parcalar = ["h=" + Math.round(D.harita.getZoom() * 100) / 100 +
      "/" + c.lat.toFixed(5) + "/" + c.lng.toFixed(5)];
    if (D.seciliKategori.size !== Object.keys(D.ozet.kategoriler).length) {
      parcalar.push("k=" + kume(D.seciliKategori));
    }
    if (D.seciliTip.size) parcalar.push("t=" + kume(D.seciliTip));
    if (D.seciliIlce.size) parcalar.push("i=" + kume(D.seciliIlce));
    D.hashYaziliyor = true;
    history.replaceState(null, "", "#" + parcalar.join("&"));
    setTimeout(function () { D.hashYaziliyor = false; }, 0);
  }

  function hashOku() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return null;
    var p = new URLSearchParams(h);
    var sonuc = {};
    if (p.get("h")) {
      var b = p.get("h").split("/");
      if (b.length === 3) sonuc.gorunum = { z: +b[0], lat: +b[1], lng: +b[2] };
    }
    if (p.get("k")) sonuc.k = p.get("k").split(",");
    if (p.get("t")) sonuc.t = p.get("t").split(",");
    if (p.get("i")) sonuc.i = p.get("i").split(",");
    return sonuc;
  }

  /* ------------------------------------------------------------- başlangıç */
  function haritaKur(ozet) {
    D.harita = L.map("harita", {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 7,
      maxZoom: 19,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      worldCopyJump: false
    });
    L.control.zoom({ position: "topright" }).addTo(D.harita);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(D.harita);
    D.cizer = L.canvas({ padding: 0.4 });
    altlikKur();

    var b = ozet.bbox;
    D.harita.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [24, 24] });

    D.harita.on("zoomend", agirlikGuncelle);
    D.harita.on("moveend", hashYaz);
    D.harita.on("mousemove", function (e) {
      $("#koordinat").textContent = e.latlng.lat.toFixed(5) + ", " + e.latlng.lng.toFixed(5);
    });
    D.harita.on("click", function (e) {
      vurguyuKaldir();
      if (e.originalEvent && e.originalEvent.altKey) {
        var k = e.latlng.lat.toFixed(6) + ", " + e.latlng.lng.toFixed(6);
        panoyaKopyala(k); bildir("Koordinat kopyalandı: " + k);
      }
    });
  }

  function dugmeleriKur() {
    $("#btn-tema").onclick = function () {
      temaUygula(document.documentElement.getAttribute("data-tema") === "koyu" ? "acik" : "koyu");
    };

    $("#btn-konum").onclick = function () {
      bildir("Konum alınıyor…");
      D.harita.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    };

    $("#btn-indir").onclick = function (e) {
      e.stopPropagation();
      $("#menu-indir").classList.toggle("acik");
    };
    document.addEventListener("click", function () { $("#menu-indir").classList.remove("acik"); });
    $("#menu-indir").addEventListener("click", function (e) { e.stopPropagation(); });

    $("#btn-link").onclick = function () {
      hashYaz();
      panoyaKopyala(location.href);
      bildir("Bağlantı kopyalandı — bu görünümü paylaşabilirsiniz.");
      $("#menu-indir").classList.remove("acik");
    };

    function yardimAc(e) { if (e) e.preventDefault(); $("#perde-yardim").classList.add("acik"); }
    $("#btn-yardim").onclick = yardimAc;
    $("#link-yardim").onclick = yardimAc;
    $$("[data-kapat]").forEach(function (b) {
      b.onclick = function () { document.getElementById(b.dataset.kapat).classList.remove("acik"); };
    });
    $("#perde-yardim").addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("acik");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        $("#perde-yardim").classList.remove("acik");
        $("#menu-indir").classList.remove("acik");
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
    $("#kaynak").textContent = ozet.kaynak_dosya + " · " + sayi(ozet.toplam_yol) +
      " yol parçası · " + sayi(ozet.toplam_km, 1) + " km";
    $("#boyut-geojson").textContent = ozet.veri_boyut_mb + " MB";
    $("#boyut-kml").textContent = ozet.kaynak_boyut_mb + " MB";
  }

  function baslat() {
    temaBaslat();
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

        if (ozet.ilce_verisi_var) $("#bolum-ilce").style.display = "";
        kategoriListesiCiz(); tipListesiCiz(); ilceListesiCiz(); kaliteCiz(); yardimCiz();
        aramaKur(); aramaCiz(""); dugmeleriKur();

        return fetch("veri/yollar.geojson", { cache: "no-cache" });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("yollar.geojson bulunamadı (" + r.status + ")");
        return r.json();
      })
      .then(function (gj) {
        D.ozellikler = gj.features;
        gj.features.forEach(function (f) {
          var d = f.properties.durum;
          (D.duruma_gore[d] = D.duruma_gore[d] || []).push(f);
        });
        D.agirlikKademe = agirlik(D.harita.getZoom());
        katmanlariYenile();
        $("#yukleniyor").style.display = "none";
        if (window.innerWidth <= 860) $("#panel").classList.add("kapali");
        // İleri düzey kullanım / hata ayıklama için harita nesnesini dışarı ver
        window.IZMIR_HARITA = D;
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
