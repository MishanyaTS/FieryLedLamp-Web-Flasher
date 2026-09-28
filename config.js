// =========================================================
// FieryLedLamp Web Flasher — основные настройки сайта
// =========================================================
// Этот файл можно редактировать прямо на GitHub.

export const SITE_CONFIG = {
  projectName: "FieryLedLamp",
  pageTitle: "Прошивка ESP32-S3",
  subtitle: "Подключите плату по USB, выберите COM-порт и нажмите одну кнопку.",

  // Рабочая скорость из ESP32S3 Flash Download Tool.
  baudRate: 921600,

  // Откуда сайт берёт update.zip.
  // Сейчас файл хранится в основной ветке main проекта FieryLedLamp.
  firmwareZipUrl: "https://raw.githubusercontent.com/MishanyaTS/FieryLedLamp/main/FieryLedLamp/update.zip"
};
