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

### Как разместить версии на HostiMan

Все прошивки используют один каталог `https://firmware.fieryledlamp.ru/update/`:

```text
update/
  version.txt             # номер самой новой версии и история изменений для OTA
  versions.php            # список версий для Web Flasher и статистики
  download.php            # выдача OTA ZIP + счётчик загрузок
  manifest.json           # запасной манифест для Web Flasher
  8.0/
    manifest.json
    update.zip
  8.1/
    manifest.json
    update.zip
```

Новая версия появляется автоматически при размещении `update/<номер>/update.zip`. Для Web Flasher рядом желательно разместить соответствующий `manifest.json`: внутри ZIP должны находиться файлы с именами из `manifest.json`, иначе запись не начнётся. При отсутствии локального манифеста используется корневой, предназначенный для обычных `bootloader.bin`, `partitions.bin`, `boot_app0.bin`, `firmware.bin`, `littlefs.bin`.

Для OTA тот **же самый** ZIP должен быть создан без сжатия файлов (ZIP method = STORE) и без data descriptor; внутри должны присутствовать `firmware.bin` (или `FieryLedLamp.ino.bin`) и `littlefs.bin` (или `FieryLedLamp.littlefs.bin`). Номер **самого нового** выпуска также нужно изменить в `update/version.txt`. Прямая публикация ZIP и актуализация version.txt выполняются отдельно: новая папка не меняет текущую версию OTA автоматически.

**GitHub — единственный источник файлов обоих сайтов.** При каждой публикации применяется полная синхронизация: все отсутствующие в GitHub файлы, папки и ZIP-архивы удаляются с HostiMan, в том числе внутри `/update` и `/new_version`. Архивы выпусков обязательно нужно хранить в `firmware/update/<версия>/update.zip` в GitHub, а не загружать только на сервер: такие архивы будут удалены на следующем деплое. Единственные исключения — служебная `.well-known` и серверный `.htaccess` для SSL и конфигурации веб-сервера.

## Статистика скачиваний

Страница администратора `/admin-stats.html` показывает скачивания выбранной версии за 7, 30, 90 или 365 дней: отдельно Web Flasher, отдельно автообновление и их сумму. Список версий автоматически читается из `update/versions.php`. Старые события без номера версии отображаются отдельно.

- **Web Flasher:** после скачивания и проверки архива `app.js` отправляет `firmware_download`, `item=v:8.0`, на `track.php`.
- **Автообновление:** прошивка читает номер из `update/version.txt` и запрашивает `https://firmware.fieryledlamp.ru/update/download.php?version=8.0`. PHP отдаёт содержимое физического `update/8.0/update.zip` с `Content-Length`, записывая `firmware_ota_download`, `item=v:8.0` в общую базу MySQL.
- Старые установленные версии, обращающиеся напрямую к `/new_version/update/update.zip` или `/update/<версия>/update.zip`, не увеличивают счётчик OTA. Чтобы они обновлялись после переноса архивов, старые URL необходимо временно сохранять доступными или настроить совместимое перенаправление на сервере.
- Показатели учитывают запросы на скачивание ZIP, **не** успешную установку прошивки. Старую историю OTA-загрузок нельзя восстановить из новых счётчиков.
- Все общие карточки статистики учитывают выбранный период. Данные об IP-адресе не сохраняются в событии OTA; ошибки записи статистики не блокируют прошивку.

Проверяйте PHP и скачивание в рабочем окружении HostiMan до переноса публичных пользователей. Через загрузку бинарного ZIP необходимо убедиться, что сервер отправляет корректный `Content-Length` и не применяет HTTP-сжатие.

## Публикация

GitHub Actions публикует изменения ветки `main` двумя независимыми workflow:

- `.github/workflows/deploy-hostiman.yml` — основной сайт; также копирует `firmware/Version.txt` и оптимизирует схему.
- `.github/workflows/deploy-firmware-hostiman.yml` — сайт прошивки.

Изменения в `website/shared/` запускают публикацию обоих сайтов. FTP-параметры берутся из GitHub Secrets. Обе публикации не прерывают текущую FTP-передачу новым запуском, чтобы избежать частично загруженных файлов. На обоих сайтах служебные файлы `.well-known` и `.htaccess` сохраняются для работы SSL и веб-сервера. Остальные файлы синхронизируются строго через `lftp mirror --reverse --delete`; прежний служебный `.fiery-firmware-deployed-sha` тоже будет удалён, поскольку он больше не нужен. Workflow `Build HostiMan packages` запускается вручную, когда нужны ZIP-пакеты для скачивания.

Настройка аккаунтов и почты описана в `server/REGISTRATION_SETUP.md`. Рабочий `config.php`, базы, сессии, аватары и вложения пользователей не хранятся в репозитории.

## Предпросмотр перед публикацией на HostiMan

Изменения в ветке `main` автоматически собираются **только для GitHub Pages**. Публикация на HostiMan при `push` отключена и запускается отдельно вручную.

**Однократное включение предпросмотра:** откройте [Settings → Pages](https://github.com/MishanyaTS/FieryLedLamp-Web-Flasher/settings/pages), в разделе **Build and deployment → Source** выберите **GitHub Actions**. Это действие выполняется владельцем репозитория; обычный `GITHUB_TOKEN` не может впервые включить Pages. После включения перейдите в [Actions → Preview sites on GitHub Pages](https://github.com/MishanyaTS/FieryLedLamp-Web-Flasher/actions/workflows/preview-github-pages.yml) и нажмите **Run workflow** один раз.

Предварительный просмотр после успешной сборки:

- Основной сайт: https://mishanyats.github.io/FieryLedLamp-Web-Flasher/
- Web Flasher: https://mishanyats.github.io/FieryLedLamp-Web-Flasher/firmware/

GitHub Pages не поддерживает PHP. В предварительном просмотре можно проверять внешний вид, переходы между статическими страницами, поиск и список версий; аккаунты, форум, серверная статистика, подключение COM-порта и прошивка отключены. Баннер сообщает, что открыта тестовая версия. В тестовую сборку не копируются архивы прошивки, скачиваемые приложения и серверные PHP-скрипты. `scripts/build-preview.py` изменяет только временную папку `.preview-pages`, не затрагивая рабочие файлы сайта.

После проверки запустите только нужный ручной Action:

- [Deploy website to HostiMan](https://github.com/MishanyaTS/FieryLedLamp-Web-Flasher/actions/workflows/deploy-hostiman.yml)
- [Deploy firmware site to HostiMan](https://github.com/MishanyaTS/FieryLedLamp-Web-Flasher/actions/workflows/deploy-firmware-hostiman.yml)
