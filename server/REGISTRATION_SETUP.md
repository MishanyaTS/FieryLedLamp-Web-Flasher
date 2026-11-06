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
в нужной базе через phpMyAdmin (включает таблицу закрытых вложений).
Для существующих аккаунтов дополнительно добавьте поле `notify_messages`:
`server/private_message_notifications_migration.sql`. Если MySQL-пользователь
имеет право ALTER TABLE, поле создастся при первом запросе API.
На новой базе оба изменения уже есть в `server/schema.sql`. Не публикуйте конфигурацию и SQL-дампы с
данными пользователей в публичном GitHub.

При развёртывании загрузите на HostiMan новые файлы:
- `website/public/messages.html`, `messages.css`, `messages.js`, `messages-editor.js`, `messages-badge.js`;
- `website/public/api/private_messages.php`;
- обновлённые `api/index.php`, `account.html`, `scripts/account.js`, `forum.html`, `forum.js`.

Переписку на сайте видят только два участника: API проверяет их ID
при чтении, отправке и отметке прочтения. Нужна активная сессия;
для отправки обязателен CSRF-токен, есть лимиты частоты и длины сообщений.
Сообщения хранятся в MySQL без сквозного шифрования. Перед развёртыванием
сделайте резервную копию базы данных и проверьте обмен между двумя
тестовыми аккаунтами.

В личном кабинете уведомления о личных сообщениях включаются отдельно и
по умолчанию выключены. Письма получают только владельцы подтверждённой почты,
не чаще одного уведомления за серию непрочитанных сообщений в переписке.
Текст сообщений в письма не включается.

Вложения доступны только двум участникам через защищённый PHP-маршрут
`pm-file` и сохраняются вне публичного каталога в
`fieryledlamp-private/private_message_files`. Разрешены до пяти файлов на
сообщение, 10 МБ каждый, 30 МБ суммарно. Для таких загрузок на хостинге
проверьте `upload_max_filesize` (не менее 10M), `post_max_size`
(не менее 32M), `max_file_uploads` (не менее 5), расширение PHP Fileinfo
и права записи приватной папки.
