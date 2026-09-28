# FieryLedLamp Web Flasher

Отдельный репозиторий сайта-прошивальщика ESP32-S3 для FieryLedLamp.

После включения GitHub Pages сайт будет доступен по адресу:

https://mishanyats.github.io/FieryLedLamp-Web-Flasher/

## Что где менять

- `firmware/update.zip` — полный комплект прошивки. Для обновления версии обычно заменяется только этот файл.
- `firmware/manifest.json` — имена BIN-файлов и адреса записи.
- `config.js` — название сайта, подписи, скорость 921600 и путь к ZIP.
- `index.html` — структура страницы и тексты.
- `style.css` — внешний вид.
- `app.js` — логика Web Serial и esptool-js. В рабочей конфигурации используется KEEP / KEEP / KEEP, аналог DoNotChgBin=ON.
- `.nojekyll` — служебный файл GitHub Pages, не удалять.

## Текущие адреса

- bootloader.bin → 0x00000000
- partitions.bin → 0x00008000
- boot_app0.bin → 0x0000E000
- firmware.bin → 0x00010000
- littlefs.bin → 0x00C90000

Сайт загружает `./firmware/update.zip` непосредственно из этого репозитория.

