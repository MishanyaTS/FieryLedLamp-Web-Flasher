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
