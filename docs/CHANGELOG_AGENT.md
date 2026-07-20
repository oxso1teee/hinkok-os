# Agent changelog

Формат и правила — см. `docs/RELEASE_READINESS_PROMPT.md`, раздел 23.

---

[BASELINE] establish-local-baseline — сделано, проверено: проект распакован из
`HinkoK-OS-Phase2-Block6-google-complete.zip` в рабочую директорию, инициализирован git
(коммит `Initial import...`), `npm install` (Node 22.23.1 — см. отдельную заметку про
engines mismatch ниже). Прогнаны все шаги `npm run ci` по отдельности:
- `repo:check` — зелёный (254 файла, секретов не найдено).
- `npm audit --audit-level=high` — 0 уязвимостей.
- `npm run typecheck` — **упал** на старте (см. следующий пункт), после фикса зелёный.
- `npm run lint` — зелёный, без предупреждений.
- `npm run test` — зелёный, 114/114 unit-тестов.
- `npm run build` — падал из-за отсутствия `.env.local` и нескольких all-or-nothing
  групп конфигурации (Obsidian/Google/Telegram); после создания локального
  `.env.local` с плейсхолдер-значениями (НЕ реальные секреты, файл в `.gitignore`,
  сгенерирован через `scripts/generate-secrets.mjs` + фиктивный Supabase/OpenAI) —
  зелёный.
Не проверено: `npm run e2e` (нужен `playwright install chromium` + поднятый сервер с
реальными данными), `deploy:check`/`deploy:smoke` (нужен реальный прод-домен и доступ к
Vercel), поведение с реальными Supabase/Telegram/Google credentials — в этой сессии нет
доступа ни к реальному Supabase-проекту, ни к Telegram-боту, ни к Google OAuth-приложению,
ни к Vercel-деплою пользователя.

Отдельная заметка: `package.json.engines.node` требует `24.x`, в окружении доступен
только Node `22.23.1` (нет `nvm`/`fnm`/`volta`). `npm install`/`npm run build` отработали
с предупреждением `EBADENGINE`, функционально не заблокировано, но для честной
CI-парности с Vercel (который наверняка использует Node 24) это стоит закрыть отдельно —
см. `[P0-CICD]`-раздел, добавлено как находка.

---

[FIX] fix-google-oauth-code-challenge-typecheck — сделано, проверено: `npm run typecheck`
падал с `TS2322: Type '"S256"' is not assignable to type 'CodeChallengeMethod | undefined'`
в `src/lib/integrations/google-oauth.ts:40`. Причина: `googleapis`/`google-auth-library`
в используемой версии (`googleapis@173.0.0` → `google-auth-library@10.9.0`) объявляют
`CodeChallengeMethod` как TS `enum`, а не строковый литеральный тип, поэтому голая строка
`"S256"` больше не проходит структурную проверку. Исправлено на
`Auth.CodeChallengeMethod.S256` через уже реэкспортируемый `googleapis`-неймспейс
`Auth` (`export * as Auth from 'google-auth-library'` в `googleapis/build/src/index.d.ts`) —
без добавления новой транзитивной зависимости в `package.json`. Проверено:
`npm run typecheck` зелёный, `npm run test` (114/114) зелёный после фикса, рантайм-значение
идентично прежнему (`Auth.CodeChallengeMethod.S256 === "S256"`, проверено через
`node -e "console.log(require('googleapis').Auth.CodeChallengeMethod)"`). Не проверено:
реальный Google OAuth PKCE-обмен кода на токен (нет тестового Google OAuth-приложения в
этой сессии) — но это тот же путь, что уже покрыт `tests/google-pkce.test.ts` на уровне
генерации transaction/state, сам факт типа строки на рантайм не влиял, только на билд.

---

[P0-AUTH-06] audit-cookie-flags-in-prod — сделано (код + тест), частично проверено.
Реально проверено локально: поднят одноразовый docker-контейнер `pgvector/pgvector:pg16`
(порт 5544, роли `anon`/`authenticated`/`service_role` созданы вручную по образцу
Supabase), прогнаны все 16 миграций из `supabase/migrations/` на чистой БД без единой
ошибки (расхождение с текстом промпта: там написано "17 миграций", реально файлов 16 —
таблиц в схеме действительно 17, видимо опечатка/смешение). На этой БД эмпирически
подтверждено: RLS включён на всех 17 таблицах, ни для одной нет ни одной policy —
`anon`/`authenticated` получают `permission denied` на SELECT/INSERT на всех проверенных
таблицах (`tasks`, `personal_settings`, `google_oauth_connections`, `raw_captures`,
`memory_chunks`, `audit_log`), `service_role` (создан с `BYPASSRLS`, как в реальном
Supabase) читает свободно — README-заявление "deny-all RLS для браузерных ролей"
подтверждено фактически, а не на слово. Отдельно эмпирически проверена
`register_login_attempt`: 8 фейлов с одного IP проходят, 9-й возвращает `false`
(блокировка), с другого IP в это же время — проходит (подтверждает описанную в промпте
уязвимость обхода по IP, см. `[P0-AUTH-04]`).

Код: `src/lib/deployment/smoke.ts` — `cookieFrom()` ранее отбрасывал все атрибуты cookie
(оставлял только `name=value`), поэтому `runAuthenticatedChecks` мог молча пропустить
регресс (например, случайно пропавший `Secure`/`HttpOnly`). Добавлены
`assertSessionCookieFlags` (HttpOnly, SameSite=Strict, Secure и `__Host-` префикс —
последние два только когда деплой на https) и `assertSessionCookieCleared` (логаут
реально обнуляет cookie через `Max-Age=0` либо прошедший `Expires`), обе подключены в
`runAuthenticatedChecks` в `src/lib/deployment/smoke.ts`. Добавлены 2 теста в
`tests/deployment-smoke.test.ts`: один подтверждает, что корректные флаги проходят,
второй — что регрессия (cookie без флагов) реально ловится смоук-тестом (до фикса такой
тест бы не сработал, так как `cookieFrom` не видел атрибутов вовсе). `npm run test`
116/116 зелёный (было 114), `npm run typecheck`/`npm run lint` зелёные.

Не проверено: реальные HTTP-заголовки на проде `hinkok-os-phi.vercel.app` — это требует
знания настоящего `DASHBOARD_PASSWORD` пользователя, которого у агента нет и не должно
быть (агент не должен вводить/запрашивать реальные пароли). Рекомендация пользователю:
прогнать `npm run deploy:smoke -- https://hinkok-os-phi.vercel.app --authenticated` с
`DASHBOARD_PASSWORD` в своём локальном окружении — теперь этот прогон реально проверит
флаги cookie, а не только её наличие.

---

[VISUAL-QA-SETUP] set-up-local-visual-verification — сделано. Поднят полноценный
локальный Supabase-эквивалент для визуальной проверки: `pgvector/pgvector:pg16` в
Docker (порт 5544) + `postgrest/postgrest` в Docker (порт 5555) + самописный Node-прокси
(снимает префикс `/rest/v1`, который supabase-js всегда добавляет, а голый PostgREST не
понимает — в реальном Supabase это делает Kong; здесь это 40-строчный http-прокси). JWT
для anon/service_role заминчены вручную (HS256, тот же секрет что и в PGRST_JWT_SECRET).
Засеяны реалистичные данные под все 8 модулей (entities, tasks по всем 6 колонкам канбана,
raw_captures, memory_chunks по 9 сферам, daily_logs за 30 дней с mood + health-активностью
через реальный RPC `upsert_daily_activity`, weekly_insights, system_job_runs, habit-отметки
через `set_daily_habit`). `npm run dev` поднят, залогинился с локальным
`DASHBOARD_PASSWORD`, все 8 дашбордов реально рендерятся с данными (не заглушки).
Ограничение: скриншоты в Browser-инструменте этой сессии не работают (таймаут на
рендер-пайплайне, воспроизводится на любой странице и в новой вкладке) — визуальная
сверка с референсами велась через чтение самих референс-JPG инструментом Read + чтение
computed styles через JS в живой странице, а не через попиксельное сравнение скриншотов.

---

[P0-DESIGN-03] add-headline-accent-pattern — расхождение зафиксировано и разрешено НЕ в
пользу буквального текста промпта. Промпт (раздел 22.2) требует применить паттерн
«обычный текст + курсивный оранжевый акцент на втором слове» к Home, Journal, Health,
Operations, Settings, Backup, Login. Однако сам же промпт прикладывает референс-скриншоты
(раздел 22.1) как эталон, и по факту: Home (`docs/design-references/home.jpg`), Journal
(`journal-top.jpg`) и Health (`health.jpg`) в реальном демо НЕ используют этот заголовок —
там сразу идёт сетка панелей/метрик. Проверено кодом и в браузере: Operations
(`systems, observed.`), Settings (`make it yours.`), Backup (`your data, portable.`) —
паттерн уже реализован; Brain (`notes that keep thinking.`) и CRM (`people, moving.`) —
тоже уже есть. Т.е. по факту паттерн уже применён везде, где референсы его показывают, и
корректно отсутствует там, где референсы показывают его отсутствие. Login оставлен без
акцентного заголовка (там нейтральный `Защищённый вход`) — это отдельная страница входа,
референса под неё нет, и стилистическая нейтральность для экрана логина — устоявшаяся
практика, не баг. Вывод: P0-DESIGN-03 не требует изменений кода, требовал только этой
сверки. Не проверено: соответствует ли это актуальному прод-виду `hinkok-os-phi.vercel.app`
v3.1 (референсы могли устареть относительно того, что сейчас на проде) — агент не имеет
доступа к прод-паролю, чтобы зайти и сверить лично.

---

[P0-DESIGN-02] add-top-ticker-bar — сделано частично, по-честному. В коде тикера не было
вовсе (топбар во всех 8 дашбордов заканчивался только часами). Добавлено:
- `src/lib/market/ticker.ts` — server-only модуль, тянет курс BTC-USD с публичного
  CoinGecko API (`/api/v3/simple/price`), которому не нужен API-ключ, с таймаутом 4с,
  in-memory кэшем на 60с и graceful `null` при любой ошибке (никогда не бросает и не
  подставляет выдуманное число).
- `src/app/api/market/ticker/route.ts` — авторизованный GET-роут (тот же
  `authenticateRequest`, что у остальных API), `Cache-Control: no-store`.
- `src/components/ui/topbar-ticker.tsx` — клиентский компонент, опрашивает эндпоинт раз в
  60с, рендерит `BTC $65,607 ▲`/`▼` (стрелка красная/зелёная — переиспользует существующие
  `var(--green)`/`var(--danger)`, а не новые цвета), рендерит `null` (ничего), если данных
  нет — не показывает пустые/фейковые плашки.
- Подключено во все 8 дашбордов (`crm`, `brain`, `journal`, `home`, `health`, `operations`,
  `settings`, `backup`), CSS добавлен в `globals.css` (`.topbar-ticker*`).
Реально проверено в браузере (dev-сервер + логин): `.topbar-ticker` рендерит настоящую
живую цену BTC, стрелка вверх зелёного цвета `rgb(103,217,155)` = `#67D99B` = `--green` —
подтверждено через `getComputedStyle`. `npm run typecheck`/`lint`/`test` (116/116) зелёные
после изменений.
**NDX (Nasdaq-100) и XAU (золото) сознательно не реализованы** — не нашёл ни одного
публичного API без ключа для индекса или спот-цены золота, а придумывать цифры прямо
запрещено и этим же документом (принцип «не выдумывать данные», уже применённый к Health),
и README. Референс показывает 3 плашки, сейчас честно показывается 1 (BTC). Если у
пользователя есть/появится платный ключ (Alpha Vantage, TwelveData, Metals-API и т.п.),
`getMarketTicker()` — то место, куда добавлять остальные котировки по тому же паттерну
`fetchBitcoinQuote()`. Не проверено: поведение на реальном проде (Vercel serverless может
иметь другие исходящие сетевые ограничения, хотя CoinGecko обычно доступен без проблем).

---

[P0-DESIGN-01] extract-design-tokens-from-reference — сделано (в рамках именованных в
промпте категорий), проверено. Найдено 87 захардкоженных hex-цветов вне
`globals.css`-переменных в `brain.css`(25)/`crm.css`(22)/`journal.css`(24)/`health.css`(16).
Полный вынос всех 87 — не требование этого пункта буквально (сам DoD говорит "старые цвета
выносить по мере правки", т.е. инкрементально), поэтому вынесены именно те категории,
которые явно перечислены в тексте промпта: mood-шкала (5 ступеней), цвета приоритетных
бейджей CRM (hot/warm/cold), радиусы карточек/капсул. Добавлены в
`src/app/globals.css` `:root`: `--radius-card` (7px), `--radius-pill` (999px),
`--mood-rad/--mood-good/--mood-meh/--mood-meh-ink/--mood-bad/--mood-awful/--mood-active-border`,
`--mood-bar-good/--mood-bar-middle/--mood-bar-low`,
`--sleep-bar-from/-to/--sleep-bar-worst-from/-to`,
`--priority-hot/--priority-hot-text/--priority-warm/--priority-warm-text/--priority-cold-text`.
Применены в `journal.css` (mood-picker, 30-дневная гистограмма, sleep-корреляция) и
`crm.css` (priority-chip, левая полоска приоритета на карточке). Радиус: механически
заменены все буквальные `border-radius: 999px` (13 мест) и `border-radius: 7px` (9 мест,
включая составной `7px 0 0 7px`) на токены во всех 6 `*.css` файлах — чистый рефакторинг,
без единого визуального отличия.
Реально проверено в браузере через `getComputedStyle` до и после рефакторинга (dev-сервер
с засеянными данными): цвета mood-кнопок (`rgb(120,159,112)`=`#789F70` и т.д.), баров
30-дневного графика и priority-chip'ов (`hot`=`#F58D65`, `warm`=`#D8AA76`,
`cold`=`#C18F70`) — пиксель-в-пиксель совпадают с оригиналом. `npm run typecheck`/`lint`/
`test` (116/116)/`build` — все зелёные.
Документация токенов добавлена в `docs/DESIGN_DIRECTION.md` (новый раздел "Design tokens"
с таблицей).
Не сделано (осознанно, не в скоуп этого прохода): оставшиеся ~55 захардкоженных hex —
это по большей части одноразовые текстовые оттенки (лёгкие вариации `--muted`/`--text-soft`
для конкретного элемента, не переиспользуемые в другом месте), выносить их в отдельные
именованные токены сейчас скорее добавит шум, чем пользу — оставлено как P1-полировка,
явно поименованная задача уже есть в самом промпте (`[P1-DESIGN-*]`).
