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
