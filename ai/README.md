# Инструкции для ИИ-ассистентов (Claude и ChatGPT)

Единственное место, где хранятся роли агентов и рабочие процессы (скиллы) проекта. Claude и ChatGPT работают над проектом попеременно и читают одни и те же файлы отсюда.

- `.claude/agents` и `.claude/skills` — ссылки на `ai/agents` и `ai/skills` (Claude Code находит их автоматически).
- `.chatgpt` — ссылка на `ai/`.
- `AGENTS.md` в корне указывает сюда (его читают Codex и другие агенты).

Правки делаются только в `ai/`; ссылки менять не нужно.

## Структура

| Путь | Что внутри |
|---|---|
| `agents/product-manager.md` | Ведёт `sdlc/backlog.md`: эпики, стори, баги, приоритеты, приёмка |
| `agents/developer.md` | Фуллстек JS-разработка, коммиты, push |
| `agents/devops.md` | Firebase (Hosting, Auth, Firestore, Storage), CI, домен, выпуск |
| `agents/qa-tester.md` | Тест-кейсы, автотесты, проверка задач |
| `agents/designer.md` | Визуальная система, `sdlc/design-rules.md` |
| `skills/create-backlog-item/SKILL.md` | Процесс постановки задачи в беклог |
| `skills/implement-backlog-task/SKILL.md` | Процесс реализации задачи из беклога |

Файл роли — инструкция для агента: в Claude Code это субагент, в ChatGPT/Codex — роль, которую ассистент выполняет сам, прочитав файл. Строки `tools:` в заголовке файлов используются только Claude Code.

## Чаты и роли

| Чат | Роли | Процесс |
|---|---|---|
| Беклог | `product-manager`, `qa-tester` | `skills/create-backlog-item/SKILL.md` |
| Реализация | `developer`, `qa-tester`, `devops` (+ ревьюер без контекста) | `skills/implement-backlog-task/SKILL.md` |
| Дизайн | `designer` | Стори на дизайн и `sdlc/design-rules.md` |

## Как запустить

- **Claude Code:** `/create-backlog-item …`, `/implement-backlog-task STORY-NNN` или обычной фразой («заведи баг…», «реализуй STORY-018»).
- **ChatGPT / Codex:** попросите «следуй `ai/skills/implement-backlog-task/SKILL.md` для STORY-NNN» (или `create-backlog-item`). Роли выполняются по файлам из `ai/agents/`.

## Общие правила проекта

Роли и процессы ссылаются на документы проекта в папке `sdlc/` и не дублируют их: `sdlc/rules.md`, `sdlc/design-rules.md`, `sdlc/sdlc.md`, `sdlc/deploy.md`, `sdlc/backlog.md`, `sdlc/firebase-backend-plan.md`, `AGENTS.md`.
