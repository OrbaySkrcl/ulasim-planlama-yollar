/* Gizlilik denetimi.
 *
 * İki soruyu ayrı ayrı sorar:
 *   1. Sıradan ziyaretçi veriyi indirebiliyor mu, iç detayları görüyor mu?
 *   2. Yönetici (anahtarla) hepsine erişebiliyor mu?
 *
 * Önemli nokta: "ekranda görünmüyor" yetmez. Bu test, dosyaların
 * YAYINLANMADIĞINI de doğrular — adres doğrudan istendiğinde 404 gelmeli.
 *
 * Kullanım:  node araclar/testler/gizlilik_testi.mjs <ekran.png> <anahtar>
 * Site _site'ten 8000 portunda sunulmuş, Chromium 9333'te açık olmalı.
 */
const PORT = 9333, SITE = "http://127.0.0.1:8000";
const ANAHTAR = process.argv[3] || "deneme-anahtar-123";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = async p => (await fetch("http://127.0.0.1:" + PORT + p)).json();
let id = 0;
const v = await json("/json/version");
const ws = new WebSocket(v.webSocketDebuggerUrl);
const bek = new Map(); const olaylar = [];
await new Promise(r => ws.addEventListener("open", r));
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && bek.has(m.id)) { bek.get(m.id)(m); bek.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" || m.method === "Log.entryAdded") olaylar.push(m);
});
const send = (m, p, s) => new Promise(res => {
  const i = ++id; bek.set(i, res);
  ws.send(JSON.stringify({ id: i, method: m, params: p || {}, ...(s ? { sessionId: s } : {}) }));
});
const fs = await import("node:fs");
const crypto = await import("node:crypto");

let basarisiz = 0;
function denetle(ad, d, k) {
  let ok; try { ok = !!k(d); } catch (e) { ok = false; }
  if (!ok) basarisiz++;
  console.log((ok ? "  ok   " : "  HATA ") + ad + ": " + JSON.stringify(d));
}

const klasor = "y-" + crypto.createHash("sha256").update(ANAHTAR).digest("hex").slice(0, 16);

/* ------------------------------------------------- 1. sunucu tarafı: dosyalar */
console.log("\n— Yayınlanan dosyalar —");
async function durum(yol) {
  const r = await fetch(SITE + "/" + yol, { method: "HEAD" });
  return r.status;
}
denetle("tam GeoJSON açık adreste YOK", await durum("veri/yollar.geojson"), d => d === 404);
denetle("GeoPackage açık adreste YOK", await durum("veri/yollar.gpkg"), d => d === 404);
denetle("liste raporu açık adreste YOK", await durum("veri/genis_yollar_durum.csv"), d => d === 404);
denetle("yönetici özeti açık adreste YOK", await durum("veri/ozet_yonetici.json"), d => d === 404);
denetle("harita verisi herkese açık (harita çalışsın)",
  await durum("veri/yollar-1.geojson"), d => d === 200);

/* --------------------------------------------- 2. ozet.json içeriği */
const ozet = await (await fetch(SITE + "/veri/ozet.json")).json();
denetle("ozet.json iç detay taşımıyor", {
  uyarilar: "uyarilar" in ozet, degisiklikler: "degisiklikler" in ozet,
  depo: "depo" in ozet, kaynak: "kaynak_dosya" in ozet,
  ayar: "ayar_ham" in ozet,
  katAciklama: !!(ozet.kategoriler["1"] || {}).aciklama,
  genisEslesmeyen: "eslesmeyen" in (ozet.genis_yollar || {}),
  genisSatir: "liste_satiri" in (ozet.genis_yollar || {})
}, r => Object.values(r).every(x => x === false));
denetle("ozet.json haritayı çizmeye yetiyor", {
  kategori: Object.keys(ozet.kategoriler).length, km: ozet.toplam_km,
  ilce: Object.keys(ozet.ilceler || {}).length,
  genisTon: Object.keys((ozet.genis_yollar || {}).tonlar || {}).length
}, r => r.kategori === 6 && r.km > 29000 && r.ilce > 25 && r.genisTon === 3);

/* --------------------------------------------- 3. tarayıcı: ziyaretçi */
async function sayfa(url, temizle) {
  const t = await send("Target.createTarget", { url: "about:blank" });
  const s = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
  await send("Runtime.enable", {}, s); await send("Page.enable", {}, s);
  await send("Log.enable", {}, s); await send("Network.enable", {}, s);
  await send("Network.setCacheDisabled", { cacheDisabled: true }, s);
  await send("Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, s);
  if (temizle) {
    // Önceki çalışmadan kalan yönetici anahtarı, ziyaretçi testini bozmasın.
    // Sayfanın kendi kodundan ÖNCE çalışır.
    await send("Page.addScriptToEvaluateOnNewDocument",
      { source: "try{localStorage.clear();}catch(e){}" }, s);
  }
  await send("Page.navigate", { url }, s);
  const ev = async e => {
    const r = await send("Runtime.evaluate",
      { expression: e, returnByValue: true, awaitPromise: true }, s);
    if (!r.result) return null;
    if (r.result.exceptionDetails) {
      return { HATA: (r.result.exceptionDetails.exception?.description || "").split("\n")[0] };
    }
    return r.result.result.value;
  };
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("document.body.dataset.hazir==='1'")) break; }
  await sleep(1200);
  return { s, ev };
}

// ÖNEMLİ: "hidden" özniteliğine değil, HESAPLANAN STİLE bakar. Bir CSS
// kuralı display verdiğinde [hidden] ezilebiliyor; öznitelige güvenen bir
// denetim "gizli" der ama düğme ekranda durur. (Bir kez başımıza geldi.)
const gorunur = `(function(g){var e=document.querySelector(g);
  if(!e) return 'yok';
  var st=getComputedStyle(e);
  if(st.display==='none' || st.visibility==='hidden' || +st.opacity===0) return false;
  var k=e.getBoundingClientRect();
  return k.width>0 && k.height>0;})`;

console.log("\n— Sıradan ziyaretçi —");
const z = await sayfa(SITE + "/", true);
denetle("indirme düğmesi görünmüyor", await z.ev(`${gorunur}('#btn-indir')`), r => r === false);
denetle("yönetici rozeti yok", await z.ev(`${gorunur}('#yonetici-rozet')`), r => r === false);
denetle("veri kalitesi bölümü yok", await z.ev(`${gorunur}('#bolum-kalite')`), r => r === false);
denetle("son değişiklikler bölümü yok", await z.ev(`${gorunur}('#bolum-degisiklik')`), r => r === false);
denetle("kaynak dosya satırı yok", await z.ev(`${gorunur}('#satir-kaynak')`), r => r === false);
denetle("nasıl güncelleniyor bağlantısı yok", await z.ev(`${gorunur}('#satir-yardim')`), r => r === false);
denetle("yardım (?) düğmesi yok", await z.ev(`${gorunur}('#btn-yardim')`), r => r === false);
denetle("rehber bağlantısı yok", await z.ev(`${gorunur}('#link-rehber')`), r => r === false);
denetle("CSV rapor bağlantısı yok", await z.ev(`${gorunur}('#genis-rapor')`), r => r === false);
denetle("kategori açıklamaları boş", await z.ev(`(function(){
  var a=Array.from(document.querySelectorAll('.kat .aciklama')).map(function(e){return e.textContent.trim();});
  return {adet:a.length, dolu:a.filter(Boolean).length};})()`),
  r => r.adet === 6 && r.dolu === 0);
denetle("harita yine de çiziliyor", await z.ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {kategori:D.seciliKategori.size, km:document.getElementById('ist-km').textContent,
          lejant:document.querySelectorAll('.lejant-satir').length,
          genisSatir:document.querySelectorAll('.genis-satir').length};})()`),
  r => r.kategori >= 4 && r.lejant >= 4 && r.genisSatir === 3);
denetle("sayfa arama motorlarına kapalı", await z.ev(
  `(document.querySelector('meta[name=robots]')||{}).content`), r => /noindex/.test(r || ""));

/* --------------------------------------------- 4. tarayıcı: yönetici */
// Yönetici klasörü yoksa site anahtarsız derlenmiş demektir. Ziyaretçi
// denetimleri yine de anlamlı; yönetici bölümünü atlayıp net bir şey söyle.
if (await durum("veri/" + klasor + "/ozet_yonetici.json") !== 200) {
  console.log("\n— Yönetici bölümü ATLANDI —");
  console.log("  Site bu anahtarla derlenmemiş. Şöyle derleyin:");
  console.log("    YONETICI_ANAHTARI=" + ANAHTAR + " python3 araclar/derle.py");
  console.log("\nZiyaretçi denetimleri: " + (basarisiz ? basarisiz + " HATA" : "temiz"));
  process.exit(2);
}

console.log("\n— Yönetici —");
denetle("gizli klasörde GeoPackage VAR",
  await durum("veri/" + klasor + "/yollar.gpkg"), d => d === 200);
denetle("gizli klasörde yönetici özeti VAR",
  await durum("veri/" + klasor + "/ozet_yonetici.json"), d => d === 200);
const y = await sayfa(SITE + "/?y=" + encodeURIComponent(ANAHTAR));
denetle("yönetici modu açıldı", await y.ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {acik:!!D.yonetici, klasor:D.yonetici&&D.yonetici.klasor,
          adres:location.search};})()`),
  r => r.acik && r.klasor === klasor && r.adres === "");
denetle("indirme düğmesi görünüyor", await y.ev(`${gorunur}('#btn-indir')`), r => r === true);
denetle("rozet görünüyor", await y.ev(`${gorunur}('#yonetici-rozet')`), r => r === true);
denetle("yardım (?) düğmesi geldi", await y.ev(`${gorunur}('#btn-yardim')`), r => r === true);
denetle("veri kalitesi bölümü geldi", await y.ev(`${gorunur}('#bolum-kalite')`), r => r === true);
denetle("kaynak satırı geldi", await y.ev(`(function(){
  return {gorunur:!document.getElementById('satir-kaynak').hidden,
          metin:document.getElementById('kaynak').textContent};})()`),
  r => r.gorunur && /gpkg|kml|zip/i.test(r.metin));
denetle("indirme bağlantıları gizli klasöre bakıyor", await y.ev(`(function(){
  var a=Array.from(document.querySelectorAll('#menu-indir a[href]'))
    .filter(function(e){return !e.hidden;}).map(function(e){return e.getAttribute('href');});
  return a;})()`),
  r => r.length >= 2 && r.every(h => h.indexOf("veri/" + klasor + "/") === 0));
denetle("GeoPackage gerçekten iniyor", await y.ev(`(async function(){
  var a=document.querySelector("#menu-indir a[href$='.gpkg']");
  var r=await fetch(a.getAttribute('href'), {method:'HEAD'});
  return {http:r.status, tur:r.headers.get('content-type'),
          bayt:+(r.headers.get('content-length')||0)};})()`),
  r => r.http === 200 && r.bayt > 10000000);
denetle("kategori açıklamaları geri geldi", await y.ev(`(function(){
  var a=Array.from(document.querySelectorAll('.kat .aciklama')).map(function(e){return e.textContent.trim();});
  return {adet:a.length, dolu:a.filter(Boolean).length};})()`),
  r => r.adet === 6 && r.dolu === 6);
denetle("CSV raporu gizli klasörden iniyor", await y.ev(`(async function(){
  var a=document.getElementById('genis-rapor');
  if(a.hidden) return {gizli:true};
  var r=await fetch(a.getAttribute('href'));
  var t=await r.text();
  return {href:a.getAttribute('href'), http:r.status, satir:t.trim().split('\\n').length};})()`),
  r => !r.gizli && r.http === 200 && r.satir > 1300 &&
       r.href.indexOf("veri/" + klasor + "/") === 0);
denetle("anahtar tarayıcıda saklandı", await y.ev(
  `localStorage.getItem('yoneticiAnahtari')`), r => r === ANAHTAR);

denetle("#y= biçimi de çalışıyor (sondaki eğik çizgi unutulursa)", await (async () => {
  const h = await sayfa(SITE + "/#y=" + encodeURIComponent(ANAHTAR), true);
  return await h.ev(`(function(){
    var D=window.IZMIR_HARITA;
    return {acik:!!D.yonetici, hash:location.hash, arama:location.search};})()`);
// Harita kendi durumunu hash'e yazar (#h=…&k=…); önemli olan anahtarın
// orada KALMAMASI.
})(), r => r.acik === true && !/(^|[#&])y=/.test(r.hash) && r.arama === "");

console.log("\n— Yanlış anahtar —");
// Buradan sonraki 404, anahtarın yanlış olduğunu anlamanın yolu: beklenen.
const konsolSiniri = olaylar.length;
const k = await sayfa(SITE + "/?y=yanlis-anahtar-xyz", true);
denetle("yanlış anahtar modu açmıyor", await k.ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {acik:!!D.yonetici, indir:!document.getElementById('btn-indir').hidden};})()`),
  r => r.acik === false && r.indir === false);

denetle("yanlış anahtar sessizce geçmiyor, uyarı veriyor", await k.ev(`(async function(){
  await new Promise(function(r){setTimeout(r,600);});
  var b=document.getElementById('bildirim');
  return {metin:b.textContent, gorunur:b.classList.contains('gorunur'),
          saklandiMi:localStorage.getItem('yoneticiAnahtari')};})()`),
  r => r.gorunur && /anahtar|derlenme/i.test(r.metin) && r.saklandiMi === null);

const konsol = olaylar.map((m, i) => ({ m, sonrasi: i >= konsolSiniri }))
  .filter(x => !(x.sonrasi && /404|Failed to load resource/i.test(
    x.m.params.entry?.text || "")))
  .map(x => x.m)
  .map(m => {
  const p = m.params;
  return p.entry ? p.entry.level + ": " + p.entry.text
                 : p.type + ": " + (p.args || []).map(a => a.value ?? a.description ?? "").join(" ");
}).filter(x => !/tile|openstreetmap|arcgisonline|favicon|ERR_TUNNEL|ERR_NAME|ERR_PROXY|ERR_INTERNET/i.test(x))
  .filter(x => !/^log: /.test(x));
if (konsol.length) basarisiz++;
console.log("KONSOL:", konsol.length ? konsol.slice(0, 8) : "(temiz)");
console.log("\nBASARISIZ: " + basarisiz);
if (process.argv[2]) {
  const ss = await send("Page.captureScreenshot", { format: "png" }, z.s);
  fs.writeFileSync(process.argv[2], Buffer.from(ss.result.data, "base64"));
}
process.exit(basarisiz ? 1 : 0);
