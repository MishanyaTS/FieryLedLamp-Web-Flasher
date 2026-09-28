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

  // Пакет прошивки хранится в ЭТОМ отдельном репозитории.
  // Для обновления прошивки достаточно заменить firmware/update.zip.
  firmwareZipUrl: "./firmware/update.zip"
};
