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

## Статистика скачиваний версий

В кабинете администратора, на странице «Статистика Fiery Led Lamp», находится таблица «Скачивания прошивки по версиям»: Web Flasher, Автообновление и Всего. Версии из `firmware/update/<версия>/update.zip` и `firmware/new_version/update/<версия>/update.zip` появляются автоматически, даже до первого скачивания. Для действующей OTA-версии в старой структуре `new_version/update/update.zip` номер берётся из `new_version/update/version.txt`.

- **Web Flasher:** `firmware/app.js` отправляет событие `firmware_download` с `item=v:<версия>` после успешной загрузки и проверки архива ZIP. Старые события без номера версии показываются строкой «Ранее · версия неизвестна».
- **OTA:** `https://firmware.fieryledlamp.ru/new_version/ota-download.php?version=8.0` отдаёт тот же бинарный ZIP с заголовком `Content-Length`, а запрос записывается в `analytics_counters` как `firmware_ota_download` и `item=v:8.0`. PHP не сохраняет IP-адрес в записи статистики.
- **Важно:** уже установленные старые прошивки продолжают скачивать статический `new_version/update/update.zip` и не попадают в новый счётчик OTA. Нужно собрать и выпустить обновление с новым `OtaPackageUpdate.ino` (в репозитории `MishanyaTS/FieryLedLamp-Update-`). Историческое количество OTA-загрузок задним числом не восстановить.
- На обеих площадках используется **общая существующая MySQL-база**, новая SQL-миграция не нужна. Ошибка статистики не прерывает загрузку прошивки.
- Считаются обращения к архивам, **не** успешно прошитые платы. Фильтр 7/30/90/365 дней распространяется и на таблицу версий; верхние карточки показывают данные за всё время.
- После публикации проверьте, что `/update/versions.php` отдаёт JSON с `versions` и `otaVersions`, а `/new_version/ota-download.php?version=8.0` отдаёт ZIP с `Content-Length`. Без ручных проверок реальной ESP32-S3 совместимость OTA не считается подтверждённой.

## Публикация

GitHub Actions публикует изменения ветки `main` двумя независимыми workflow:

- `.github/workflows/deploy-hostiman.yml` — основной сайт; также копирует `firmware/Version.txt` и оптимизирует схему.
- `.github/workflows/deploy-firmware-hostiman.yml` — сайт прошивки.

Изменения в `website/shared/` запускают публикацию обоих сайтов. FTP-параметры берутся из GitHub Secrets. Workflow `Build HostiMan packages` запускается вручную, когда нужны ZIP-пакеты для скачивания.

Настройка аккаунтов и почты описана в `server/REGISTRATION_SETUP.md`. Рабочий `config.php`, базы, сессии, аватары и вложения пользователей не хранятся в репозитории.
