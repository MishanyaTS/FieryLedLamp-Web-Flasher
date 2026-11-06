# Регистрация FieryLedLamp

1. Создать MySQL базу в HostiMan.
2. Импортировать server/schema.sql.
3. Создать каталог /www/fieryledlamp-private/.
4. Скопировать server/config.php.example в /www/fieryledlamp-private/config.php и заполнить параметры.
5. Для Resend указать API key. Если хотите использовать PHP mail(), установите mail_provider = mail.
6. Зарегистрировать свой аккаунт, подтвердить e-mail и сделать его администратором SQL-командой:

UPDATE users SET is_admin = 1 WHERE email = 'ВАШ_EMAIL';

Страницы:
- /register.html
- /login.html
- /account.html
- /forgot-password.html
- /admin-notifications.html

## Личные сообщения

Для существующей базы: новые таблицы создаются автоматически при первом обращении
авторизованного пользователя, если у пользователя MySQL есть права CREATE TABLE.
Если таких прав нет, заранее выполните `server/private_messages_migration.sql`
в нужной базе через phpMyAdmin. Не публикуйте конфигурацию и SQL-дампы с
данными пользователей в публичном GitHub.

При развёртывании загрузите на HostiMan новые файлы:
- `website/public/messages.html`, `messages.css`, `messages.js`, `messages-badge.js`;
- `website/public/api/private_messages.php`;
- обновлённые `api/index.php`, `account.html`, `forum.html`, `forum.js`.

Переписку на сайте видят только два участника: API проверяет их ID
при чтении, отправке и отметке прочтения. Нужна активная сессия;
для отправки обязателен CSRF-токен, есть лимиты частоты и длины сообщений.
Сообщения хранятся в MySQL без сквозного шифрования. Перед развёртыванием
сделайте резервную копию базы данных и проверьте обмен между двумя
тестовыми аккаунтами.
