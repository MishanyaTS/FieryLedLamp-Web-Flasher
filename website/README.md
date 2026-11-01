# Основной сайт Fiery Led Lamp

Сайт https://fieryledlamp.ru/ работает на HostiMan: статические страницы из `public/`, PHP API `public/api/index.php`, MySQL для аккаунтов, форума и статистики.

Общая шапка и оформление находятся в `shared/`. Перед локальным просмотром после их изменения выполните из корня репозитория:

```sh
python3 scripts/render-header.py
python3 scripts/render-header.py --check
```

Публикацию выполняет `.github/workflows/deploy-hostiman.yml`. Инструкции Cloudflare Workers/D1 и старый Worker удалены: они не используются текущим сайтом.

Настройка PHP, приватного файла конфигурации, MySQL и почты: `server/REGISTRATION_SETUP.md`. API поддерживает PHP mail() и Resend. Аккаунты и страницы администратора используют сессию пользователя; операции изменения проверяют CSRF-токен и права на сервере.

Основная логика интерфейса разделена по страницам:

- `public/site.js` — статистика и кнопка прокрутки вверх.
- `shared/header/header.js` — меню, поиск и состояние входа.
- `public/scripts/account.js` — вход, регистрация, кабинет и почтовая рассылка администратора.
- `public/forum.js` — форум и редактор сообщений.
- `public/scripts/admin-users.js`, `admin-stats.js`, `instruction.js`, `versions.js` — соответствующие страницы.

Перенаправление `discussions.html` оставлено для старых ссылок. Оно ведёт на `forum.html` с сохранением query string и фрагмента; старый `discussions.js` больше не нужен.
