import { SITE_CONFIG } from "./config.js?v=20260929-2";

let ESPLoader = null;
let Transport = null;

const $ = (id) => document.getElementById(id);
const ui = {
  compatBanner: $("compatBanner"), selectPortBtn: $("selectPortBtn"), flashBtn: $("flashBtn"),
  flashBtnText: $("flashBtnText"), portDot: $("portDot"), portText: $("portText"),
  firmwareName: $("firmwareName"), firmwareMeta: $("firmwareMeta"), progressLabel: $("progressLabel"),
  progressPercent: $("progressPercent"), progressBar: $("progressBar"), resultBox: $("resultBox"),
  eraseAll: $("eraseAll"), cfgChip: $("cfgChip"), cfgFlash: $("cfgFlash"), cfgMode: $("cfgMode"),
  cfgFreq: $("cfgFreq"), cfgBaud: $("cfgBaud"), fileList: $("fileList"), log: $("log"),
  clearLogBtn: $("clearLogBtn"), steps: [$("step1"), $("step2"), $("step3")],
};

let manifest = null;
let selectedPort = null;
let dependencyLoadPromise = null;

function withTimeout(promise, ms, label){
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + " — превышено время ожидания")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadEsptool(){
  if(ESPLoader && Transport) return;
  const sources = [
    "https://unpkg.com/esptool-js@0.6.1/bundle.js",
    "https://cdn.jsdelivr.net/npm/esptool-js@0.6.1/bundle.js"
  ];
  let lastError = null;
  for(const url of sources){
    try{
      const mod = await withTimeout(import(url), 15000, "esptool-js");
      if(mod?.ESPLoader && mod?.Transport){
        ESPLoader = mod.ESPLoader;
        Transport = mod.Transport;
        log("Модуль esptool-js загружен.");
        return;
      }
      throw new Error("В модуле отсутствуют ESPLoader/Transport");
    }catch(e){
      lastError = e;
      log(`Не удалось загрузить esptool-js с ${url}: ${e?.message || e}`);
    }
  }
  throw new Error(`Не удалось загрузить модуль esptool-js. ${lastError?.message || ""}`);
}

function loadScript(url, timeoutMs = 15000){
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("Превышено время ожидания"));
    }, timeoutMs);
    script.src = url;
    script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Ошибка загрузки")); };
    document.head.appendChild(script);
  });
}

async function loadJSZip(){
  if(globalThis.JSZip) return;
  const sources = [
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
  ];
  let lastError = null;
  for(const url of sources){
    try{
      await loadScript(url);
      if(globalThis.JSZip){
        log("Модуль JSZip загружен.");
        return;
      }
      throw new Error("JSZip не найден после загрузки");
    }catch(e){
      lastError = e;
      log(`Не удалось загрузить JSZip с ${url}: ${e?.message || e}`);
    }
  }
  throw new Error(`Не удалось загрузить JSZip. ${lastError?.message || ""}`);
}

async function loadDependencies(){
  if(!dependencyLoadPromise){
    dependencyLoadPromise = Promise.all([loadEsptool(), loadJSZip()]).catch(err => {
      dependencyLoadPromise = null;
      throw err;
    });
  }
  return dependencyLoadPromise;
}

let isBusy = false;

function stamp() { return new Date().toLocaleTimeString("ru-RU", { hour12: false }); }
function log(message = "") {
  const line = String(message).replace(/\r/g, "");
  ui.log.textContent += `[${stamp()}] ${line}${line.endsWith("\n") ? "" : "\n"}`;
  ui.log.scrollTop = ui.log.scrollHeight;
}
function setProgress(percent, label) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  ui.progressBar.style.width = `${p}%`; ui.progressPercent.textContent = `${Math.round(p)}%`;
  if (label) ui.progressLabel.textContent = label;
}
function setStep(index) {
  ui.steps.forEach((step, i) => { step.classList.toggle("active", i === index); step.classList.toggle("done", i < index); });
}
function showResult(type, text) { ui.resultBox.className = `result ${type}`; ui.resultBox.textContent = text; }
function clearResult() { ui.resultBox.className = "result hidden"; ui.resultBox.textContent = ""; }
function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}
function fmtAddress(value) {
  const n = typeof value === "string" ? Number.parseInt(value, 0) : Number(value);
  return `0x${n.toString(16).toUpperCase().padStart(8, "0")}`;
}
function setBusy(busy) {
  isBusy = busy; ui.selectPortBtn.disabled = busy; ui.eraseAll.disabled = busy;
  ui.flashBtn.disabled = busy || !manifest || !("serial" in navigator);
  ui.flashBtnText.textContent = busy ? "Прошивка…" : "Загрузить прошивку";
}
function portDescription(port) {
  const info = port.getInfo?.() || {}; const parts = [];
  if (info.usbVendorId != null) parts.push(`VID ${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}`);
  if (info.usbProductId != null) parts.push(`PID ${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}`);
  return parts.length ? `Выбран (${parts.join(":")})` : "Порт выбран";
}
async function choosePort() {
  if (!("serial" in navigator)) throw new Error("Этот браузер не поддерживает Web Serial.");
  selectedPort = await navigator.serial.requestPort();
  ui.portText.textContent = portDescription(selectedPort); ui.portDot.classList.add("good"); setStep(2);
  log("COM-порт выбран пользователем."); return selectedPort;
}
function validateManifest(m) {
  if (!m || !Array.isArray(m.files) || !m.files.length) throw new Error("В firmware/manifest.json нет списка файлов.");
  for (const f of m.files) {
    if (!f.name || f.address == null) throw new Error("Для каждого файла нужны name и address.");
    if (!Number.isFinite(Number.parseInt(f.address, 0))) throw new Error(`Некорректный адрес ${f.name}`);
  }
}
async function loadManifest() {
  const response = await fetch("./firmware/manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Не удалось загрузить firmware/manifest.json (${response.status})`);
  manifest = await response.json(); validateManifest(manifest);
  document.title = `${SITE_CONFIG.projectName} — ${SITE_CONFIG.pageTitle}`;
  const title = document.querySelector("h1"); if (title) title.textContent = SITE_CONFIG.pageTitle;
  const subtitle = document.querySelector(".subtitle"); if (subtitle) subtitle.textContent = SITE_CONFIG.subtitle;
  ui.firmwareName.textContent = `${manifest.name || SITE_CONFIG.projectName}${manifest.version ? ` • ${manifest.version}` : ""}`;
  ui.firmwareMeta.textContent = `${manifest.files.length} файлов • прошивка из GitHub`;
  ui.eraseAll.checked = Boolean(manifest.eraseAll);
  ui.cfgChip.textContent = manifest.chip || "—";
  ui.cfgFlash.textContent = `${manifest.physicalFlashSize || "16MB"} • KEEP`;
  ui.cfgMode.textContent = `${(manifest.toolSpiMode || "QIO").toUpperCase()} • DoNotChgBin`;
  ui.cfgFreq.textContent = `${manifest.toolSpiSpeed || "80MHz"} • KEEP`;
  ui.cfgBaud.textContent = String(manifest.baudRate || SITE_CONFIG.baudRate || 921600);
  renderFileList(manifest.files); setBusy(false); log("Конфигурация сайта загружена.");
}
function renderFileList(files, sizes = new Map()) {
  ui.fileList.innerHTML = "";
  files.forEach((f) => {
    const row = document.createElement("div"); row.className = "file-row";
    const size = sizes.get(f.name);
    row.innerHTML = `<code>${fmtAddress(f.address)}</code><span class="fname"></span><span class="fsize">${size == null ? "из update.zip" : fmtBytes(size)}</span>`;
    row.querySelector(".fname").textContent = f.name; ui.fileList.appendChild(row);
  });
}
function decodeEspImageHeader(data) {
  if (!(data instanceof Uint8Array) || data.length < 8 || data[0] !== 0xE9) return null;
  const modeNames={0:"qio",1:"qout",2:"dio",3:"dout"}; const sizeNames={0:"1MB",1:"2MB",2:"4MB",3:"8MB",4:"16MB",5:"32MB",6:"64MB",7:"128MB"}; const freqNames={0:"40m",1:"26m",2:"20m",15:"80m"};
  return {mode:modeNames[data[2]],size:sizeNames[(data[3]>>4)&15],freq:freqNames[data[3]&15]};
}
function validateBootloader(data) {
  const h=decodeEspImageHeader(data); if(!h) throw new Error("bootloader.bin не похож на ESP32 bootloader.");
  log(`Bootloader: ${String(h.mode).toUpperCase()}, ${String(h.freq).toUpperCase()}, ${h.size}.`);
  log("DoNotChgBin = ON: заголовок bootloader.bin не изменяется.");
}
async function loadFirmwareFiles() {
  if (!globalThis.JSZip) throw new Error("Не удалось загрузить библиотеку JSZip.");
  if (!SITE_CONFIG.firmwareZipUrl) throw new Error("В config.js не указан firmwareZipUrl.");
  log(`Загрузка update.zip: ${SITE_CONFIG.firmwareZipUrl}`); setProgress(3,"Загрузка update.zip с GitHub…");
  const response = await fetch(SITE_CONFIG.firmwareZipUrl, {cache:"no-store"});
  if (!response.ok) throw new Error(`Не удалось загрузить update.zip (${response.status}).`);
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  if (!zipBytes.length) throw new Error("update.zip пустой.");
  log(`update.zip загружен: ${fmtBytes(zipBytes.length)}.`); setProgress(10,"Распаковка update.zip…");
  const zip = await globalThis.JSZip.loadAsync(zipBytes, {checkCRC32:true});
  const files=[]; const sizes=new Map();
  for(const f of manifest.files){
    const entry=zip.file(f.name); if(!entry) throw new Error(`В update.zip отсутствует ${f.name}.`);
    const data=new Uint8Array(await entry.async("uint8array")); if(!data.length) throw new Error(`${f.name} пустой.`);
    const address=Number.parseInt(f.address,0); if(address===0) validateBootloader(data);
    files.push({data,address,path:f.name}); sizes.set(f.name,data.length); log(`${f.name}: ${fmtBytes(data.length)} → ${fmtAddress(address)}`);
  }
  renderFileList(manifest.files,sizes); return files;
}
function createTerminal(){return{clean(){},writeLine(d){if(d!=null)log(d);},write(d){if(d!=null&&String(d).trim())log(d);}};}
async function safeDisconnect(t){if(!t)return;try{await t.disconnect();}catch(_){}}
async function flash(){
  if(isBusy)return; clearResult(); setBusy(true); setProgress(0,"Подготовка прошивки…"); let transport=null;
  try{
    if(!selectedPort)await choosePort(); setStep(2);
    setProgress(2,"Загрузка модулей прошивки…");
    await loadDependencies();
    const files=await loadFirmwareFiles(); const totalBytes=files.reduce((s,f)=>s+f.data.length,0); const writtenByFile=new Array(files.length).fill(0);
    setProgress(12,"Подключение к ESP32-S3…"); log("Подключение к ESP32-S3…");
    transport=new Transport(selectedPort,true);
    const loader=new ESPLoader({transport,baudrate:Number(manifest.baudRate||SITE_CONFIG.baudRate||921600),terminal:createTerminal(),debugLogging:false});
    const chipName=await loader.main(); log(`Обнаружен чип: ${chipName}`);
    const expected=String(manifest.chip||"ESP32-S3").toUpperCase().replace(/[^A-Z0-9]/g,""); const detected=String(chipName||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(expected&&!detected.includes(expected))throw new Error(`Подключён ${chipName}, пакет предназначен для ${manifest.chip}.`);
    log("Режим записи: KEEP / KEEP / KEEP (аналог DoNotChgBin=ON).");
    const opts={fileArray:files.map(({data,address})=>({data,address})),flashMode:"keep",flashFreq:"keep",flashSize:"keep",eraseAll:ui.eraseAll.checked,compress:manifest.compress!==false,
      reportProgress:(i,written,total)=>{writtenByFile[i]=Math.min(written,total);const done=writtenByFile.reduce((s,n)=>s+n,0);const p=15+(totalBytes?(done/totalBytes)*83:0);setProgress(p,`Запись ${files[i]?.path||`файл ${i+1}`}… ${Math.round((written/total)*100)}%`);}};
    if(ui.eraseAll.checked)log("Включена полная очистка Flash.");
    await loader.writeFlash(opts); setProgress(99,"Перезапуск ESP32-S3…"); await loader.after("hard_reset"); await safeDisconnect(transport);transport=null;
    setProgress(100,"Прошивка успешно завершена");showResult("success","Готово. ESP32-S3 прошита и перезапущена.");ui.steps.forEach(s=>{s.classList.remove("active");s.classList.add("done");});log("ГОТОВО: прошивка успешно завершена.");
  }catch(e){await safeDisconnect(transport);const msg=e?.message||String(e);setProgress(0,"Ошибка прошивки");showResult("error",msg);log(`ОШИБКА: ${msg}`);}finally{setBusy(false);}
}
function checkCompatibility(){
  if(!window.isSecureContext){ui.compatBanner.textContent="COM-порт недоступен: откройте сайт по HTTPS или localhost.";ui.compatBanner.classList.remove("hidden");}
  if(!("serial" in navigator)){ui.compatBanner.textContent="Этот браузер не поддерживает Web Serial. Используйте совместимый Chromium-браузер.";ui.compatBanner.classList.remove("hidden");ui.selectPortBtn.disabled=true;ui.flashBtn.disabled=true;return false;}return true;
}
ui.selectPortBtn.addEventListener("click",async()=>{if(isBusy)return;clearResult();try{await choosePort();ui.flashBtn.disabled=!manifest;}catch(e){if(e?.name==="NotFoundError"){log("Выбор COM-порта отменён.");return;}showResult("error",e?.message||String(e));log(`Ошибка выбора порта: ${e?.message||e}`);}});
ui.flashBtn.addEventListener("click",flash);ui.clearLogBtn.addEventListener("click",()=>{ui.log.textContent="";});
if("serial"in navigator)navigator.serial.addEventListener("disconnect",e=>{if(selectedPort&&e.target===selectedPort&&!isBusy){ui.portDot.classList.remove("good");ui.portText.textContent="Порт отключён";setStep(1);log("COM-порт отключён.");}});
(async function init(){setStep(0);checkCompatibility();try{await loadManifest();}catch(e){ui.firmwareName.textContent="Ошибка конфигурации";showResult("error",e?.message||String(e));log(`ОШИБКА: ${e?.message||e}`);}})();
