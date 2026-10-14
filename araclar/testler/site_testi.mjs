/* Sitenin uçtan uca denetimi — gerçek tarayıcıda çalışır.
 *
 * Bu dosyayı günlük kullanım için açmanız gerekmez; geliştirme sırasında
 * "bir şeyi bozdum mu?" sorusunu cevaplar.
 *
 * Kullanımı:
 *   1) python3 araclar/derle.py
 *   2) python3 -m http.server 8000 --directory _site &
 *   3) chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/chr &
 *   4) node araclar/testler/site_testi.mjs
 *
 * Her satır bir denetim sonucudur. Sonda "BASARISIZ: 0" ve "KONSOL: (temiz)"
 * görüyorsanız site sağlamdır.
 */
const PORT = +(process.env.CDP_PORT || 9333);
const ADRES = process.env.SITE_ADRES || "http://127.0.0.1:8000/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = async p => (await fetch("http://127.0.0.1:" + PORT + p)).json();

let id = 0;
const v = await json("/json/version");
const ws = new WebSocket(v.webSocketDebuggerUrl);
const bek = new Map();
const konsolOlaylari = [];
await new Promise(r => ws.addEventListener("open", r));
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && bek.has(m.id)) { bek.get(m.id)(m); bek.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" || m.method === "Log.entryAdded") konsolOlaylari.push(m);
});
const send = (m, p, s) => new Promise(res => {
  const i = ++id; bek.set(i, res);
  ws.send(JSON.stringify({ id: i, method: m, params: p || {}, ...(s ? { sessionId: s } : {}) }));
});

const t = await send("Target.createTarget", { url: "about:blank" });
const s = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send("Runtime.enable", {}, s);
await send("Page.enable", {}, s);
await send("Log.enable", {}, s);
await send("Network.enable", {}, s);
await send("Network.setCacheDisabled", { cacheDisabled: true }, s);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, s);

async function ev(ifade) {
  const r = await send("Runtime.evaluate", { expression: ifade, returnByValue: true, awaitPromise: true }, s);
  if (!r.result) return null;
  if (r.result.exceptionDetails) {
    return { HATA: (r.result.exceptionDetails.exception?.description || "").split("\n")[0] };
  }
  return r.result.result.value;
}

let basarisiz = 0;
function denetle(ad, sonuc, kosul) {
  const ok = (() => { try { return !!kosul(sonuc); } catch (e) { return false; } })();
  if (!ok) basarisiz++;
  console.log((ok ? "  ok   " : "  HATA ") + ad + ": " + JSON.stringify(sonuc));
}

await send("Page.navigate", { url: ADRES }, s);
for (let i = 0; i < 180; i++) { await sleep(500); if (await ev("document.body.dataset.hazir==='1'")) break; }
await sleep(1500);

console.log("\n— Açılış —");
denetle("sayfa hazır", await ev(`(function(){var D=window.IZMIR_HARITA;
  return {hazir:document.body.dataset.hazir==='1', yol:D.ozellikler.length,
          parca:D.parcalar.length, kategori:document.querySelectorAll('.kat').length};})()`),
  r => r.hazir && r.yol > 0 && r.parca >= r.yol && r.kategori >= 4);

denetle("özet şeridi dolu", await ev(`(function(){
  return {km:document.querySelector('#ist-km').textContent,
          ad:document.querySelector('#ist-ad').textContent};})()`),
  r => r.km && r.km !== "0" && r.ad && r.ad !== "0");

console.log("\n— Birleşik kayıtların ayrılması —");
denetle("hiçbir yol il geneline yayılmıyor", await ev(`(function(){
  var D=window.IZMIR_HARITA, c=0, en=0, ornek=null;
  D.ozellikler.forEach(function(f){
    var g=f.geometry, dz = g.type==='MultiLineString'? g.coordinates : [g.coordinates];
    var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    dz.forEach(function(d){d.forEach(function(k){
      if(k[0]<minx)minx=k[0]; if(k[0]>maxx)maxx=k[0];
      if(k[1]<miny)miny=k[1]; if(k[1]>maxy)maxy=k[1];});});
    var yay=Math.max((maxx-minx)*88,(maxy-miny)*111);
    if(yay>en){en=yay; ornek=f.properties.ad;}
    if(yay>25) c++;
  });
  return {genis25km:c, enGenis_km:+en.toFixed(1), enGenisAd:ornek};})()`),
  // Yalnizca gercekten surekli otoyollar 25 km'yi asabilir (Cesme Otoyolu 68 km)
  r => r.genis25km <= 8 && r.enGenis_km < 80);

denetle("ayrılan kayıtta fid korunmuş + parca_no var", await ev(`(function(){
  var D=window.IZMIR_HARITA, b=null;
  D.ozellikler.some(function(f){ if(f.properties.parca_no){b=f.properties; return true;} });
  return b? {fid:b.fid, parca_no:b.parca_no, ad:b.ad, ilce:b.ilce} : {yok:true};})()`),
  r => r.fid && !/-/.test(r.fid) && r.parca_no >= 1);

console.log("\n— Düzenleme düğmeleri (dokunmatik ekranda da görünmeli) —");
denetle("düğmeler görünür", await ev(`(function(){
  ['bolum-ilce','bolum-mahalle'].forEach(function(b){
    var e=document.getElementById(b); if(e) e.classList.remove('kapali');});
  function g(sel){var e=document.querySelector(sel); if(!e) return 'YOK';
    var st=getComputedStyle(e), r=e.getBoundingClientRect();
    return st.visibility!=='hidden' && st.display!=='none' && r.width>0;}
  return {ilce:g('#ilce-sinir-duzenle'), mahalle:g('#mahalle-sinir-duzenle'),
          kategori:g('.kat .kat-duzenle'), yalniz:g('.kat .kat-yalniz')};})()`),
  r => r.ilce === true && r.mahalle === true && r.kategori === true && r.yalniz === true);

console.log("\n— Sınır çizgisi düzenleyicileri —");
denetle("ilçe: renk + kalınlık uygulanıyor", await ev(`(function(){
  document.querySelector('#ilce-sinir-duzenle').click();
  var e=document.querySelector('#ilce-sinir-editor');
  var renk=e.querySelector('input[type=color]'), kal=e.querySelector('input[type=range]');
  renk.value='#b45309'; renk.dispatchEvent(new Event('input',{bubbles:true}));
  kal.value='3.5'; kal.dispatchEvent(new Event('input',{bubbles:true}));
  var o=window.IZMIR_HARITA.sinir.ilce.katman.options;
  return {acik:!e.hidden, renk:o.color, kalinlik:o.weight};})()`),
  r => r.acik && r.renk === "#b45309" && r.kalinlik === 3.5);

denetle("mahalle: renk + kalınlık uygulanıyor", await ev(`(function(){
  document.querySelector('#mahalle-sinir-duzenle').click();
  var e=document.querySelector('#mahalle-sinir-editor');
  var renk=e.querySelector('input[type=color]'), kal=e.querySelector('input[type=range]');
  renk.value='#be123c'; renk.dispatchEvent(new Event('input',{bubbles:true}));
  kal.value='2.5'; kal.dispatchEvent(new Event('input',{bubbles:true}));
  var D=window.IZMIR_HARITA;
  return {acik:!e.hidden, kayit:(D.ozelSinir||{}).mahalle};})()`),
  r => r.acik && r.kayit && r.kayit.renk === "#be123c" && r.kayit.kalinlik === 2.5);

denetle("sıfırla düğmesi sınır ayarlarını geri alıyor", await ev(`(function(){
  document.querySelector('#btn-ozel-sifirla').click();
  var D=window.IZMIR_HARITA, o=D.sinir.ilce.katman.options;
  return {ozel:D.ozelSinir, renk:o.color, kalinlik:o.weight};})()`),
  r => Object.keys(r.ozel || {}).length === 0 && r.kalinlik !== 3.5);

console.log("\n— Sınır katmanları —");
denetle("ilçe ve mahalle sınırları yüklü", await ev(`(function(){
  var D=window.IZMIR_HARITA;
  return {ilceAlan:(D.sinir.ilce.veri||{features:[]}).features.length,
          mahAlan:(D.sinir.mahalle.veri||{features:[]}).features.length,
          ilceRozet:document.querySelectorAll('#ilce-liste .rozet-secim').length,
          etiket:document.querySelectorAll('.ilce-etiket').length};})()`),
  r => r.ilceAlan >= 25 && r.mahAlan > 1000 && r.ilceRozet >= 25 && r.etiket > 5);

denetle("etiketler yakınlaştırmaya göre açılıyor", await ev(`(async function(){
  var m=window.IZMIR_HARITA.harita, s={};
  for (var i=0;i<2;i++){
    var z=[7,11][i];
    m.setView([38.42,27.14], z);
    await new Promise(function(r){setTimeout(r,1200);});
    s['z'+z]=document.querySelectorAll('.ilce-etiket.ilce').length;
  }
  m.setView([38.42,27.14], 9);
  await new Promise(function(r){setTimeout(r,1000);});
  return s;})()`),
  r => r.z7 === 0 && r.z11 > 0);

console.log("\n— Yol seçimi —");
denetle("yola tıklayınca bilgi kartı açılıyor", await ev(`(async function(){
  var D=window.IZMIR_HARITA;
  var f=D.ozellikler.find(function(x){
    return x.properties.ad && x.properties.ad!=='İsimsiz yol' && x.properties.durum==='1';});
  var g=f.geometry, dz = g.type==='MultiLineString'? g.coordinates : [g.coordinates];
  var c=dz[0][Math.floor(dz[0].length/2)];
  D.harita.setView([c[1],c[0]], 16);
  await new Promise(function(r){setTimeout(r,1400);});
  D.harita.fire('click',{latlng:L.latLng(c[1],c[0])});
  var p=document.querySelector('.leaflet-popup-content');
  return {acik:!!p, metin:p? p.textContent.replace(/\s+/g,' ').slice(0,120):null,
          ad:f.properties.ad, kayitNo:p? /Kayıt no/.test(p.textContent):false};})()`),
  r => r.acik && r.metin.indexOf(r.ad) >= 0 && r.kayitNo);

console.log("\n— Arama —");
denetle("arama dizini tembel iniyor ve sonuç veriyor", await ev(`(async function(){
  var g=document.querySelector('#arama');
  var onceki = !!window.IZMIR_HARITA.adlar;
  g.focus(); g.value='terzihalil';
  g.dispatchEvent(new Event('input',{bubbles:true}));
  for(var i=0;i<30;i++){ await new Promise(function(r){setTimeout(r,250);});
    if(document.querySelectorAll('#arama-sonuc .satir').length) break; }
  var s=document.querySelectorAll('#arama-sonuc .satir');
  return {oncedenYukluydu:onceki, sonuc:s.length,
          ilk:s[0]?s[0].textContent.trim().slice(0,40):null,
          dizin:(window.IZMIR_HARITA.adlar||[]).length};})()`),
  r => !r.oncedenYukluydu && r.sonuc >= 1 && r.dizin > 1000);

console.log("\n— Kategori süzgeci —");
denetle("yalnız düğmesi tek kategori bırakıyor", await ev(`(async function(){
  document.querySelector('#arama').value='';
  document.querySelector('#arama').dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('.kat .kat-yalniz').click();
  await new Promise(function(r){setTimeout(r,1500);});
  var D=window.IZMIR_HARITA;
  return {secili:[].concat.apply([],[Array.from(D.seciliKategori)]),
          lejant:document.querySelectorAll('.lejant-satir').length,
          not:(document.querySelector('#ozet-filtre-notu')||{}).textContent};})()`),
  r => r.secili.length === 1 && r.lejant === 1);

denetle("temizle varsayılana döndürüyor", await ev(`(async function(){
  var b=document.querySelector('#ozet-filtre-notu button, #ozet-filtre-notu a');
  if(b) b.click();
  await new Promise(function(r){setTimeout(r,1500);});
  var D=window.IZMIR_HARITA;
  return {secili:Array.from(D.seciliKategori).sort()};})()`),
  r => r.secili.length >= 2);

console.log("\n— Harita araçları —");
denetle("altlık haritalar anahtarsız", await ev(`(function(){
  var o={};
  document.querySelectorAll('#altlik-secim button').forEach(function(b){
    b.click(); var k=document.querySelector('#harita .leaflet-tile-pane img');
    o[b.dataset.ad]= k? k.src.replace(/^https?:\\/\\//,'').slice(0,28) : 'karo-yok';});
  document.querySelector('#altlik-secim button[data-ad="Sokak"]').click();
  return o;})()`),
  r => Object.values(r).every(u => !/api[_-]?key|access[_-]?token/i.test(String(u))));

denetle("mesafe ölçer doğru ölçüyor", await ev(`(function(){
  var D=window.IZMIR_HARITA;
  var a=L.latLng(38.40,27.10), b=L.latLng(38.40,27.20);
  var gercek=Math.round(a.distanceTo(b));
  document.querySelector('#btn-olcum').click();
  D.harita.fire('click',{latlng:a}); D.harita.fire('click',{latlng:b});
  var yazi=(document.querySelector('#olcum-deger')||{}).textContent||'';
  document.querySelector('#olcum-bitir').click();
  var km=parseFloat(yazi.replace(/\\./g,'').replace(',','.'));
  return {yazi:yazi.trim(), gercek_km:+(gercek/1000).toFixed(2),
          sapma_yuzde:+Math.abs(km-gercek/1000)/(gercek/1000)*100};})()`),
  r => r.yazi && r.sapma_yuzde < 1);

console.log("\n— Konsol —");
const konsol = konsolOlaylari
  .map(m => { const p = m.params; return p.entry ? p.entry.level + ": " + p.entry.text : p.type + ": " + (p.args || []).map(a => a.value ?? a.description ?? "").join(" "); })
  .filter(x => !/tile|openstreetmap|arcgisonline|favicon|ERR_TUNNEL|ERR_NAME|ERR_PROXY|ERR_INTERNET/i.test(x))
  .filter(x => !/^log: /.test(x));
if (konsol.length) basarisiz++;
console.log("KONSOL:", konsol.length ? konsol.slice(0, 10) : "(temiz)");

console.log("\nBASARISIZ: " + basarisiz);
process.exit(basarisiz ? 1 : 0);
