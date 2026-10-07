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


## Доставка уведомлений

Сайт поддерживает:
- e-mail через Resend;
- SMS через SMS.RU.

Секреты и переменные Worker:
- `ADMIN_USER` — логин администратора для запуска рассылки;
- `ADMIN_PASSWORD` — пароль администратора;
- `RESEND_API_KEY` — API key Resend;
- `RESEND_FROM` — отправитель, например `FieryLedLamp <updates@fieryledlamp.ru>`;
- `SMSRU_API_ID` — api_id SMS.RU;
- `SMSRU_FROM` — необязательное согласованное имя отправителя SMS.RU.

Проверка провайдеров:
```
GET /api/admin/providers
```
с HTTP Basic Auth.

Запуск рассылки:
```json
POST /api/admin/notify
{
  "version": "v7.8.2",
  "summary": "Краткое описание обновления",
  "url": "https://firmware.fieryledlamp.ru",
  "email": true,
  "sms": true,
  "dryRun": false
}
```

Для предварительной проверки количества получателей используйте `"dryRun": true`.
Повторный вызов с тем же номером версии не повторяет уже успешно отправленные сообщения.
