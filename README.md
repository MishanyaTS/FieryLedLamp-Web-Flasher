# FieryLedLamp Web Flasher

Отдельный репозиторий сайта-прошивальщика ESP32-S3 для FieryLedLamp.

После включения GitHub Pages сайт будет доступен по адресу:

https://mishanyats.github.io/FieryLedLamp-Web-Flasher/

## Что где менять

- `website/shared/header/template.html` — единая шапка и меню всех страниц обоих сайтов.
- `website/shared/header/header.css` — общий стиль шапки высотой 90 пикселей.
- `website/shared/header/header.js` и `icons.svg` — общий поиск, меню и значки.
- `scripts/render-header.py` — сборка шапки; выполняется автоматически перед публикацией обоих сайтов. Для локального просмотра после правки общих файлов выполните `python3 scripts/render-header.py`. Сгенерированные шапки в HTML отдельно не редактируются. Подробности: `website/assets/header-outline.md`.
- `firmware/config.js` — настройки Web Flasher для ESP32-S3 N16R8.
- `firmware/ESP32-S3 N16R8/manifest.json` — параметры прошивки N16R8.
- `firmware/index.html` — структура страницы и тексты.
- `firmware/style.css` — внешний вид.
- `firmware/app.js` — логика Web Serial и esptool-js. В рабочей конфигурации используется KEEP / KEEP / KEEP, аналог DoNotChgBin=ON.
- `.nojekyll` — служебный файл GitHub Pages, не удалять.

## Откуда берётся прошивка

Web Flasher настроен только для платы ESP32-S3 N16R8.

Файл прошивки находится в `firmware/ESP32-S3 N16R8/update.zip`, а параметры записи — в `firmware/ESP32-S3 N16R8/manifest.json`.

## Текущие адреса

- `bootloader.bin` → `0x00000000`
- `partitions.bin` → `0x00008000`
- `boot_app0.bin` → `0x0000E000`
- `firmware.bin` → `0x00010000`
- `littlefs.bin` → `0x00C90000`

Адреса хранятся в `firmware/ESP32-S3 N16R8/manifest.json`.

## Структура Web Flasher

Все файлы страницы прошивки теперь находятся в папке `firmware/`. Любое изменение внутри этой папки автоматически публикуется на `firmware.fieryledlamp.ru` через GitHub Actions.
