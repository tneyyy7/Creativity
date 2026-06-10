# План сквозной проверки сайта + аудит безопасности — Creativity AI

**Дата:** 2026-06-10
**Стек:** React 18 + Vite 5 + Supabase (Postgres+RLS, 6 edge-функций, ~37+ миграций) + Stripe + OneSignal, Cloudflare Pages, i18n (en/ru/it), Sentry, PostHog.
**Прод:** https://thecreativityapp.com · **Supabase ref:** `mutrphgzoczcitnmpxsm`
**Тест-аккаунт:** `ebovsunovsky@gmail.com` (chiiiks) — admin, но **НЕ Pro** (Pro-ветки в рантайме не проверить этим аккаунтом).

> Этот документ — **план**, а не правки. Дополняет [AUDIT_AND_ROADMAP_2026-06-07.md](AUDIT_AND_ROADMAP_2026-06-07.md),
> который закрыл рантайм-краши, мёртвый код, перф и респонсив, но **не делал аудита безопасности**.
> Главная ценность здесь — разделы 1 (безопасность) и 3 (data integrity). Все правки — только после согласования.

---

## ⭐ РЕЗУЛЬТАТЫ ЖИВОГО АУДИТА — 2026-06-10 (read-only прод через Management API)

> Раздел добавлен после фактической проверки прод-БД (`mutrphgzoczcitnmpxsm`): сняты все RLS-политики,
> гранты `anon`/`authenticated`, исходники `SECURITY DEFINER`-функций и триггеры. Ниже — **подтверждённые**
> находки (не гипотезы). RLS включён на **всех** 34 таблицах `public` — это хорошо. Но три политики дырявые.

### 🔴 P0-1 — Любой пользователь может выдать себе Pro (обход оплаты)

**Факт.** На таблице `subscriptions`:
- `INSERT` policy `Allow users to insert own subscription` — `WITH CHECK (auth.uid() = user_id)`
- `UPDATE` policy `Allow users to update own subscription` — `USING (auth.uid() = user_id)`, **без `WITH CHECK`**

Колонки `status`, `plan`, `current_period_end` отдаются клиенту на запись. То есть любой залогиненный
юзер из консоли браузера может:
```js
await supabase.from('subscriptions').upsert({ user_id: MY_ID, status:'active', plan:'pro_yearly',
  current_period_end: '2099-01-01' })
```
→ **бесплатный Pro навсегда.** `is_user_pro()` проверяет ровно `status='active'`. Это полный обход Stripe/Lemon.

**Почему так:** запись в `subscriptions` должна идти **только** от вебхуков (service-role обходит RLS).
У authenticated не должно быть ни INSERT, ни UPDATE на эту таблицу вообще.

### 🔴 P0-2 — Любой пользователь может сделать себя админом

**Факт.** На `profiles` политика `Users can update own profile` — `USING (auth.uid() = id)` для команды `ALL`,
**без ограничения колонок**. Колонка `is_admin` входит в UPDATE-грант для `authenticated`. Триггер
`trg_protect_admin_role_change` блокирует смену **только `admin_role`**, но **не `is_admin`**. А функция
`is_admin()` возвращает `is_admin = true OR admin_role IS NOT NULL`. Значит:
```js
await supabase.from('profiles').update({ is_admin: true }).eq('id', MY_ID)
```
→ **самоназначение админки** (доступ ко всем admin-RLS: чтение `reports`, `admin_actions`, удаление чужих
постов/комментов через `paintings_admin_delete`/`post_comments_admin_delete`, `profiles_admin_update`).
Тем же приёмом можно снять себе `is_banned` (самораз­бан) и накрутить `finished_work_count` (ранги).

### 🔴 P0-3 — Утечка платёжных данных всех пользователей

**Факт.** На `subscriptions` есть политика `Allow public read of subscription status` — `USING (true)`.
Любой (даже аноним с anon-ключом) читает **всю** таблицу, включая `stripe_customer_id`,
`stripe_subscription_id`, `lemon_squeezy_customer_id`, периоды оплаты всех юзеров. Это утечка PII и
идентификаторов платёжных систем.

### 🟠 P1-1 — `onesignal-notify` без проверки секрета (спам/фишинг-вектор)

**Факт.** Функция задеплоена с `--no-verify-jwt` (Supabase не проверяет JWT) и в теле обработчика
(`supabase/functions/onesignal-notify/index.ts:171`) **сразу** парсит `payload` и шлёт пуши через
service-role — **никакой проверки shared-secret/HMAC нет**. Кто угодно, зная URL функции, может слать
произвольные пуш-уведомления любым юзерам (фишинг под видом приложения). Нужен заголовок-секрет
(сверять с env), т.к. вызывает её DB-webhook — секрет можно прописать в самом webhook.

### 🟠 P1-2 — `create_stripe_checkout`: `userId` и `priceId` из тела запроса

**Факт.** (`supabase/functions/create_stripe_checkout/index.ts`) берёт `userId` и `priceId` **из body**,
JWT вызывающего **не проверяет**. Последствия: (а) `priceId` любой — можно подсунуть price на $0/тестовый
и активировать подписку; (б) `userId` чужой — оформить checkout «от чужого имени» (атрибуция metadata).
Поскольку фактическую активацию делает вебхук по подписи — прямой кражи денег нет, но `price_id` нужно
брать из серверного whitelist планов, а `user_id` — из проверенного JWT, не из body.

### 🟡 P2-1 — `SECURITY DEFINER`-функции без `search_path`

**Факт.** `is_user_pro`, `has_role` и одна из перегрузок `is_admin` — `prosecdef=true`, но `proconfig=null`
(нет `SET search_path`). Это классический вектор подмены search_path. `is_group_member`/`is_group_admin`/
вторая `is_admin` уже с `search_path=public` — привести остальные к тому же.

### 🟡 P2-2 — Дубли RLS-политик (тех-долг, не дыра)

Видны парные политики-двойники: `friendships` (по 2 на SELECT/INSERT/DELETE/UPDATE), `paintings`
(`Users can delete own…` ×2, `… view own…` ×2). Не опасно, но мусор — почистить.

---

### ✅ Уже исправлено в этом проходе (безопасные правки, без риска для прода)

| Что | Где | Почему безопасно |
|---|---|---|
| Удалён неиспользуемый `VITE_GEMINI_API_KEY` из `.env`, `.env.local`, `Credentials.env`, `.env.example` | env-файлы | Грепом не используется в `src/`, нет в `dist/`. Ключ всё равно **скомпрометирован** (лежал в публичном `VITE_`-неймспейсе) — **ротировать/удалить в Google Cloud Console.** |
| `.gitignore`: добавлены `/check_*.mjs`, `/test_*.mjs` | `.gitignore:54` | Закрыта дыра — `check_db.mjs` не ловился паттерном `.js`. |
| `check_db.mjs` убран из индекса git (`git rm --cached`) | — | Файл читает `.env` и ходит в прод; не должен быть в репо. |

**Проверка истории git (S2):** `check_db.mjs` фигурирует в коммите `04b43b0`, но как `A check_db.mjs` —
**содержимое `.env`/`Credentials.env` в историю не попадало** (сам скрипт читает `.env` в рантайме, ключей в нём нет).
Отдельных коммитов с `.env`/`Credentials.env` нет. **dist/ чист** — секретов в бандле не найдено. ✅

**Реестр прод-секретов (S4)** — подтверждён `npx supabase secrets list`: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `ONESIGNAL_REST_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_*`, и др. — все
в Supabase Function secrets (не в бандле). `LEMON_SQUEEZY_WEBHOOK_SECRET` в листинге **нет** — проверить,
настроен ли он (иначе `subscription_webhook` принимает события без проверки подписи).

---

### ✅ P0 ПРИМЕНЕНО И ПРОВЕРЕНО НА ПРОДЕ — 2026-06-10

Все три P0 закрыты миграцией [`20260610120000_security_p0_rls_hardening.sql`](supabase/migrations/20260610120000_security_p0_rls_hardening.sql)
(применена на прод через Management API; файл лежит в линейке миграций для repo-of-record):

| Дыра | Что сделано | Проверка живьём |
|---|---|---|
| P0-1 self-grant Pro | Drop INSERT/UPDATE-политик `subscriptions` + `revoke insert,update,delete from authenticated,anon`. Пишет только вебхук (service-role). | Тест-аккаунт: `upsert`/`insert` в `subscriptions` → `permission denied` ✅ |
| P0-2 self-grant admin | Триггер `trg_protect_privileged_profile_fields` пинит `is_admin`/`is_banned`/`is_verified`/`admin_role` к старым значениям для всех, кроме админов и backend (`auth.uid() IS NULL`). | Симуляция не-админ JWT в транзакции: `set is_admin=true`, флип `is_verified` → оба не изменились ✅ |
| P0-3 PII-утечка | Drop политики `Allow public read of subscription status` (`USING(true)`). Pro-косметика чужих юзеров продолжает работать через fallback на `pro_profile_settings` (`core.js:36` уже это умеет). | Тест-аккаунт читает `subscriptions` → видит **только свою** строку ✅ |
| P2-1 search_path | Зафиксирован `search_path=public` у `is_admin()`, `is_user_pro`, `has_role` (функции в RLS). | Гид `npm run audit:rls` зелёный ✅ |

**Регресс-защита:** добавлен `scripts/audit_rls.mjs` (`npm run audit:rls`) + job `rls-guard` в CI —
проверяет 6 инвариантов (RLS включён везде, нет write-грантов на `subscriptions`, нет public-read,
триггер на месте, чувствительные таблицы не world-readable, привилегированные функции с `search_path`).
Падает, если любой инвариант нарушен будущей миграцией.

**Остаточный P2:** ещё ~60 `SECURITY DEFINER`-функций (счётчики, admin-RPC) без `search_path` — массовое
упрочение требует пер-функционального теста (часть зовёт функции расширений без схемы). Не блокирующее.

**Клиентский код (не правил, защищено триггером):** `upsertProfile` (`src/lib/api/profile.js:57`) всё ещё
форвардит `is_verified`/`referral_code`/`referrer_host`, а `App.jsx:264` шлёт `is_verified:false` — теперь
эти записи **молча игнорируются триггером**. Косметическая чистка кода — отдельная мелкая задача.

---

### 🛠️ ИСХОДНЫЙ SQL ДЛЯ P0 (для справки — уже применён, см. выше)

> ⚠️ Файлы в `supabase/migrations/` авто-применяются к проду (Supabase GitHub integration).
> Поэтому SQL ниже **намеренно не положен** в миграции. Применять вручную через SQL-editor после ревью,
> либо я оформлю миграцией по твоей команде. Перед применением — снять бэкап.

```sql
-- P0-1 + P0-3: subscriptions пишутся ТОЛЬКО вебхуками (service-role), читаются только своим владельцем.
drop policy if exists "Allow users to insert own subscription"   on public.subscriptions;
drop policy if exists "Allow users to update own subscription"   on public.subscriptions;
drop policy if exists "Allow public read of subscription status" on public.subscriptions;
-- (остаётся только "Allow users to read own subscription" USING (auth.uid()=user_id))
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- P0-2: запретить authenticated писать привилегированные колонки profiles.
-- Колоночный grant — самый надёжный (RLS WITH CHECK не умеет «нельзя менять эту колонку»).
revoke update on public.profiles from authenticated;
grant update (nickname, avatar_url, bio, is_private, specialization, last_seen, theme,
  active_chat_with_id, active_chat_updated_at, is_onboarding_completed, interests,
  nickname_color, avatar_frame, banner_gradient, social_links, updated_at)
  on public.profiles to authenticated;
-- НЕ выдаём: is_admin, is_banned, admin_role, is_verified, referral_code, referrer_host, finished_work_count
-- (finished_work_count должен меняться только триггерами; verified/admin/ban — только админ-функциями)

-- P2-1: зафиксировать search_path у SECURITY DEFINER функций.
alter function public.is_user_pro(uuid) set search_path = public;
alter function public.has_role(admin_role_type) set search_path = public;
-- (уточнить сигнатуру is_admin() без аргументов: alter function public.is_admin() set search_path=public;)
```

**После SQL обязательно проверить в рантайме тест-аккаунтом**, что легальные сценарии не сломались:
смена ника/аватара/био работает, чтение своей подписки работает, выдача Pro себе — `permission denied`,
`update profiles set is_admin=true` — `permission denied`.

---

## 0. Методология и принципы

- **Доступ:** Supabase CLI залогинен (`npx supabase`, v2.105.0, проект залинкован). Рантайм-проверки — **только локально** (`npm run dev` + тест-аккаунт). Прод активными атаками не трогаем.
- **Принцип №1 (модель угроз Supabase):** фронт ходит в БД с **anon-ключом напрямую**. Это значит: **вся безопасность данных = RLS-политики на стороне БД**. Любая проверка «только в UI» (скрытая кнопка, `if (isAdmin)` в JSX) — **не защита**. Враждебный клиент шлёт запросы в обход UI. Поэтому раздел 1.2 (RLS) — самый важный.
- **Принцип №2:** клиентский бандл публичен. Всё с префиксом `VITE_` видно любому в DevTools → там не должно быть ничего, кроме anon-ключа и публичных URL.
- **Способ проверки RLS:** для каждой таблицы — модель «свой / чужой / аноним»: что видит, что может вставить/обновить/удалить от лица **другого** пользователя.

---

## 1. АУДИТ БЕЗОПАСНОСТИ

### 1.1. Секреты и конфигурация — 🔴 P0

| # | Что проверить | Где | Статус из статики |
|---|---|---|---|
| S1 | `VITE_GEMINI_API_KEY` — префикс `VITE_` ⇒ попадает в публичный бандл. Грепом **не найдено использования** в `src/` и **нет в `dist/`** → вероятно мёртвая переменная. **Решение:** если не используется — удалить из `.env*`. Если используется — Gemini нельзя дёргать с клиента, ключ утечёт; вынести в edge-функцию-прокси. | `.env`, `.env.local`, `Credentials.env`, `.env.example` | подозрение на утечку/мёртвый код |
| S2 | `Credentials.env` лежит в рабочей папке (в `.gitignore` — ок), но это лишний носитель секретов. Проверить, что **не в истории git**: `git log --all --full-history -- Credentials.env .env .env.local`. Если попадал в коммит — ключи считать скомпрометированными, ротировать. | корень | требует проверки истории |
| S3 | Подтвердить, что в `dist/` нет service-role ключа, Stripe secret, OneSignal REST key, webhook-секретов: `grep -rIlE "sk_live\|sk_test\|service_role\|whsec_\|eyJ.*role.*service" dist/`. | `dist/` | требует проверки |
| S4 | Реестр всех секретов прода и где они живут (Supabase Function secrets vs Cloudflare env). Составить таблицу «секрет → место → когда ротирован». Завести план ротации. | — | нет реестра |
| S5 | `.gitignore`: `check_db.mjs` не ловится паттерном `/check_*.js` (расширение `.mjs`). Файл может содержать ключи/connection string — проверить и либо убрать, либо расширить ignore. | `check_db.mjs` | дыра в ignore |

**Команды:**
```bash
git log --all --full-history --oneline -- Credentials.env .env .env.local .env.production
grep -rIlE "sk_live|sk_test_|service_role|whsec_|os_v2|Basic [A-Za-z0-9]" dist/ 2>/dev/null
grep -c GEMINI src -r   # подтвердить, что ключ реально нигде не читается
```

---

### 1.2. RLS-политики (Postgres) — 🔴 P0 — ЯДРО АУДИТА

**Проблема репо:** базовые таблицы (`profiles`, `posts`/`paintings`, `comments`, `likes`, `follows`, `messages`, `conversations`, `stories`, `collections`, `subscriptions`, `notifications`, `pro_profile_settings`…) создаются в `supabase/migrations/legacy/migrations.sql` и разрозненных legacy-файлах, **не в основной линейке миграций**. Поэтому фактическое состояние RLS на проде **обязательно** проверять вживую, а не по репо.

**Известные точки внимания (из кода):**
- `pro_profile_settings` имеет RLS **`USING(true)`** — читается **кем угодно** (`src/lib/api/core.js:38`, коммент в коде). Убедиться, что там нет приватных полей (только косметика: `avatar_frame`, `nickname_color`, `chat_theme`, `cover_url` — это ок, но зафиксировать сознательно).
- `subscriptions` — RLS «только своя строка». Проверить, что чужой пользователь **не** видит чужой `stripe_customer_id`, статус, период.

**Шаг 1 — снять полную карту RLS с прода (read-only):**
```bash
# Получить connection string (Dashboard → Settings → Database) или:
npx supabase db dump --linked --schema public -f /tmp/prod_schema.sql   # схема + политики
# Затем выгрузить матрицу политик напрямую (нужен пароль БД / psql):
```
SQL для инвентаризации (выполнить через psql/SQL-editor, **только SELECT**):
```sql
-- 1. Таблицы БЕЗ включённого RLS (это сразу P0, если в них есть пользовательские данные):
select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false
order by 2;

-- 2. Все политики: таблица, команда, USING, WITH CHECK:
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname='public' order by tablename, cmd;

-- 3. Гранты anon/authenticated на таблицы (нет ли прямых GRANT мимо RLS):
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') order by 2,1;
```

**Шаг 2 — матрица проверки по каждой таблице** (заполнить ✅/❌ по факту):

| Таблица | RLS вкл? | SELECT (свой/чужой/аноним) | INSERT (нельзя от чужого имени?) | UPDATE (только своё?) | DELETE (только своё?) | Утечка PII? |
|---|---|---|---|---|---|---|
| profiles | | публ. профиль ок? приватные поля (email?) скрыты? | | смена своего ника/полей | | email/phone не в публичном select |
| paintings/posts | | | автор = `auth.uid()`? | | | |
| comments | | | | | | |
| likes / reactions | | | нельзя лайкать за другого | | | |
| follows / blocked_users | | | | | | |
| messages | | **только участники диалога**? | | | | текст ЛС не утекает третьим |
| conversations / group_chats / group_members | | | вступление только по приглашению? | | | |
| stories / story_views | | приватность сторис | | | | |
| subscriptions | | **только своя** | webhook-only (нельзя выдать Pro себе)? | | | stripe_customer_id скрыт |
| boost_balance / post_boosts | | | нельзя начислить себе баланс | | | |
| reports | | репорт видит только админ/автор | | | | |
| admin_actions / admin logs | | **только админ** | | | | |
| referral_codes | | | нельзя подделать атрибуцию | | | |
| notifications | | только свои | | | | |
| pro_profile_settings | вкл, USING(true) | публично (косметика) — ОК осознанно | только свой user_id? | | | нет приватных полей |

**Критичные сценарии для ручной проверки (от лица обычного юзера, anon-ключом через curl/JS-консоль):**
1. Прочитать чужие личные сообщения: `supabase.from('messages').select('*')` без фильтра → должно вернуть **только свои**.
2. Выдать себе Pro: `update subscriptions set status='active' where user_id=<свой>` → должно быть **запрещено** (только webhook/service-role).
3. Начислить себе boost-баланс: `update boost_balance ...` → запрещено.
4. Стать админом: `update profiles set is_admin=true, admin_role='superadmin' where id=<свой>` → **запрещено** (это критично — иначе любой self-grant админки).
5. Прочитать чужой `email`/`stripe_customer_id` через `profiles`/`subscriptions`.
6. Удалить/изменить чужой пост, комментарий, лайк.
7. Вступить в закрытую группу: `insert into group_members ...` мимо приглашения.

> Сценарии 2–4 — **самые опасные** (privilege escalation / монетизация в обход оплаты). Их проверяем первыми.

---

### 1.3. Edge-функции — авторизация — 🔴 P0/P1

6 функций. Все с `Access-Control-Allow-Origin: '*'` (см. 1.9).

| Функция | Что делает | Что проверить | Из статики |
|---|---|---|---|
| `admin_delete_user` | hard-delete аккаунта (service-role) | ✅ Проверяет JWT вызывающего + `superadmin` + запрет self-delete. **Хорошо.** Доп.: rate-limit, логирование в `admin_actions`. | выглядит корректно |
| `admin_cancel_subscription` | отмена подписки (service-role) | Подтвердить такую же связку: JWT → admin-роль. Прочитать `index.ts` целиком. | требует ревью |
| `create_stripe_checkout` | создаёт Stripe checkout | Привязывает `user_id` к сессии **по JWT**, а не из тела запроса? Иначе можно оплатить за другого/подменить план/цену. Цена/`price_id` берётся **на сервере**, не из клиента? | 🔴 ревью обязателен |
| `stripe_webhook` | приём событий Stripe | ✅ Проверяет `stripe-signature` через `constructEventAsync`. **Хорошо.** Идемпотентность (повтор события не двоит Pro)? | подпись ок |
| `subscription_webhook` | отдельный вебхук (service-role) | **Кто его вызывает и как аутентифицирует?** Если без подписи/секрета — любой может слать «активируй Pro». 🔴 Критично. | 🔴 ревью обязателен |
| `onesignal-notify` | шлёт пуши (service-role) | Задеплоен с `--no-verify-jwt` (из памяти проекта: webhook без auth-заголовка). **Значит JWT не проверяется Supabase'ом** → внутри функции должна быть проверка **shared-secret** (заголовок/HMAC), иначе любой шлёт пуши всем юзерам (спам/фишинг). 🔴 Проверить наличие секрета. | 🔴 ревью обязателен |

**Действие:** прочитать все 6 `index.ts` целиком, для каждой ответить: (1) кто может вызвать, (2) как доказывает право, (3) что будет при вызове злоумышленником с валидным, но «обычным» JWT, (4) берутся ли важные параметры (price, plan, target user, amount) из тела запроса вместо сервера/JWT.

---

### 1.4. Storage-бакеты — 🟠 P1

Фронт грузит аватары, обложки, картины, сторис, медиа сообщений.
```sql
select id, name, public from storage.buckets;                       -- какие публичные
select * from pg_policies where schemaname='storage';               -- политики на objects
```
Проверить:
- Какие бакеты `public=true`. Публичные = читаемы по прямой ссылке без auth. Медиа **личных сообщений** и приватных сторис **не должны** жить в публичном бакете.
- INSERT-политика: путь файла привязан к `auth.uid()` (нельзя залить в чужую папку/перезаписать чужой аватар).
- Лимиты: max file size, разрешённые MIME-типы (защита от загрузки HTML/SVG с XSS, исполняемых файлов).
- HEIC-конвертация (`heic-to`) — на клиенте; убедиться, что серверная валидация типа тоже есть.

---

### 1.5. Целостность биллинга (Stripe) — 🔴 P0

Деньги → отдельный фокус. Сценарии обхода оплаты:
- Можно ли выставить `subscriptions.status='active'` напрямую (см. 1.2 сценарий 2)?
- `create_stripe_checkout`: подмена `price_id`/суммы из клиента?
- Webhook-идемпотентность: повтор `checkout.session.completed` / `invoice.paid` не должен двоить период/гранты.
- Расхождение состояний: Stripe говорит «отменено», а в БД всё ещё Pro (нет обработки `customer.subscription.deleted` / `invoice.payment_failed`?).
- Reconciliation-скрипт: сверка Stripe ↔ `subscriptions` (раз в сутки) — кандидат в автоматизацию.

---

### 1.6. Аутентификация и сессии — 🟠 P1

- `createClient(url, anon)` без явных опций (`src/lib/api/core.js:10`) → сессия в `localStorage` (дефолт). Подтвердить ожидаемо; для XSS-устойчивости это слабее httpOnly-cookie, но это стандарт Supabase SPA — принять осознанно.
- Supabase Auth settings (Dashboard): подтверждение email включено? Защита от повторной регистрации? Минимальная длина пароля? Leaked-password protection (HIBP)?
- OAuth redirect URLs — whitelist только наши домены (нет open-redirect).
- Срок жизни JWT, refresh-ротация.
- Сброс пароля / смена email — флоу не позволяет угон.
- Rate-limit на login/signup (Supabase Auth настройки).

---

### 1.7. Валидация ввода / XSS / инъекции — 🟠 P1

- ✅ Грепом **нет** `dangerouslySetInnerHTML`/`innerHTML`/`eval` в `src/` — React по умолчанию экранирует. Хорошо.
- Проверить рендер пользовательского контента: `MentionText.jsx`, рендер ника с кастомным цветом/HTML, био, названия работ, сообщения — нет ли мест, где строка вставляется как HTML/URL без санитизации.
- `href` из пользовательских данных (соц-ссылки `socialLinks.js`, link-in-bio): запретить `javascript:`/`data:` схемы.
- SQL-инъекции: при использовании Supabase query-builder — низкий риск; но проверить **RPC-функции** (`SECURITY DEFINER`!) — динамический SQL внутри них опасен. Выгрузить `select proname, prosrc from pg_proc where prosecdef` и отревьюить каждую: нет ли обхода RLS, конкатенации входных строк.
- Загрузка картинок: SVG как аватар = вектор XSS (см. 1.4 MIME-валидация).

---

### 1.8. Админ-панель — авторизация — 🟠 P1

10 экранов (`src/pages/admin/*`). Ключевое: UI-гейтинг (`if (isAdmin)`) — **не защита**.
- Каждое админ-действие должно опираться на **серверную** проверку: RLS на `admin_actions`/таблицах ИЛИ `SECURITY DEFINER`-RPC, проверяющая роль внутри, ИЛИ edge-функция с JWT+role-чеком.
- Проверить admin-RPC (`*_admin_*` функции из миграций phase1–6): внутри есть `if not is_admin(auth.uid()) then raise ...`?
- Разграничение `admin` vs `superadmin` (удаление юзеров/отмена подписок — только superadmin, как в `admin_delete_user`).
- Аудит-лог: все админ-действия пишутся в `admin_actions` (кто, что, когда, над кем).
- Проверить от лица **обычного** юзера: дёрнуть admin-RPC напрямую через консоль → должно быть `403/permission denied`.

---

### 1.9. CORS, заголовки, CSP — 🟡 P2

- Все 5 edge-функций: `Access-Control-Allow-Origin: '*'`. Для функций с JWT-проверкой риск ниже (нужен валидный токен), но для вебхуков и `onesignal-notify` — сузить до наших доменов или полагаться только на secret. Рекомендация: заменить `*` на проверку `Origin ∈ {thecreativityapp.com}` там, где это user-facing.
- Security-заголовки на Cloudflare Pages (`netlify.toml`/`functions/`/`_headers`): добавить `Content-Security-Policy`, `X-Frame-Options: DENY` (анти-clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`. Проверить текущие через `curl -I https://thecreativityapp.com`.
- CSP — самая трудозатратная (надо разрешить Supabase, Stripe, OneSignal, PostHog, Sentry домены). Начать с `Content-Security-Policy-Report-Only`.

---

### 1.10. Зависимости — 🟡 P2

```bash
npm audit --omit=dev            # уязвимости в рантайм-зависимостях
npm outdated
```
- Зафиксировать high/critical, оценить эксплуатируемость (многие — транзитивные dev-only).
- Подключить Dependabot/`npm audit` в CI (уже есть `.github/workflows/ci.yml`).

---

### 1.11. Rate-limiting и злоупотребления — 🟡 P2

- На уровне приложения rate-limit нет; полагаемся на Supabase. Оценить точки абуза: спам постов/комментов/сообщений, массовые подписки, перебор ников (`Onboarding` проверка занятости), реферал-фарм (есть `referral_new_users_only` миграция — проверить, что нельзя накрутить).
- Cloudflare: включить базовый rate-limiting/WAF на edge-функции и auth-эндпоинты.
- Бан/блокировка (`blocked_users`) — на стороне БД, не только UI.

---

## 2. ФУНКЦИОНАЛЬНАЯ QA — сквозной прогон сайта

> Респонсив уже прогнан (см. Этап 3 предыдущего аудита — чисто на 375/768/1280). Здесь фокус на **функциональной логике и состояниях**, а не на вёрстке. Аккаунт `chiiiks` (не Pro!). **Для Pro-веток нужен Pro-аккаунт** — см. «что нужно от тебя».

Прогон каждой страницы по чек-листу: happy path · пустое состояние · состояние ошибки (сеть/403) · загрузка · граничные данные (очень длинный текст, эмодзи, RTL, 0 элементов, 1000 элементов).

| Маршрут | Ключевые проверки логики |
|---|---|
| Auth / Onboarding | регистрация, вход, выход, сброс пароля, занятость ника, дубль-регистрация, OAuth |
| Dashboard | счётчики совпадают с реальностью (см. раздел 3), графики, Pro-аналитика 🔒 |
| Explore (For You / Explore) | infinite-scroll, ранжирование, буст-посты в выдаче, дедуп |
| Gallery / Profile | загрузка работ, HEIC, удаление, редактирование, обложка/баннер (Pro 🔒) |
| PublicProfile | чужой профиль: что видно/скрыто, приватные поля, follow/unfollow |
| Messages | отправка, получение (realtime), вложения, реакции, read-receipts, mute/pin/hide, группы, выбор темы (Pro 🔒), блокировка |
| Friends / Bookmarks | списки, поиск (починен в пред. аудите), пустые состояния |
| Subscription | checkout, возврат после оплаты, статусы, отмена, истёкший период |
| TagPage / Explore by tag | открытие тега, follow тега |
| Stories | создание, просмотр, истечение, кто видел (приватность) |
| Settings | смена данных, язык (en/ru/it), тема, уведомления, удаление аккаунта |
| Ranks / Productivity | формулы рангов, прогресс |
| Admin/* (10) | каждое действие + проверка, что обычный юзер их не может (см. 1.8) |
| Referrals | атрибуция, защита от накрутки, начисление |
| Push (OneSignal) | подписка на пуш, доставка, отписка (не трогать SW-scope!) |
| i18n | все 3 языка: нет пропущенных ключей, нет дублей (часть починена), длина строк не ломает вёрстку |
| Deep links / OG | `/post/:id`, `/u/:nickname` открываются, OG-теги генерятся (Cloudflare Function) |
| 404 / ошибки | несуществующий маршрут, удалённый пост, приватный контент |

---

## 3. Целостность данных — 🟠 P1

- **Денормализованные счётчики** (likes_count, comments_count, followers_count, finished_work_count) — есть `phase1_denormalized_counters.sql` + триггеры (`setup_triggers.sql`). Проверить расхождения: `select id, likes_count, (select count(*) from likes where ...) ...`. Дрейф счётчиков — частый баг.
- **Каскады удаления:** удалили пост → удалились его лайки/комменты/буст? Удалили юзера (`ON DELETE CASCADE` на `auth.users`) → всё подчистилось, не осталось «битых» FK/сирот?
- **Realtime-подписки** (Messages): нет ли утечки чужих событий через неправильный фильтр канала.
- **Группы:** удаление участника/группы — консистентность.

---

## 4. Производительность — 🟡 P2 (из пред. аудита, не повторяю детально)

`charts-vendor` 518КБ и `index` 455КБ — кандидаты на `React.lazy`. N+1 запросы при загрузке лент (проверить, что `enrichProfilesWithProData` батчит — судя по `.in(...)`, да). Индексы под частые фильтры RLS (`auth.uid()` по `user_id`).

---

## 5. Автоматизация / CI — что предлагаю

- **CI уже есть** (`.github/workflows/ci.yml`: lint+test+build). Добавить: `npm audit` gate, проверка «нет секретов в dist».
- **Playwright + матрица вьюпортов** — заменит ручной прогон разделов 2 (smoke E2E happy-path на ключевых маршрутах).
- **Скрипт-аудитор RLS** (`scripts/audit_rls.sql` + раннер): прогоняет сценарии 1.2 от лица «обычного» JWT и фейлит, если что-то лишнее доступно. Регресс-защита от privilege escalation.
- **Reconciliation Stripe ↔ subscriptions** (раздел 1.5) — крон раз в сутки.
- **Secret-scanning** в pre-commit (gitleaks/trufflehog) — чтобы ключи не попадали в коммиты впредь.
- **Dependabot** — авто-PR на уязвимые зависимости.

---

## 6. Приоритетный порядок исполнения

1. **1.1 секреты** (S1–S5) — быстро, дёшево, высокий риск. Особенно: история git на утечку, судьба `VITE_GEMINI_API_KEY`.
2. **1.2 RLS — сценарии 2,3,4** (privilege escalation / self-grant Pro/admin) — самое опасное.
3. **1.3/1.5 edge-функции биллинга + `onesignal-notify` secret** — деньги и спам-вектор.
4. **1.2 полная матрица RLS** + **1.4 storage**.
5. **1.7/1.8** XSS-санитизация + админ-RPC role-чеки.
6. **3** целостность данных (счётчики, каскады).
7. **1.9/1.6** заголовки/CSP/auth-настройки.
8. **2** функциональный прогон (с Pro-аккаунтом).
9. **1.10/1.11/4** зависимости, rate-limit, перф.
10. **5** автоматизация (CI gates, Playwright, RLS-регресс).

---

## 7. Открытые вопросы / что нужно от тебя

- **Pro-аккаунт** для проверки Pro-веток (темы чата, обложка, аналитика, бусты) — `chiiiks` не Pro. Без него раздел 2 (Pro) и часть 1.5 непроверяемы в рантайме.
- **Пароль БД** (Dashboard → Settings → Database) или подтверждение, что можно через `npx supabase db dump --linked` — для выгрузки реальных RLS-политик (раздел 1.2 шаг 1).
- Подтвердить, где живут прод-секреты edge-функций (Supabase Function secrets) — для реестра S4.
- Разрешение на `npm audit fix` / обновление зависимостей (может задеть сборку).
