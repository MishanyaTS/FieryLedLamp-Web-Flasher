# Fiery Led Lamp: основной сайт и Web Flasher

Рабочие сайты размещены на HostiMan:

- https://fieryledlamp.ru/ — инструкции, форум, аккаунты и администрирование.
- https://firmware.fieryledlamp.ru/ — Web Flasher для ESP32-S3 N16R8.

## Структура

- `website/public/` — публикуемые HTML, CSS, JavaScript и PHP API основного сайта.
- `firmware/` — Web Flasher, локальные библиотеки и пакет прошивки.
- `website/shared/header/` — единые шаблон шапки, SVG-значки, CSS и JavaScript обоих сайтов.
- `website/shared/page-ui.css` — общие стили верхних блоков и страниц.
- `website/public/header-search.json` — индекс поиска; при сборке копируется на сайт прошивки.
- `scripts/render-header.py` — вставляет общую шапку в HTML, копирует общие ресурсы и обновляет версии CSS/JS по содержимому.
- `scripts/optimize-images.py` — готовит lossless WebP схемы подключения, сохраняя исходный PNG.
- `server/` — схема MySQL, миграции и пример приватной конфигурации PHP.

## Внесение изменений

Шапку и общие стили правьте в `website/shared/`. После изменения выполните:

```sh
python3 scripts/render-header.py
python3 scripts/render-header.py --check
```

Шапка в каждой HTML-странице и копии общих ресурсов — результат сборки. Благодаря этому меню доступно сразу при открытии HTML и не требует дополнительного запроса. Отдельно редактировать эти копии не нужно.

Основные настройки прошивальщика находятся в `firmware/config.js`. Web Flasher получает список выпусков через `firmware/update/versions.php`. Каждая версия хранится в своей папке: `firmware/update/8.0/update.zip`, `firmware/update/8.1/update.zip` и т. д. Для каждой папки рекомендуется свой `manifest.json`; если его нет, используется общий `firmware/update/manifest.json` (адреса разделов должны совпадать). Для переходного периода поддерживается прежний пакет `firmware/update/update.zip`, когда папок с выпусками нет. Версии обнаруживаются автоматически, без ручного редактирования списка, и сортируются от новых к старым. Web Flasher загружает библиотеки и выбранный архив только после запуска прошивки. Алгоритм записи использует KEEP / KEEP / KEEP, аналог DoNotChgBin=ON.

### Как добавить версию в Web Flasher

1. Создайте папку `firmware/update/8.1/` (замените `8.1` нужным номером).
2. Положите туда `update.zip` с `bootloader.bin`, `partitions.bin`, `boot_app0.bin`, `firmware.bin`, `littlefs.bin`.
3. Положите туда соответствующий `manifest.json` с адресами записи (можно скопировать общую версию, если разметка Flash та же).
4. Загрузите папку на HostiMan; после обновления страницы версия автоматически появится в списке. Последняя по номеру версия будет выбрана по умолчанию.

PHP на поддомене прошивальщика необходим для `update/versions.php`. Публикация через GitHub Actions не удаляет дополнительные папки `/update` и `/new_version`, загруженные вручную. Для удаления старой версии удалите её папку самостоятельно.

## Публикация

GitHub Actions публикует изменения ветки `main` двумя независимыми workflow:

- `.github/workflows/deploy-hostiman.yml` — основной сайт; также копирует `firmware/Version.txt` и оптимизирует схему.
- `.github/workflows/deploy-firmware-hostiman.yml` — сайт прошивки.

Изменения в `website/shared/` запускают публикацию обоих сайтов. FTP-параметры берутся из GitHub Secrets. Workflow `Build HostiMan packages` запускается вручную, когда нужны ZIP-пакеты для скачивания.

Настройка аккаунтов и почты описана в `server/REGISTRATION_SETUP.md`. Рабочий `config.php`, базы, сессии, аватары и вложения пользователей не хранятся в репозитории.
