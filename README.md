# FieryLedLamp Web Flasher

Отдельный репозиторий сайта-прошивальщика ESP32-S3 для FieryLedLamp.

После включения GitHub Pages сайт будет доступен по адресу:

https://mishanyats.github.io/FieryLedLamp-Web-Flasher/

## Что где менять

- `firmware/config.js` — название сайта, подписи, скорость 921600 и ссылка на пакет прошивки.
- `firmware/manifest.json` — имена BIN-файлов и адреса записи.
- `firmware/index.html` — структура страницы и тексты.
- `firmware/style.css` — внешний вид.
- `firmware/app.js` — логика Web Serial и esptool-js. В рабочей конфигурации используется KEEP / KEEP / KEEP, аналог DoNotChgBin=ON.
- `.nojekyll` — служебный файл GitHub Pages, не удалять.

## Откуда берётся прошивка

Сайт автоматически получает рабочий пакет по адресу:

`https://raw.githubusercontent.com/MishanyaTS/FieryLedLamp/main/FieryLedLamp/update.zip`

Пользователь сайта ничего не скачивает и не выбирает вручную.

Репозиторий `MishanyaTS/FieryLedLamp` для сайта не изменялся: сайт только читает уже существующий `FieryLedLamp/update.zip`.

Если позже захотите полностью отделить прошивку от основного репозитория, можно положить `update.zip` в этот репозиторий и заменить `firmwareZipUrl` в `firmware/config.js` на `./update.zip`.

## Текущие адреса

- `bootloader.bin` → `0x00000000`
- `partitions.bin` → `0x00008000`
- `boot_app0.bin` → `0x0000E000`
- `firmware.bin` → `0x00010000`
- `littlefs.bin` → `0x00C90000`

Адреса хранятся в `firmware/manifest.json`.

## Структура Web Flasher

Все файлы страницы прошивки теперь находятся в папке `firmware/`. Любое изменение внутри этой папки автоматически публикуется на `firmware.fieryledlamp.ru` через GitHub Actions.
