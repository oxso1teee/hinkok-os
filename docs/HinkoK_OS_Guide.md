# Как собрать личную «операционную систему для жизни» на AI

Полный технический гайд: AI-native личный дашборд, куда ты кидаешь мысли текстом/голосом/фото в Telegram, а система сама понимает, что это, и раскладывает по задачам, дневнику, питанию, календарю и базе знаний. Плюс «спроси свою жизнь» — семантический поиск по всем твоим записям.

> ⚠️ Это инструкция по архитектуре. Все ключи, токены и личные данные — только в твоём `.env.local`, **никогда не коммить значения секретов**. Ниже перечислены только **имена** переменных.

---

## 1. Что ты строишь

**Одна точка входа → AI-маршрутизация → second brain с поиском по смыслу.**

- Пишешь/говоришь/фоткаешь в Telegram-бота (или прямо на сайте).
- LLM классифицирует: задача / событие / заметка / идея / решение / дневник / контент / человек / приём еды.
- Запись уходит в нужное место (задача в канбан, событие в календарь, еда в питание с подсчётом калорий, остальное — заметка).
- Каждая запись эмбеддится в векторную базу → потом можно задавать вопросы своей жизни на естественном языке с ссылками на источники.

Дашборд — это витрина. Реальная ценность — в базе данных с памятью.

---

## 2. Стек (точные версии на момент сборки)

| Слой | Технология |
|---|---|
| Фреймворк | **Next.js 16.2.6** (App Router) + **React 19.2.4** + **TypeScript 5** |
| Стили | **Tailwind CSS 4** + кастомные CSS-переменные (дизайн-токены) |
| База + вектор | **Supabase** (Postgres + расширение **pgvector**) |
| Основной LLM | **Anthropic Claude** (через `@anthropic-ai/sdk` ^0.98) — Sonnet для качества, Haiku для скорости |
| Вспомогательный LLM | **OpenAI** (через `openai` ^6.39) — Whisper (голос→текст), embeddings, fallback-классификатор |
| Бот | **Telegram Bot API** (webhook) |
| Заметки | **Obsidian-волт в приватном GitHub-репо** (читаем через GitHub API) |
| Календарь/финансы | **Google Calendar + Google Sheets** (`googleapis`), iCal (`ical.js`) |
| Здоровье | **Apple Health → iOS Shortcuts → HTTP endpoint** |
| Хостинг + крон | **Vercel** (cron jobs) |

> Прим.: Next.js 16 использует `proxy.ts` вместо `middleware.ts` — это новая конвенция, важно для auth-гейта.

---

## 3. Аккаунты и заготовки (что завести заранее)

1. **Supabase** проект (бесплатного тира хватает на старт). Включить расширение `vector`.
2. **Anthropic API** ключ.
3. **OpenAI API** ключ (для Whisper + embeddings).
4. **Telegram-бот** через @BotFather (получишь токен).
5. **Приватный GitHub-репо** под Obsidian-волт + плагин Obsidian Git (синкает заметки в репо). GitHub Personal Access Token на чтение репо.
6. **Google Cloud** сервис-аккаунт с доступом к Calendar/Sheets (по желанию).
7. **Vercel** проект, подключённый к твоему репозиторию.

---

## 4. Переменные окружения (только ИМЕНА — значения держи в секрете)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY        # сервер-онли, обходит RLS, НИКОГДА на клиент

# Anthropic
ANTHROPIC_API_KEY
ANTHROPIC_MODEL                  # напр. claude-sonnet-4-6
ANTHROPIC_FAST_MODEL             # напр. claude-haiku-4-5

# OpenAI
OPENAI_API_KEY
OPENAI_CLASSIFIER_MODEL          # fallback-классификатор
OPENAI_TRANSCRIBE_MODEL          # whisper-1
OPENAI_EMBEDDING_MODEL           # text-embedding-3-small (1536 dims)

# Auth (сгенерируй случайные длинные строки)
AUTH_SECRET                      # ключ подписи HMAC-куки сессии
DASHBOARD_PASSWORD               # пароль входа в дашборд
API_SECRET                       # для программного доступа (header x-api-secret)

# Telegram
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET          # проверка, что webhook дёргает именно Telegram
TELEGRAM_USER_ID                 # твой numeric id — бот отвечает только тебе

# Google (опционально)
GOOGLE_CALENDAR_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_KEY
GOOGLE_SHEETS_FINANCE_ID

# Obsidian (через GitHub)
GITHUB_TOKEN
OBSIDIAN_REPO                    # owner/repo
OBSIDIAN_BRANCH                  # обычно main
OBSIDIAN_VAULT_NAME

# Cron
CRON_SECRET                      # Bearer для защиты cron-эндпоинтов

# Идентичность (single-user)
USER_ID                          # любая строка, ей помечаются все твои строки в БД
USER_TIMEZONE                    # IANA, напр. Europe/Copenhagen
```

**Single-user дизайн:** все строки в БД помечаются одним `USER_ID`. Схема многопользовательская, рантайм — на одного. Это сильно упрощает авторизацию.

---

## 5. Схема базы данных (полный SQL, обобщённый)

```sql
create extension if not exists vector;

-- Люди / организации / проекты / темы, на которые ссылаются записи
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  name       text not null,
  kind       text not null default 'person',   -- person | org | project | topic
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Каждый захват (текст/голос/фото). Канонический источник правды.
create table if not exists raw_captures (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  source         text not null default 'web',   -- telegram | web | api
  raw_text       text not null,
  audio_url      text,
  classification jsonb not null default '{}'::jsonb,
  llm_source     text,                            -- anthropic | openai | regex
  routed_to      text,                            -- tasks | raw_captures
  routed_id      uuid,
  created_at     timestamptz not null default now()
);
create index if not exists raw_captures_kind_idx on raw_captures ((classification->>'kind'));

-- Операционные задачи (канбан CRM)
create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  title             text not null,
  description       text,
  urgency           text not null default 'this_week'
                      check (urgency in ('today','tomorrow','this_week','next_week','this_month','someday')),
  category          text not null default 'personal'
                      check (category in ('work','content','health','finance','personal')),
  sphere            text check (sphere is null or sphere in (
                      'work','finance','health','relationships','growth',
                      'mind','personal','content','spirituality')),
  key               boolean not null default false,
  priority_score    double precision not null default 0,
  time_estimate_min integer,
  tags              text[] not null default '{}',
  due_date          date,
  owner             text,
  entity_id         uuid references entities(id) on delete set null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Одна строка на (user, день). notes — JSONB: привычки, питание, цели, активность, дневник.
create table if not exists daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  log_date   date not null,
  notes      jsonb not null default '{}'::jsonb,
  mood       text,                               -- "1".."5"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- Векторная память для «спроси свою жизнь»
create table if not exists memory_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  source_type text not null,                     -- capture | task | journal | meal | obsidian ...
  source_id   uuid,
  text        text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index if not exists memory_chunks_embedding_idx
  on memory_chunks using hnsw (embedding vector_cosine_ops);

-- Неизменяемый журнал действий
create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  action        text not null,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Брутфорс-защита логина и rate-limit
create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text, ok boolean, created_at timestamptz not null default now()
);
create table if not exists rate_limit (
  id bigint generated always as identity primary key,
  bucket text not null, created_at timestamptz not null default now()
);
create table if not exists kv_cache (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);

-- RAG: поиск ближайших по косинусу
create or replace function match_memory_chunks(
  query_embedding vector(1536), match_count int default 20, filter_user_id text default null
) returns table (id uuid, user_id text, source_type text, source_id uuid, text text, created_at timestamptz, similarity float)
language sql stable as $$
  select mc.id, mc.user_id, mc.source_type, mc.source_id, mc.text, mc.created_at,
         1 - (mc.embedding <=> query_embedding) as similarity
  from memory_chunks mc
  where mc.embedding is not null and (filter_user_id is null or mc.user_id = filter_user_id)
  order by mc.embedding <=> query_embedding limit match_count;
$$;

-- RLS: включить на ВСЕХ таблицах БЕЗ политик = deny-all для anon/auth ключей.
-- Сервер ходит service-role ключом (обходит RLS). Это и есть защита данных.
alter table entities      enable row level security;
alter table raw_captures  enable row level security;
alter table tasks         enable row level security;
alter table daily_logs    enable row level security;
alter table memory_chunks enable row level security;
alter table audit_log     enable row level security;
alter table login_attempts enable row level security;
alter table rate_limit    enable row level security;
alter table kv_cache      enable row level security;
```

**JSONB-форма `daily_logs.notes`:**
```jsonc
{
  "habits": { "habitId": count },
  "habit_subtasks": { "habitId": [true, false] },
  "nutrition": { "meals": [{ "id","t":"HH:MM","n":"название","kcal","p","c","f","estimated":true }] },
  "goals_week_items": [{ "id","text","done" }],
  "goals_month_items": [{ "id","text","done" }],
  "journal": { "entries": [{ "id","t","text","source" }], "summary": "…" },
  "activity": { "source","recorded_at","sleep_minutes","sleep_score","steps","kcal_active",
                "minutes_active","resting_hr","hrv","vo2_max","weight_kg" }
}
```

---

## 6. Пайплайн захвата (сердце системы)

```
текст/голос/фото  →  (голос: Whisper → текст; фото: Claude Vision → описание)
                  →  классификатор (Claude → fallback OpenAI → fallback regex)
                  →  маршрутизация по kind:
                        task    → таблица tasks (+ приоритет по urgency/key)
                        event   → Google Calendar
                        meal    → daily_logs.notes.nutrition (+ оценка калорий/макросов)
                        journal → daily_logs.notes.journal (+ авто-саммари)
                        прочее  → raw_captures как заметка
                  →  эмбеддинг записи в memory_chunks (pgvector)
                  →  запись в audit_log
```

**Тройной фолбэк классификатора** = надёжность: даже если обе нейросети недоступны, regex-эвристика всё равно разложит запись. Источник классификации сохраняется (`anthropic`/`openai`/`regex`).

### Системный промпт классификатора (можно брать как есть)

System:
```
You are a precise capture classifier. Output strict JSON only, no prose.
```

User (шаблон, подставляешь текущее время, текст и список известных сущностей):
```
Classify this captured note into structured fields.

CURRENT TIME: <ISO-8601 с офсетом> (timezone <твой TZ>)

CAPTURE:
"""
<текст пользователя>
"""

KNOWN ENTITIES (people / orgs / projects). Use an id ONLY if the capture
clearly refers to one of them; otherwise use null:
<список "id :: имя", или (none)>

Return JSON only with exactly this shape:
{
  "kind": one of ["task","event","note","idea","decision","journal","content","person","meal"],
  "title": a short title, max 80 chars,
  "summary": one short sentence,
  "urgency": one of ["today","tomorrow","this_week","next_week","this_month","someday"] (for non-tasks use "someday"),
  "sphere": one of ["work","finance","health","relationships","growth","mind","personal","content","spirituality"] — the life sphere this belongs to. "work" = business/clients/admin, "finance" = money/tax/investing, "health" = fitness/food/sleep/body, "relationships" = family/friends/partner, "growth" = learning/skills/career, "mind" = focus/emotions/psychology, "personal" = errands/home/hobbies, "content" = videos/scripts/social media, "spirituality" = meaning/purpose/values,
  "key": boolean — true only if clearly high-leverage or a blocker,
  "tags": array of 1-4 short lowercase tags,
  "entity_id": an id from the list above, or null,
  "time_estimate_min": integer minutes if it is a task with an obvious size, else null,
  "event_start": if a scheduled event at a specific date+time, ISO 8601 WITH timezone offset resolved against CURRENT TIME; else null,
  "event_end": ISO 8601 with offset if a duration/end is stated; else null
}

If the capture describes a calendar event at a specific time, set "kind" to "event"
and fill "event_start"/"event_end".
If the capture describes food/a meal, set "kind" to "meal", "sphere" to "health",
and name the dish(es) in the title.
```

**Важно — нормализация выхода:** никогда не доверяй модели вслепую. После ответа прогоняй через валидацию: `kind/urgency/sphere` сверяй с allow-списками, `entity_id` принимай только если он реально есть в твоей таблице (защита от галлюцинаций), `tags` — обрезай до 4, `title` — до 80 символов. Невалидное → дефолт (`note`/`someday`/`personal`).

---

## 7. Маппинг папок Obsidian → сферы

Заметки из волта раскладываются по тем же 9 сферам. Сделай свою таблицу «название папки (lowercase) → сфера», например:

```
"клиенты"/"бизнес"     → work
"видео"/"ютуб"/"сценарии" → content
"тренировки"/"еда"     → health
"исследования"/"книги" → growth
"сессии"/"рефлексия"   → mind
"trash"                → пропустить (null)
```
Что не в таблице — падает в `personal`. Когда бот пишет новую заметку в волт, выбор папки делает быстрый LLM (Haiku): если текст сам называет папку — берём её, иначе модель выбирает из реального списка папок (с фолбэком в `Inbox`).

---

## 8. Интеграции — кратко

- **Supabase + pgvector:** включи `vector`, создай таблицы (раздел 5). Сервер ходит **service-role** ключом (минует RLS). RLS включён везде без политик → anon-ключ не достанет ничего.
- **Telegram-бот:** один webhook-эндпоинт. Проверяй заголовок `x-telegram-bot-api-secret-token` (constant-time сравнение). Голос → скачиваешь файл → Whisper. Фото → Claude Vision (промпт: «опиши блюдо и прикинь калории»). Inline-кнопки для смены срочности задачи.
- **Anthropic/OpenAI:** клиенты с таймаутом ~45с и 2 ретраями. Цепочка фолбэков (раздел 6). Для коротких промптов prompt caching смысла не даёт.
- **Obsidian через GitHub:** читаешь дерево репо через GitHub API; кэшируешь снапшот в `kv_cache` по **tree-SHA** (холодный старт не делает лишних запросов, если волт не менялся). Инкрементальный синк в память — переэмбеддишь только заметки с изменившимся blob-SHA.
- **Google Calendar/Sheets:** сервис-аккаунт (JWT). Календарь читаешь на 14 дней вперёд, события создаёшь через API.
- **Apple Health → iOS Shortcuts:** ярлык собирает за день (шаги, активные ккал, пульс покоя, HRV, сон, вес) и шлёт `POST` на твой `/api/health/activity` с заголовком `x-api-secret`. На сервере — валидация диапазонов и upsert в `daily_logs.notes.activity` (повторный запуск за день перезаписывает, без задвоений).
- **Vercel cron** (`vercel.json`):
  ```json
  { "crons": [
    { "path": "/api/memory/sync-obsidian", "schedule": "0 3 * * *" },
    { "path": "/api/insights/weekly",      "schedule": "0 9 * * 0" }
  ]}
  ```
  Cron-эндпоинты защищены `CRON_SECRET` (Bearer, constant-time).

---

## 9. Авторизация и безопасность

- **Гейт на всё** (`proxy.ts`): без валидной сессии или `x-api-secret` → 401 / редирект на /login. Fail-closed.
- **Сессия:** HMAC-подписанная кука (`AUTH_SECRET`), httpOnly, secure в проде, проверка constant-time.
- **Логин:** один пароль (`DASHBOARD_PASSWORD`), брутфорс-троттлинг по IP (например, 8 попыток / 15 мин) + фиксированная задержка на неверный пароль.
- **Webhook/cron:** свои секреты, всегда constant-time сравнение.
- **БД:** RLS deny-all на всех таблицах; service-role ключ только на сервере, никогда в клиентский бандл.
- **Заголовки** (next.config): CSP (`frame-ancestors 'none'`, `object-src 'none'`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS.
- **Rate-limit** бота/захвата через таблицу `rate_limit` (fixed-window).

---

## 10. Порядок сборки (по шагам)

1. **Дизайн → код.** Сначала нарисуй дашборд (можно в Claude/GPT — обе умеют генерить UI), добейся картинки, которая нравится. Потом отдай её в Claude Code и преврати в рабочий Next.js-сайт.
2. **База.** Создай Supabase-проект, выполни SQL из раздела 5.
3. **Память.** Подключи Supabase service-role на сервере, напиши `db()` клиент. Проверь, что записи пишутся под `USER_ID`.
4. **Бот.** Подними Telegram webhook, проверь секрет, прогони текст через классификатор → запись в БД.
5. **Голос/фото.** Whisper для голосовых, Vision для фото.
6. **Маршрутизация.** Реализуй ветки task/event/meal/journal/note, эмбеддинг в `memory_chunks`, запись в `audit_log`.
7. **Вкладки по одной.** HOME (захват, привычки, питание, цели) → CRM (канбан) → BRAIN (9 сфер + брифинги) → JOURNAL (настроение, дневник) → HEALTH (кольца, недельные графики).
8. **Календарь / здоровье / Obsidian** — по очереди.
9. **«Спроси свою жизнь»:** эмбеддишь запрос → `match_memory_chunks` → Claude отвечает по найденному контексту с ссылками `[ref]` на источники.
10. **Деплой на Vercel**, добавь cron, прогони все секреты в env проекта.

> Реалистично: CRM (drag-and-drop + оптимистичные апдейты) — самая «гемор» часть, заложи время на отладку. У тебя нет команды инженеров — зато инструмент собран ровно под тебя.

---

## 11. Сколько стоит

- **Supabase** и **Vercel** на старте — бесплатные тиры, хватает пока проект маленький.
- **LLM по API** — pay-as-you-go: платишь только за реальные вызовы (классификация, vision, embeddings, ответы). За обычный день выходят копейки. Это не подписка.
- Для пользователей из РФ/СНГ: оплата зарубежных API решается отдельно (виртуальные карты / посредники) — учитывай.

---

## 12. Что кастомизировать под себя

- 9 сфер жизни и их определения в промпте.
- Список привычек, цели по КБЖУ, маппинг папок Obsidian.
- Дизайн-токены (палитра, шрифты).
- Модели Claude/OpenAI (баланс цена/качество).

---

Это первая версия — базовые вещи работают надёжно, остальное допиливается по ходу. Логичный следующий шаг — связать с «вторым мозгом» на Obsidian и копить данные: чем дольше ведёшь, тем полезнее становятся брифинги и «спроси свою жизнь».
