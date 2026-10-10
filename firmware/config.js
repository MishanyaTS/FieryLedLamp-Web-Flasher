// =========================================================
// FieryLedLamp Web Flasher — основные настройки сайта
// =========================================================
// Для каждой платы используется своя папка с manifest.json и update.zip.

export const SITE_CONFIG = {
  projectName: "Fiery Led Lamp",
  pageTitle: "Прошивка",
  baudRate: 921600,

  defaultBoard: "n16r8",

  boards: [
    {
      id: "n16r8",
      label: "ESP32-S3 N16R8",
      manifestUrl: "./ESP32-S3%20N16R8/manifest.json",
      firmwareZipUrl: "./ESP32-S3%20N16R8/update.zip"
    },
    {
      id: "n8r8",
      label: "ESP32-S3 N8R8",
      manifestUrl: "./ESP32-S3%20N8R8/manifest.json",
      firmwareZipUrl: "./ESP32-S3%20N8R8/update.zip"
    }
  ]
};
