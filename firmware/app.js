import { SITE_CONFIG } from "./config.js";

let flashingToolsPromise;
function loadFlashingTools() {
  if (!flashingToolsPromise) {
    const zip = globalThis.JSZip ? Promise.resolve() : new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/jszip-3.10.1/jszip.min.js", import.meta.url).href;
      script.onload = () => globalThis.JSZip ? resolve() : reject(new Error("Не удалось загрузить библиотеку JSZip."));
      script.onerror = () => { script.remove(); reject(new Error("Не удалось загрузить библиотеку JSZip. Повторите попытку.")); };
      document.head.appendChild(script);
    });
    flashingToolsPromise = Promise.all([
      import("./vendor/esptool-js-0.6.1/bundle.js"), zip
    ]).then(([tools]) => tools).catch(error => { flashingToolsPromise = undefined; throw error; });
  }
  return flashingToolsPromise;
}

const ANALYTICS_URL = "./track.php";
const ANALYTICS_STORAGE_KEY = "fiery_analytics_id";

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
    fetch(ANALYTICS_URL + "?" + params.toString(), {
      cache: "no-store", credentials: "same-origin", keepalive: true
    }).catch(() => {});
  } catch (_) {}
}

const $ = (id) => document.getElementById(id);
const ui = {
  compatBanner: $("compatBanner"), selectPortBtn: $("selectPortBtn"), flashBtn: $("flashBtn"),
  flashBtnText: $("flashBtnText"), portDot: $("portDot"), portText: $("portText"),
  versionSelect: $("versionSelect"), progressLabel: $("progressLabel"),
  progressPercent: $("progressPercent"), progressBar: $("progressBar"), resultBox: $("resultBox"),
  eraseAll: $("eraseAll"), saveSettings: $("saveSettings"),
  cfgChip: $("cfgChip"), cfgFlash: $("cfgFlash"), cfgPsram: $("cfgPsram"), cfgMode: $("cfgMode"),
  cfgFreq: $("cfgFreq"), cfgBaud: $("cfgBaud"), fileList: $("fileList"), log: $("log"),
  clearLogBtn: $("clearLogBtn"), previewFlash: $("previewFlash"), preview: document.querySelector(".flasher-preview"),
  previewChip: $("previewChip"), previewChipName: $("previewChipName"), previewPsram: $("previewPsram"),
  previewDiagnostic: $("previewDiagnostic"), previewFlashId: $("previewFlashId"),
  steps: [$("step1"), $("step2"), $("step3")],
};

let manifest = null;
let releases = [];
let selectedBoard = SITE_CONFIG.board || null;
let selectedPort = null;
let isBusy = false;
let portReady = false;

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
function friendlyFlasherError(error) {
  const message = String(error?.message || error || "Неизвестная ошибка");
  if (/Failed to execute ['"]open['"] on ['"]SerialPort['"]|Failed to open serial port/i.test(message)) {
    return "Не удалось открыть COM-порт. Возможно, выбрана не та плата или порт занят другой программой.";
  }
  return message;
}
function clearResult() { ui.resultBox.className = "result hidden"; ui.resultBox.textContent = ""; }
function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
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
  if (ui.versionSelect) ui.versionSelect.disabled = busy || !releases.length;
  if (ui.saveSettings) ui.saveSettings.disabled = busy;
  syncEraseAllState();
  ui.flashBtn.disabled = busy || !portReady || !manifest || manifest.ready === false || !selectedBoard || !("serial" in navigator);
  ui.flashBtnText.textContent = busy ? "Прошивка…" : "Загрузить прошивку";
}
function portDescription(port) {
  const info = port.getInfo?.() || {}; const parts = [];
  if (info.usbVendorId != null) parts.push(`VID ${info.usbVendorId.toString(16).toUpperCase().padStart(4, "0")}`);
  if (info.usbProductId != null) parts.push(`PID ${info.usbProductId.toString(16).toUpperCase().padStart(4, "0")}`);
  return parts.length ? `Выбран (${parts.join(":")})` : "Порт выбран";
}
function setPortConnected(connected) {
  ui.portDot.classList.toggle("good", connected);
  if (ui.preview) ui.preview.dataset.connected = String(connected);
}
function flashSizeFromJedecId(id) {
  const capacityCode = (id >>> 16) & 0xFF;
  // JEDEC capacity is 2^N bytes. Ignore invalid and implausible values.
  if (!id || id === 0xFFFFFF || capacityCode < 0x10 || capacityCode > 0x1B) return null;
  return 2 ** capacityCode;
}
function showDeviceDiagnostic(state, info = {}) {
  // Do not confuse a selected firmware profile with an actually detected board.
  const chip = String(info.chip || "");
  const chipType = chip.replace(/^ESP32-S3\b\s*/i, "").trim() || "—";
  if (ui.preview) ui.preview.dataset.diagnostic = state;
  if (ui.previewChip) ui.previewChip.textContent = state === "ok" ? (info.board || "Не определена") : "—";
  if (ui.previewChipName) ui.previewChipName.textContent = chipType;
  if (ui.previewFlash) ui.previewFlash.textContent = info.flash || "—";
  if (ui.previewPsram) ui.previewPsram.textContent = info.psram || "—";
  if (ui.previewFlashId) ui.previewFlashId.textContent = "Flash ID: " + (info.flashId || "—");
  if (ui.previewDiagnostic) ui.previewDiagnostic.textContent = info.message || "Выберите COM-порт для диагностики.";
}

// ESP32-S3 stores the size of its embedded PSRAM in eFuse, readable from
// the ROM flasher without a running application or a USB protocol extension.
// This reports package capacity, not whether the application initialized PSRAM.
async function readEmbeddedPsram(loader) {
  const code = typeof loader.chip?.getPsramCap === "function"
    ? await loader.chip.getPsramCap(loader)
    : ((await loader.readReg(0x60007000 + 0x44 + 0x10)) >>> 3) & 0x03;

  if (code === 1) return {
    bytes: 8 * 1024 * 1024,
    note: "PSRAM: встроенная 8 МБ по eFuse ESP32-S3. Работоспособность не проверяется."
  };
  if (code === 2) return {
    bytes: 2 * 1024 * 1024,
    note: "PSRAM: встроенная 2 МБ по eFuse ESP32-S3. Работоспособность не проверяется."
  };
  return {
    bytes: null,
    note: code === 0
      ? "eFuse не указывает встроенную PSRAM. Внешняя PSRAM этим способом не определяется."
      : "eFuse сообщает неизвестный тип PSRAM. Объём не определён."
  };
}

// Hardware probing must run AFTER WEBFLASH_BACKUP, not at COM selection.
// Entering the ROM flasher first can leave ESP32-S3 native USB unavailable to
// the running firmware. Rebooting after a successful backup would also consume
// its restore-pending flag before new firmware is written.
async function inspectConnectedHardware(loader, chipName) {
  const found = {chip:String(chipName || "—"),board:null,flash:"—",flashId:"—",psram:"—",psramBytes:null};
  showDeviceDiagnostic("checking", {...found, message:"Проверка чипа, Flash и PSRAM перед записью…"});
  log("Аппаратная диагностика перед прошивкой (после сохранения настроек)…");
  try {
    const expectedChip = String(manifest?.chip || "ESP32-S3").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const detectedChip = found.chip.toUpperCase().replace(/[^A-Z0-9]/g,"");
    if (!detectedChip.includes(expectedChip)) {
      throw new Error("Подключён " + found.chip + ", пакет предназначен для " + (manifest?.chip || "ESP32-S3") + ".");
    }

    // PSRAM capacity is read from eFuse, independent of installed firmware.
    try {
      const ram = await readEmbeddedPsram(loader);
      if (ram.bytes != null) {
        found.psramBytes = ram.bytes;
        found.psram = (ram.bytes / (1024 * 1024)) + " МБ";
        log("Диагностика: встроенная PSRAM " + found.psram + " (eFuse).");
        const expected = Number.parseInt(manifest?.psramSize || "",10);
        if (Number.isFinite(expected) && ram.bytes < expected * 1024 * 1024) {
          log("Внимание: объём PSRAM меньше ожидаемых " + expected + " МБ.");
        }
      } else {
        log("PSRAM: не удалось определить объём по eFuse.");
      }
    } catch(e) {
      log("PSRAM: ошибка определения: " + friendlyFlasherError(e));
    }

    // The loader's stub is already active. Flash ID cannot reliably be
    // obtained using the ROM-only path that previously returned 0xFFFFFF.
    const flashId = (await loader.readFlashId()) >>> 0;
    found.flashId = "0x" + flashId.toString(16).toUpperCase().padStart(6,"0");
    const flashBytes = flashSizeFromJedecId(flashId);
    if (!flashBytes) throw new Error("Не удалось достоверно определить Flash по JEDEC ID " + found.flashId + ". Запись заблокирована.");
    found.flash = (flashBytes/(1024*1024)) + " МБ";
    log("Диагностика: Flash " + found.flash + ", JEDEC ID " + found.flashId);

    const expectedFlashMB = Number.parseInt(manifest?.physicalFlashSize || "16MB",10);
    if (Number.isFinite(expectedFlashMB) && flashBytes < expectedFlashMB * 1024 * 1024) {
      throw new Error("Flash " + found.flash + " меньше необходимых " + expectedFlashMB + " МБ. Запись заблокирована.");
    }
    const flashMatches = Number.isFinite(expectedFlashMB) && flashBytes === expectedFlashMB * 1024 * 1024;
    const expectedPsramMB = Number.parseInt(manifest?.psramSize || "",10);
    const psramMatches = Number.isFinite(expectedPsramMB) && found.psramBytes === expectedPsramMB * 1024 * 1024;
    if (flashMatches && psramMatches) {
      found.board = SITE_CONFIG.board?.label || manifest?.board || null;
      log("Диагностика: плата соответствует " + found.board + ".");
    } else {
      log("Диагностика: модель платы не подтверждена по Flash и PSRAM.");
    }
    showDeviceDiagnostic("ok", {...found, message:found.board
      ? "Плата определена. Чип, Flash и PSRAM проверены."
      : "Чип и Flash проверены. Модель платы не подтверждена полностью."});
    return found;
  } catch(error) {
    showDeviceDiagnostic("error", {...found, message:"Ошибка аппаратной диагностики: " + friendlyFlasherError(error)});
    throw error;
  }
}

async function choosePort() {
  if (!("serial" in navigator)) throw new Error("Этот браузер не поддерживает Web Serial.");
  const port = await navigator.serial.requestPort();
  selectedPort = port;
  portReady = true;
  setPortConnected(true);
  ui.portText.textContent = portDescription(port) + " • выбран";
  showDeviceDiagnostic("idle", {message:"Чип, Flash и PSRAM будут проверены непосредственно перед записью, после сохранения настроек."});
  log("COM-порт выбран. Диагностика будет выполнена при запуске прошивки — после резервного копирования.");
  setStep(2);
  setBusy(false);
  clearResult();
  return port;
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
  renderFileList([]);
  setProgress(0, "Готово к работе");
  setBusy(true);

  try {
    const response = await fetch(board.manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Не удалось загрузить manifest.json для ${board.label} (${response.status})`);

    const loaded = await response.json();
    validateManifest(loaded);
    manifest = loaded;

    ui.eraseAll.checked = Boolean(manifest.eraseAll);
    ui.cfgChip.textContent = manifest.chip || "-";
    ui.cfgFlash.textContent = `${manifest.physicalFlashSize || "-"} • KEEP`;
    ui.cfgPsram.textContent = manifest.psramSize || "-";
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
    log(`Выбрана ${board.releaseLabel || board.label}. Конфигурация загружена.`);
  } finally {
    setBusy(false);
  }
}
// Numbered folders are discovered on the server; the selected release controls
// both the manifest (flash addresses) and the update.zip archive.
async function loadSelectedRelease(release) {
  const board = { ...SITE_CONFIG.board, ...release, label: SITE_CONFIG.board.label, releaseLabel: release.label };
  if (selectedPort && selectedBoard?.firmwareZipUrl !== board.firmwareZipUrl) {
    portReady = false;
    setPortConnected(false);
    ui.portText.textContent = "Повторите выбор COM-порта";
    showDeviceDiagnostic("idle", {
      message: "Версия изменена. Выберите COM-порт повторно. Диагностика выполняется перед записью."
    });
    setStep(0);
  }
  await loadManifest(board);
}

async function loadReleaseList() {
  const base = SITE_CONFIG.board;
  if (!base) throw new Error("В config.js не настроена ESP32-S3 N16R8.");

  let items;
  try {
    const response = await fetch(SITE_CONFIG.versionsUrl || "./update/versions.php", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (!Array.isArray(data.versions)) throw new Error("Некорректный список версий.");
    items = data.versions;
  } catch (error) {
    // Keeps the existing web flasher usable while versions.php is being deployed.
    log("Список версий недоступен (" + (error?.message || error) + "). Используется прежний пакет.");
    items = [{
      version: "legacy",
      label: "Текущая прошивка",
      manifestUrl: base.manifestUrl,
      firmwareZipUrl: base.firmwareZipUrl
    }];
  }

  releases = items.filter(item =>
    item && typeof item.version === "string" && item.version.length > 0 &&
    typeof item.label === "string" &&
    typeof item.manifestUrl === "string" &&
    typeof item.firmwareZipUrl === "string"
  );
  if (!releases.length) throw new Error("На сервере пока нет доступных версий прошивки.");

  ui.versionSelect.replaceChildren();
  for (const release of releases) {
    const option = document.createElement("option");
    option.value = release.version;
    option.textContent = release.label;
    ui.versionSelect.appendChild(option);
  }
  ui.versionSelect.value = releases[0].version;
  await loadSelectedRelease(releases[0]);
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
  renderFileList(manifest.files,sizes);
  // Count a validated archive download, tagged with the selected release.
  const version = String(selectedBoard?.version || "legacy");
  trackAnalytics("firmware_download", "v:" + version, "/");
  return files;
}
function createTerminal(){return{clean(){},writeLine(d){if(d!=null)log(d);},write(d){if(d!=null&&String(d).trim())log(d);}};}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function backupSettingsBeforeFlash() {
  if (!selectedPort) throw new Error("COM-порт не выбран.");
  const baud = Number(manifest?.settingsBackupBaudRate || 115200);
  let reader = null, readerTask = null, opened = false;
  let reading = true, receiveError = null, received = "";

  log("USB: проверка связи с работающей прошивкой (" + baud + " бод)…");
  setProgress(12, "Проверка USB-связи…");
  try {
    await selectedPort.open({baudRate: baud});
    opened = true;
    // Keep the CDC terminal open; do not assert RTS (reset).
    try {
      await selectedPort.setSignals({dataTerminalReady: false, requestToSend: false});
      log("USB: DTR и RTS отключены (совместимость со старым режимом сохранения).");
    } catch (e) {
      log("USB: сигналы CDC не установлены: " + (e?.message || e));
    }
    await delay(350);

    reader = selectedPort.readable.getReader();
    readerTask = (async () => {
      const decoder = new TextDecoder();
      try {
        while (reading) {
          const {value, done} = await reader.read();
          if (done) {
            if (reading) receiveError = new Error("COM-порт закрылся во время обмена.");
            break;
          }
          if (value?.length) {
            received += decoder.decode(value, {stream:true});
            if (received.length > 16384) received = received.slice(-8192);
          }
        }
      } catch (e) {
        if (reading) receiveError = e;
      }
    })();

    const writer = selectedPort.writable.getWriter();
    const encoder = new TextEncoder();
    const send = command => writer.write(encoder.encode(command + "\n"));
    const waitFor = async (predicate, ms) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const result = predicate(received);
        if (result) return result;
        if (receiveError) throw receiveError;
        await delay(80);
      }
      return null;
    };

    try {
      // WEBFLASH_BACKUP is supported by older builds that have no
      // WEBFLASH_PSRAM command. Never gate backup on that optional probe.
      log("USB: отправляю WEBFLASH_BACKUP без дополнительной проверки PSRAM…");
      setProgress(13, "Сохранение настроек…");
      await send("WEBFLASH_BACKUP");
      let started = false;
      const result = await waitFor(text => {
        if (!started && text.includes("WEBFLASH_BACKUP_START")) {
          started = true;
          log("USB: лампа начала архивацию настроек.");
          setProgress(14, "Архивация настроек…");
        }
        const errorPos = text.indexOf("WEBFLASH_BACKUP_ERROR:");
        if (errorPos >= 0) {
          const rest = text.slice(errorPos + "WEBFLASH_BACKUP_ERROR:".length);
          const eol = rest.search(/[\r\n]/);
          return {ok:false, error:(eol >= 0 ? rest.slice(0,eol) : rest).trim() || "unknown"};
        }
        return text.includes("WEBFLASH_BACKUP_OK") ? {ok:true} : null;
      }, 60000);

      if (result?.ok) {
        log("USB: настройки сохранены в резервный раздел лампы.");
        setProgress(14, "Настройки сохранены");
        return true;
      }
      if (result && !result.ok) throw new Error("Ошибка сохранения настроек лампы: " + result.error);
      throw new Error(started
        ? "Архивация началась, но лампа не подтвердила её завершение за 60 секунд. Прошивка отменена."
        : "Лампа не подтвердила команду WEBFLASH_BACKUP. Возможна проблема возврата из аппаратной диагностики или несовпадение USB COM-порта. Прошивка отменена.");
    } finally {
      writer.releaseLock();
    }
  } finally {
    reading = false;
    if (reader) {try {await reader.cancel();} catch (_) {}}
    if (readerTask) {try {await readerTask;} catch (_) {}}
    if (reader) {try {reader.releaseLock();} catch (_) {}}
    if (opened) {try {await selectedPort.close();} catch (_) {}}
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
    if(!selectedPort || !portReady) throw new Error("Сначала выберите COM-порт платы.");
    setStep(2);
    setProgress(1, "Подготовка инструментов прошивки…");
    const { ESPLoader, Transport } = await loadFlashingTools();
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
    await inspectConnectedHardware(loader, chipName);
    log("Режим записи: KEEP / KEEP / KEEP (аналог DoNotChgBin=ON).");
    const opts={fileArray:files.map(({data,address})=>({data,address})),flashMode:"keep",flashFreq:"keep",flashSize:"keep",eraseAll:ui.eraseAll.checked,compress:manifest.compress!==false,
      reportProgress:(i,written,total)=>{writtenByFile[i]=Math.min(written,total);const done=writtenByFile.reduce((s,n)=>s+n,0);const p=15+(totalBytes?(done/totalBytes)*83:0);setProgress(p,`Запись ${files[i]?.path||`файл ${i+1}`}… ${Math.round((written/total)*100)}%`);}};
    if(ui.eraseAll.checked)log("Включена полная очистка Flash.");
    await loader.writeFlash(opts); setProgress(99,"Перезапуск…"); await rebootEsp32S3(transport,loader); await safeDisconnect(transport);transport=null;
    setProgress(100,"Прошивка успешно завершена");showResult("success","Готово. Плата прошита и перезапущена.");ui.steps.forEach(s=>{s.classList.remove("active");s.classList.add("done");});log("ГОТОВО: прошивка успешно завершена.");
  }catch(e){await safeDisconnect(transport);const msg=friendlyFlasherError(e);setProgress(0,"Ошибка прошивки");showResult("error",msg);log(`ОШИБКА: ${msg}`);}finally{setBusy(false);}
}
function checkCompatibility(){
  if(!window.isSecureContext){ui.compatBanner.textContent="COM-порт недоступен: откройте сайт по HTTPS или localhost.";ui.compatBanner.classList.remove("hidden");}
  if(!("serial" in navigator)){ui.compatBanner.textContent="Этот браузер не поддерживает Web Serial. Используйте совместимый Chromium-браузер.";ui.compatBanner.classList.remove("hidden");ui.selectPortBtn.disabled=true;ui.flashBtn.disabled=true;return false;}return true;
}
ui.versionSelect.addEventListener("change", async () => {
  if (isBusy) return;
  const release = releases.find(item => item.version === ui.versionSelect.value);
  if (!release) return;
  try {
    await loadSelectedRelease(release);
  } catch (error) {
    const message = error?.message || String(error);
    showResult("error", message);
    log("ОШИБКА загрузки версии: " + message);
  }
});
ui.selectPortBtn.addEventListener("click",async()=>{if(isBusy)return;clearResult();try{await choosePort();setBusy(false);}catch(e){if(e?.name==="NotFoundError"){log("Выбор COM-порта отменён.");return;}const msg=friendlyFlasherError(e);showResult("error",msg);log(`Ошибка выбора порта: ${msg}`);}});
ui.flashBtn.addEventListener("click",flash);ui.clearLogBtn.addEventListener("click",()=>{ui.log.textContent="";});
if(ui.saveSettings) ui.saveSettings.addEventListener("change",syncEraseAllState);
if ("serial" in navigator) navigator.serial.addEventListener("disconnect", event => {
  const port = event.port || event.target;
  if (!selectedPort || port !== selectedPort) return;
  selectedPort = null;
  portReady = false;
  showDeviceDiagnostic("idle", {message: "Устройство отключено. Выберите COM-порт для диагностики."});
  setPortConnected(false);
  ui.portText.textContent = "Порт отключён";
  if (!isBusy) { setStep(0); setBusy(false); }
  log("COM-порт отключён.");
});
(async function init(){
  let viewSent = false;
  const sendView = () => { if (!viewSent) { viewSent = true; trackAnalytics("firmware_page_view", "", "/"); } };
  const scheduleView = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(sendView, { timeout: 1500 });
    else setTimeout(sendView, 300);
  };
  addEventListener("pagehide", sendView, { once: true });
  if (document.readyState === "complete") scheduleView();
  else addEventListener("load", scheduleView, { once: true });
  setStep(0);
  showDeviceDiagnostic("idle");
  checkCompatibility();
  try{
    if (!selectedBoard) throw new Error("В config.js не настроена ESP32-S3 N16R8.");
    await loadReleaseList();
  }catch(e){
    ui.versionSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Версии недоступны";
    ui.versionSelect.appendChild(option);
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
