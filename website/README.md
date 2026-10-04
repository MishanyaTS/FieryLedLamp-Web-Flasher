# FieryLedLamp Site

Статический сайт для https://fieryledlamp.ru

Deploy command:

```bash
cd website && npx wrangler deploy
```

После первого успешного деплоя подключить Custom Domain `fieryledlamp.ru`.


## Регистрация пользователей

Страница /register.html отправляет данные в /api/register.

Для хранения регистраций используется Cloudflare D1. Создайте базу, например `fieryledlamp-users`, и подключите её к Worker с binding `DB`.

После получения database_id добавьте D1 binding в `wrangler.jsonc`. Таблица `subscribers` создаётся автоматически при первой регистрации.
