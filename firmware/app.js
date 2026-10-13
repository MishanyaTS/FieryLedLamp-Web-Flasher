import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.6.1/bundle.js";
import { SITE_CONFIG } from "./config.js";


const ANALYTICS_URL = "./track.php";
const ANALYTICS_STORAGE_KEY = "fiery_analytics_id";
const ANALYTICS_BEACONS = [];

function analyticsVisitorId() {
  try {
    let id = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
      localStorage.setItem(ANALYTICS_STORAGE_KEY, id);
    }
    return id;
  } catch (_) {
    return "";
  }
}

function trackAnalytics(event, item = "", path = "/") {
  try {
    const params = new URLSearchParams({
      event,
      item,
      path,
      visitorId: analyticsVisitorId(),
      t: String(Date.now())
    });
    const image = new Image();
    ANALYTICS_BEACONS.push(image);
    const done = () => {
      const index = ANALYTICS_BEACONS.indexOf(image);
      if (index >= 0) ANALYTICS_BEACONS.splice(index, 1);
    };
    image.onload = done;
    image.onerror = done;
    image.src = ANALYTICS_URL + "?" + params.toString();
  } catch (_) {}
}

const $ = (id) => document.getElementById(id);
const ui = {
  compatBanner: $("compatBanner"), selectPortBtn: $("selectPortBtn"), flashBtn: $("flashBtn"),
  flashBtnText: $("flashBtnText"), portDot: $("portDot"), portText: $("portText"),
  firmwareName: $("firmwareName"), progressLabel: $("progressLabel"),
  progressPercent: $("progressPercent"), progressBar: $("progressBar"), resultBox: $("resultBox"),
  eraseAll: $("eraseAll"), saveSettings: $("saveSettings"),
  cfgChip: $("cfgChip"), cfgFlash: $("cfgFlash"), cfgPsram: $("cfgPsram"), cfgMode: $("cfgMode"),
  cfgFreq: $("cfgFreq"), cfgBaud: $("cfgBaud"), fileList: $("fileList"), log: $("log"),
  clearLogBtn: $("clearLogBtn"), previewFlash: $("previewFlash"), steps: [$("step1"), $("step2"), $("step3")],
};

let manifest = null;
let selectedBoard = SITE_CONFIG.board || null;
let selectedPort = null;
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
function syncEraseAllState() {
  const preserve = Boolean(ui.saveSettings?.checked);
  if (preserve) ui.eraseAll.checked = false;
  ui.eraseAll.disabled = isBusy || preserve;
}
function setBusy(busy) {
  isBusy = busy;
  ui.selectPortBtn.disabled = busy;
  if (ui.saveSettings) ui.saveSettings.disabled = busy;
  syncEraseAllState();
  ui.flashBtn.disabled = busy || !manifest || manifest.ready === false || !selectedBoard || !("serial" in navigator);
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
  if (!m) throw new Error("Manifest платы пустой.");
  if (m.ready === false) return;
  if (!Array.isArray(m.files) || !m.files.length) throw new Error("В manifest.json выбранной платы нет списка файлов.");
  for (const f of m.files) {
    if (!f.name || f.address == null) throw new Error("Для каждого файла нужны name и address.");
    if (!Number.isFinite(Number.parseInt(f.address, 0))) throw new Error(`Некорректный адрес ${f.name}`);
  }
}
async function loadManifest(board = selectedBoard) {
  if (!board?.manifestUrl) throw new Error("Для выбранной платы не указан manifestUrl.");

  selectedBoard = board;
  manifest = null;
  clearResult();
  ui.firmwareName.textContent = "Загрузка конфигурации…";
  setBusy(true);

  try {
    const response = await fetch(board.manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Не удалось загрузить manifest.json для ${board.label} (${response.status})`);

    manifest = await response.json();
    validateManifest(manifest);

    ui.firmwareName.textContent = manifest.name || SITE_CONFIG.projectName;
    ui.eraseAll.checked = Boolean(manifest.eraseAll);
    ui.cfgChip.textContent = manifest.chip || "—";
    ui.cfgFlash.textContent = `${manifest.physicalFlashSize || "—"} • KEEP`;
    if (ui.previewFlash) ui.previewFlash.textContent = manifest.physicalFlashSize || "—";
    ui.cfgPsram.textContent = manifest.psramSize || "—";
    ui.cfgMode.textContent = `${(manifest.toolSpiMode || "QIO").toUpperCase()} • DoNotChgBin`;
    ui.cfgFreq.textContent = `${manifest.toolSpiSpeed || "80MHz"} • KEEP`;
    ui.cfgBaud.textContent = String(manifest.baudRate || SITE_CONFIG.baudRate || 921600);

    if (manifest.ready === false) {
      renderFileList([]);
      const unavailableMessage = manifest.unavailableMessage || "Пакет прошивки пока не загружен.";
      showResult("error", unavailableMessage);
      log(`Выбрана плата ${board.label}: пакет пока не готов.`);
      return;
    }

    renderFileList(manifest.files);
    log(`Выбрана плата: ${board.label}. Конфигурация загружена.`);
  } finally {
    setBusy(false);
  }
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
  const firmwareZipUrl = selectedBoard?.firmwareZipUrl;
  if (!firmwareZipUrl) throw new Error("Для выбранной платы не указан firmwareZipUrl.");
  log(`Загрузка update.zip для ${selectedBoard.label}: ${firmwareZipUrl}`); setProgress(3,"Загрузка update.zip…");
  const response = await fetch(firmwareZipUrl, {cache:"no-store"});
  if (!response.ok) throw new Error(`Не удалось загрузить update.zip (${response.status}).`);
  trackAnalytics("firmware_download", selectedBoard?.id || "update.zip", "/");
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
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function backupSettingsBeforeFlash() {
  if (!selectedPort) throw new Error("COM-порт не выбран.");

  const baud = Number(manifest?.settingsBackupBaudRate || 115200);
  let reader = null;
  let opened = false;
  let timeoutId = null;
  let timedOut = false;

  log(`Сохранение настроек перед прошивкой через USB (${baud} бод)…`);
  setProgress(12, "Сохранение настроек…");

  try {
    await selectedPort.open({ baudRate: baud });
    opened = true;

    try {
      await selectedPort.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (_) {}

    await delay(350);

    const writer = selectedPort.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode("WEBFLASH_BACKUP\n"));
    } finally {
      writer.releaseLock();
    }

    reader = selectedPort.readable.getReader();
    const decoder = new TextDecoder();
    let received = "";
    let result = null;

    timeoutId = setTimeout(() => {
      timedOut = true;
      reader?.cancel().catch(() => {});
    }, 20000);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += decoder.decode(value, { stream: true });

      if (received.includes("WEBFLASH_BACKUP_START")) {
        setProgress(13, "Архивация настроек…");
      }

      if (received.includes("WEBFLASH_BACKUP_OK")) {
        result = { ok: true };
        break;
      }

      const errorPos = received.indexOf("WEBFLASH_BACKUP_ERROR:");
      if (errorPos >= 0) {
        const rest = received.slice(errorPos + "WEBFLASH_BACKUP_ERROR:".length);
        const end = rest.search(/[\r\n]/);
        result = { ok: false, error: (end >= 0 ? rest.slice(0, end) : rest).trim() || "unknown" };
        break;
      }

      if (received.length > 8192) received = received.slice(-4096);
    }

    if (timeoutId) clearTimeout(timeoutId);

    if (result?.ok) {
      log("Настройки сохранены в резервный раздел лампы.");
      setProgress(14, "Настройки сохранены");
      return true;
    }

    if (result && !result.ok) {
      throw new Error(`Лампа не смогла сохранить настройки: ${result.error}`);
    }

    if (timedOut) {
      throw new Error(
        "Текущая прошивка не поддерживает автоматическое сохранение настроек через USB или не ответила за 20 секунд. " +
        "Для прошивки без сохранения снимите галочку «Сохранить настройки перед прошивкой»."
      );
    }

    throw new Error("Соединение закрылось до завершения сохранения настроек.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (reader) {
      try { await reader.cancel(); } catch (_) {}
      try { reader.releaseLock(); } catch (_) {}
    }
    if (opened) {
      try { await selectedPort.close(); } catch (_) {}
    }
    await delay(350);
  }
}
async function rebootEsp32S3(transport,loader){
  log("Аппаратный перезапуск…");
  try{
    // В esptool-js: DTR=false => GPIO0 HIGH, RTS=true => EN LOW.
    // Явно формируем импульс RESET, затем отпускаем EN при GPIO0=HIGH,
    // чтобы плата загрузилась из Flash, а не осталась в bootloader.
    await transport.setDTR(false);
    await transport.setRTS(true);
    await delay(150);
    await transport.setRTS(false);
    await transport.setDTR(false);
    await delay(800);
    log("Импульс RESET выполнен.");
  }catch(e){
    log(`RTS/DTR reset не выполнен: ${e?.message||e}. Пробую стандартный hard_reset…`);
    await loader.after("hard_reset");
    await delay(500);
  }
}
async function safeDisconnect(t){if(!t)return;try{await t.disconnect();}catch(_){}}
async function flash(){
  if(isBusy)return; clearResult(); setBusy(true); setProgress(0,"Подготовка прошивки…"); let transport=null;
  try{
    if(!selectedPort)await choosePort(); setStep(2);
    const files=await loadFirmwareFiles(); const totalBytes=files.reduce((s,f)=>s+f.data.length,0); const writtenByFile=new Array(files.length).fill(0);

    if(ui.saveSettings?.checked){
      if(ui.eraseAll.checked) throw new Error("Полная очистка Flash несовместима с сохранением настроек.");
      await backupSettingsBeforeFlash();
    } else {
      log("Сохранение настроек перед прошивкой отключено.");
    }

    setProgress(15,"Подключение к ESP32-S3…"); log("Подключение…");
    transport=new Transport(selectedPort,true);
    const loader=new ESPLoader({transport,baudrate:Number(manifest.baudRate||SITE_CONFIG.baudRate||921600),terminal:createTerminal(),debugLogging:false});
    const chipName=await loader.main(); log(`Обнаружен чип: ${chipName}`);
    const expected=String(manifest.chip||"ESP32-S3").toUpperCase().replace(/[^A-Z0-9]/g,""); const detected=String(chipName||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(expected&&!detected.includes(expected))throw new Error(`Подключён ${chipName}, пакет предназначен для ${manifest.chip}.`);
    log("Режим записи: KEEP / KEEP / KEEP (аналог DoNotChgBin=ON).");
    const opts={fileArray:files.map(({data,address})=>({data,address})),flashMode:"keep",flashFreq:"keep",flashSize:"keep",eraseAll:ui.eraseAll.checked,compress:manifest.compress!==false,
      reportProgress:(i,written,total)=>{writtenByFile[i]=Math.min(written,total);const done=writtenByFile.reduce((s,n)=>s+n,0);const p=15+(totalBytes?(done/totalBytes)*83:0);setProgress(p,`Запись ${files[i]?.path||`файл ${i+1}`}… ${Math.round((written/total)*100)}%`);}};
    if(ui.eraseAll.checked)log("Включена полная очистка Flash.");
    await loader.writeFlash(opts); setProgress(99,"Перезапуск…"); await rebootEsp32S3(transport,loader); await safeDisconnect(transport);transport=null;
    setProgress(100,"Прошивка успешно завершена");showResult("success","Готово. Плата прошита и перезапущена.");ui.steps.forEach(s=>{s.classList.remove("active");s.classList.add("done");});log("ГОТОВО: прошивка успешно завершена.");
  }catch(e){await safeDisconnect(transport);const msg=e?.message||String(e);setProgress(0,"Ошибка прошивки");showResult("error",msg);log(`ОШИБКА: ${msg}`);}finally{setBusy(false);}
}
function checkCompatibility(){
  if(!window.isSecureContext){ui.compatBanner.textContent="COM-порт недоступен: откройте сайт по HTTPS или localhost.";ui.compatBanner.classList.remove("hidden");}
  if(!("serial" in navigator)){ui.compatBanner.textContent="Этот браузер не поддерживает Web Serial. Используйте совместимый Chromium-браузер.";ui.compatBanner.classList.remove("hidden");ui.selectPortBtn.disabled=true;ui.flashBtn.disabled=true;return false;}return true;
}
ui.selectPortBtn.addEventListener("click",async()=>{if(isBusy)return;clearResult();try{await choosePort();ui.flashBtn.disabled=!manifest;}catch(e){if(e?.name==="NotFoundError"){log("Выбор COM-порта отменён.");return;}showResult("error",e?.message||String(e));log(`Ошибка выбора порта: ${e?.message||e}`);}});
ui.flashBtn.addEventListener("click",flash);ui.clearLogBtn.addEventListener("click",()=>{ui.log.textContent="";});
if(ui.saveSettings) ui.saveSettings.addEventListener("change",syncEraseAllState);
if("serial"in navigator)navigator.serial.addEventListener("disconnect",e=>{if(selectedPort&&e.target===selectedPort&&!isBusy){ui.portDot.classList.remove("good");ui.portText.textContent="Порт отключён";setStep(1);log("COM-порт отключён.");}});
(async function init(){
  trackAnalytics("firmware_page_view", "", "/");
  setStep(0);
  checkCompatibility();
  try{
    if (!selectedBoard) throw new Error("В config.js не настроена ESP32-S3 N16R8.");
    await loadManifest(selectedBoard);
  }catch(e){
    ui.firmwareName.textContent="Ошибка конфигурации";
    showResult("error",e?.message||String(e));
    log(`ОШИБКА: ${e?.message||e}`);
    setBusy(false);
  }
})();


(() => {
  let button = document.getElementById("scrollToTopButton");

  if (!button) {
    button = document.createElement("button");
    button.id = "scrollToTopButton";
    button.type = "button";
    button.className = "scroll-to-top-button";
    button.setAttribute("aria-label", "Наверх");
    button.setAttribute("title", "Наверх");
    button.innerHTML = '<span aria-hidden="true">↑</span>';
    document.body.appendChild(button);
  }

  const getScrollTop = () => Math.max(
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );

  const updateVisibility = () => {
    button.classList.toggle("visible", getScrollTop() > 180);
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility, { passive: true });
  document.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
})();
