# FieryLedLamp Web Flasher

Отдельный репозиторий сайта-прошивальщика ESP32-S3 для FieryLedLamp.

После включения GitHub Pages сайт будет доступен по адресу:

https://mishanyats.github.io/FieryLedLamp-Web-Flasher/

## Что где менять

- `firmware/config.js` — список поддерживаемых плат и пути к их пакетам.
- `firmware/ESP32-S3 N16R8/manifest.json` — параметры прошивки N16R8.
- `firmware/ESP32-S3 N8R8/manifest.json` — параметры прошивки N8R8.
- `firmware/index.html` — структура страницы и тексты.
- `firmware/style.css` — внешний вид.
- `firmware/app.js` — логика Web Serial и esptool-js. В рабочей конфигурации используется KEEP / KEEP / KEEP, аналог DoNotChgBin=ON.
- `.nojekyll` — служебный файл GitHub Pages, не удалять.

## Откуда берётся прошивка

На странице сначала выбирается модель платы.

Для каждой платы используется отдельная папка:

- `firmware/ESP32-S3 N16R8/update.zip`
- `firmware/ESP32-S3 N8R8/update.zip`

Рядом с архивом лежит свой `manifest.json`, поэтому адреса записи, размер Flash и другие параметры могут отличаться для каждой платы.

## Текущие адреса

- `bootloader.bin` → `0x00000000`
- `partitions.bin` → `0x00008000`
- `boot_app0.bin` → `0x0000E000`
- `firmware.bin` → `0x00010000`
- `littlefs.bin` → `0x00C90000`

Адреса хранятся в `manifest.json` внутри папки выбранной платы.

## Структура Web Flasher

Все файлы страницы прошивки теперь находятся в папке `firmware/`. Любое изменение внутри этой папки автоматически публикуется на `firmware.fieryledlamp.ru` через GitHub Actions.
