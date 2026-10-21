// =========================================================
// FieryLedLamp Web Flasher — основные настройки сайта
// =========================================================
// Web Flasher предназначен только для ESP32-S3 N16R8.

export const SITE_CONFIG = {
  projectName: "Fiery Led Lamp",
  pageTitle: "Прошивка",
  baudRate: 921600,

  board: {
    id: "n16r8",
    label: "ESP32-S3 N16R8",
    manifestUrl: "./update/manifest.json",
    firmwareZipUrl: "./update/update.zip"
  }
};
