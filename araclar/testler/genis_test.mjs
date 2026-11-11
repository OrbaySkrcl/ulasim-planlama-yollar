const PORT = 9333; const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = async p => (await fetch("http://127.0.0.1:" + PORT + p)).json();
let id = 0; const v = await json("/json/version"); const ws = new WebSocket(v.webSocketDebuggerUrl);
const bek = new Map(); const olaylar = [];
await new Promise(r => ws.addEventListener("open", r));
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && bek.has(m.id)) { bek.get(m.id)(m); bek.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" || m.method === "Log.entryAdded") olaylar.push(m);
});
const send = (m, p, s) => new Promise(res => { const i = ++id; bek.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p || {}, ...(s ? { sessionId: s } : {}) })); });
const fs = await import("node:fs");
const t = await send("Target.createTarget", { url: "about:blank" });
const s = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Runtime.enable", {}, s); await send("Page.enable", {}, s); await send("Log.enable", {}, s);
await send("Network.enable", {}, s); await send("Network.setCacheDisabled", { cacheDisabled: true }, s);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);
// Liste raporu (CSV) yönetici dosyasıdır; suite siteyi anahtarla açar.
// Ziyaretçinin ne görüp göremediği gizlilik_testi.mjs'in işi.
const ANAHTAR = process.argv[3] || process.env.YONETICI_ANAHTARI || "deneme-anahtar-123";
await send("Page.navigate",
  { url: "http://127.0.0.1:8000/?y=" + encodeURIComponent(ANAHTAR) }, s);
async function ev(e) {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }, s);
  if (!r.result) return null;
  if (r.result.exceptionDetails) return { HATA: (r.result.exceptionDetails.exception?.description || "").split("\n")[0] };
  return r.result.result.value;
}
let basarisiz = 0;
function denetle(ad, d, k) {
  let ok; try { ok = !!k(d); } catch (e) { ok = false; }
  if (!ok) basarisiz++;
  console.log((ok ? "  ok   " : "  HATA ") + ad + ": " + JSON.stringify(d));
}
for (let i = 0; i < 120; i++) { await sleep(500); if (await ev("document.body.dataset.hazir==='1'")) break; }
await sleep(1500);

denetle("ayrı bölüm görünüyor", await ev(`(function(){
  var b=document.getElementById('bolum-genis');
  var g=window.IZMIR_HARITA.ozet.genis_yollar;
  return {gorunur: b && getComputedStyle(b).display!=='none',
          baslik: b? b.querySelector('h2').textContent.trim():null,
          ayriProje: b? b.classList.contains('ayri-proje'):false,
          satir: document.querySelectorAll('.genis-satir').length,
          not: (document.getElementById('genis-not')||{}).textContent};})()`),
  r => r.gorunur && r.ayriProje && r.satir === 3);

denetle("EK-1 satırı üstte, kendi renginde", await ev(`(function(){
  var g=window.IZMIR_HARITA.ozet.genis_yollar;
  var ilk=document.querySelector('.genis-satir');
  var kutu=ilk.querySelector('[data-genis]');
  return {sira: g.ton_sirasi, ad: ilk.querySelector('.ad').textContent,
          ton: kutu? kutu.dataset.genis : null,
          renk: g.tonlar.ek1.renk, adet: g.tonlar.ek1.adet,
          km: g.tonlar.ek1.uzunluk_km,
          kaynak: (g.ek1||{}).dosya, cizgisiz: (g.ek1||{}).cizgisiz};})()`),
  r => r.ton === "ek1" && r.sira[0] === "ek1" && /EK-1/.test(r.ad) &&
       r.renk === "#f59e0b" && r.adet > 500 && r.km > 900 &&
       r.kaynak === "ek1_listesi.txt" && r.cizgisiz > 0);

denetle("katman açılışta YÜKLENMİYOR (tembel)", await ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {veriVar: !!(D.genis && D.genis.veri), secili: D.genis? Array.from(D.genis.secili):null};})()`),
  r => r.veriVar === false);

denetle("ana toplam etkilenmedi", await ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {km: document.getElementById('ist-km').textContent,
          kategoriSayisi: Object.keys(D.ozet.kategoriler).length,
          toplamKm: D.ozet.toplam_km};})()`),
  r => r.kategoriSayisi === 6 && Math.abs(r.toplamKm - 29680.7) < 1);

denetle("açık mavi açılınca katman geliyor", await ev(`(async function(){
  document.querySelector('.genis-satir [data-genis="acik"]').click();
  for(var i=0;i<40;i++){ await new Promise(function(r){setTimeout(r,250);});
    var D=window.IZMIR_HARITA;
    if(D.genis && D.genis.katman && D.genis.katman.acik) break; }
  var D=window.IZMIR_HARITA;
  var k=D.genis.katman.acik;
  return {yuklendi: !!D.genis.veri,
          ozellik: D.genis.veri? D.genis.veri.features.length : 0,
          haritada: k? D.harita.hasLayer(k) : false,
          cizilen: k? k.getLayers().length : 0,
          pane: !!D.harita.getPane('genisPane')};})()`),
  r => r.yuklendi && r.haritada && r.cizilen > 500 && r.pane);

denetle("EK-1 katmanı ayrı çiziliyor", await ev(`(async function(){
  document.querySelector('.genis-satir [data-genis="ek1"]').click();
  for(var i=0;i<40;i++){ await new Promise(function(r){setTimeout(r,250);});
    var D=window.IZMIR_HARITA;
    if(D.genis && D.genis.katman && D.genis.katman.ek1) break; }
  var D=window.IZMIR_HARITA;
  var k=D.genis.katman.ek1;
  var oz=D.genis.veri.features.filter(function(f){return f.properties.renk==='ek1';});
  var renkler={};
  D.genis.veri.features.forEach(function(f){renkler[f.properties.renk]=1;});
  return {haritada: D.harita.hasLayer(k), cizilen: k.getLayers().length,
          ozellik: oz.length, tonlar: Object.keys(renkler).sort()};})()`),
  r => r.haritada && r.cizilen > 500 && r.ozellik > 500 &&
       r.tonlar.join(",") === "acik,ek1,koyu");

denetle("koyu mavi ayrı çalışıyor", await ev(`(async function(){
  document.querySelector('.genis-satir [data-genis="koyu"]').click();
  await new Promise(function(r){setTimeout(r,1200);});
  var D=window.IZMIR_HARITA;
  return {acik: D.harita.hasLayer(D.genis.katman.acik),
          koyu: D.harita.hasLayer(D.genis.katman.koyu),
          koyuCizgi: D.genis.katman.koyu.getLayers().length};})()`),
  r => r.acik && r.koyu && r.koyuCizgi > 100);

denetle("kapatınca haritadan kalkıyor", await ev(`(async function(){
  document.querySelector('.genis-satir [data-genis="acik"]').click();
  document.querySelector('.genis-satir [data-genis="koyu"]').click();
  document.querySelector('.genis-satir [data-genis="ek1"]').click();
  await new Promise(function(r){setTimeout(r,900);});
  var D=window.IZMIR_HARITA;
  return {acik: D.harita.hasLayer(D.genis.katman.acik),
          koyu: D.harita.hasLayer(D.genis.katman.koyu),
          ek1: D.harita.hasLayer(D.genis.katman.ek1)};})()`),
  r => r.acik === false && r.koyu === false && r.ek1 === false);

denetle("kategori süzgeci bu katmanı etkilemiyor", await ev(`(async function(){
  var D=window.IZMIR_HARITA;
  document.querySelector('.genis-satir [data-genis="koyu"]').click();
  await new Promise(function(r){setTimeout(r,900);});
  // tum ana kategorileri kapat
  D.seciliKategori.clear(); katmanlariYenileVar=null;
  document.querySelector('#kategori-hepsi').click();
  document.querySelector('#kategori-hepsi').click();
  await new Promise(function(r){setTimeout(r,1500);});
  return {anaSecili: Array.from(D.seciliKategori).length,
          genisHala: D.harita.hasLayer(D.genis.katman.koyu)};})()`),
  r => r.genisHala === true);

denetle("düzeltme kuralı uygulanmış (Torbalı 502 SOKAK)", await ev(`(async function(){
  var D=window.IZMIR_HARITA;
  if(!D.genis || !D.genis.veri){
    document.querySelector('.genis-satir [data-genis="acik"]').click();
    for(var i=0;i<40;i++){ await new Promise(function(r){setTimeout(r,250);});
      if(D.genis.veri) break; }
  }
  var bul=D.genis.veri.features.filter(function(f){
    return f.properties.ilce==='Torbalı' && f.properties.liste_adi==='502 SOKAK';});
  return {adet:bul.length,
          mahalleler:bul.map(function(f){return f.properties.mahalle;}),
          kirbasVar: bul.some(function(f){return f.properties.mahalle==='Kırbaş';})};})()`),
  r => r.adet === 2 && r.kirbasVar === false);

denetle("bilgi kartında mahalle ve çıkarma düğmesi var", await ev(`(async function(){
  var D=window.IZMIR_HARITA;
  var f=D.genis.veri.features.find(function(x){return x.properties.mahalle;});
  var g=f.geometry, dz=g.type==='MultiLineString'?g.coordinates:[g.coordinates];
  var c=dz[0][Math.floor(dz[0].length/2)];
  D.harita.setView([c[1],c[0]],15);
  await new Promise(function(r){setTimeout(r,1200);});
  genisBilgiAcVar=null;
  D.genis.katman.acik.eachLayer(function(k){ if(!window.__t){ window.__t=k; } });
  window.__t.fire('click',{latlng:L.latLng(c[1],c[0])});
  await new Promise(function(r){setTimeout(r,400);});
  var pop=document.querySelector('.leaflet-popup-content');
  var d=pop? pop.querySelector('[data-genis-cikar]') : null;
  return {acik:!!pop, mahalleSatiri: pop? /Mahalle/.test(pop.textContent):false,
          dugme: !!d, kural: d? d.dataset.genisCikar : null};})()`),
  r => r.acik && r.mahalleSatiri && r.dugme && /hariç:|çıkar:/.test(r.kural || ""));

denetle("belirsiz eşleşmeler raporlanıyor", await ev(`(function(){
  var g=window.IZMIR_HARITA.ozet.genis_yollar;
  var u=(window.IZMIR_HARITA.ozet.uyarilar||[]).filter(function(x){
    return x.baslik.indexOf('uzak yollar')>=0;});
  return {adet:g.belirsiz_adet, uyari:u.length,
          duzeltmeKural:(g.duzeltme||{}).kural,
          cikarilan:(g.duzeltme||{}).cikarilan};})()`),
  r => r.adet > 0 && r.uyari === 1 && r.duzeltmeKural >= 1 && r.cikarilan >= 1);

denetle("eşleşmeyenler veri kalitesinde", await ev(`(function(){
  var u=(window.IZMIR_HARITA.ozet.uyarilar||[]).filter(function(x){
    return x.baslik.indexOf('Geniş yollar')>=0;});
  return u.length? {adet:u[0].adet, basla:u[0].mesaj.slice(0,40)} : {yok:true};})()`),
  r => !r.yok && r.adet > 0);

denetle("takma ad kuralları eşleşmeyi artırdı", await ev(`(function(){
  var g=window.IZMIR_HARITA.ozet.genis_yollar;
  var onerili=(g.eslesmeyen||[]).filter(function(e){return e.oneri;});
  return {eslesen:g.eslesen_satir, toplam:g.liste_satiri,
          eslesmeyen:(g.eslesmeyen||[]).length, hala_onerili:onerili.length};})()`),
  r => r.eslesen >= 1270 && r.toplam >= 1350 && r.eslesmeyen <= 85);

denetle("durum raporu (CSV) indirilebiliyor", await ev(`(async function(){
  var g=window.IZMIR_HARITA.ozet.genis_yollar;
  var a=document.getElementById('genis-rapor');
  var y=await fetch(a.getAttribute('href'));
  var ham=new Uint8Array(await y.arrayBuffer());
  var metin=new TextDecoder('utf-8').decode(ham);
  var satir=metin.trim().split('\\n');
  // BOM baytlarina bak: TextDecoder metinde silebiliyor
  return {baglantiGorunur: a && !a.hidden, adres:a.getAttribute('href'),
          http:y.status,
          satir:satir.length, baslik:satir[0].replace(/^\\uFEFF/,'').slice(0,40),
          bom: ham[0]===0xEF && ham[1]===0xBB && ham[2]===0xBF,
          noktaliVirgul: satir[0].indexOf(';')>0};})()`),
  r => r.baglantiGorunur && r.http === 200 && r.satir > 1300 && r.bom &&
       r.noktaliVirgul && /^veri\/y-[0-9a-f]{16}\//.test(r.adres));

const konsol = olaylar.map(m => { const p = m.params; return p.entry ? p.entry.level + ": " + p.entry.text : p.type + ": " + (p.args || []).map(a => a.value ?? a.description ?? "").join(" "); })
  .filter(x => !/tile|openstreetmap|arcgisonline|favicon|ERR_TUNNEL|ERR_NAME|ERR_PROXY|ERR_INTERNET/i.test(x))
  .filter(x => !/^log: /.test(x));
if (konsol.length) basarisiz++;
console.log("KONSOL:", konsol.length ? konsol.slice(0, 8) : "(temiz)");
console.log("\nBASARISIZ: " + basarisiz);
if (process.argv[2]) {
  const ss = await send("Page.captureScreenshot", { format: "png" }, s);
  fs.writeFileSync(process.argv[2], Buffer.from(ss.result.data, "base64"));
}
process.exit(basarisiz ? 1 : 0);
