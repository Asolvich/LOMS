# CHANGELOG — LOMS (Low-code Optimization Modeling System)

Все значимые изменения фиксируются в этом файле.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).
Версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.0-w2] - 30-04-2026 · Неделя 2: Python-редактор, React Flow drag-and-drop визуальный редактор

## Добавлено

### Python-редактор
- `src/components/ModulesEditor.jsx` - Пользовательский модуль LOMS. 
  - Пользовательский код имеет доступ к:
    - numpy, scipy.optimize (linprog, milp, LinearConstraint, Bounds)
    встроенному solver_engine — можно вызывать ModelTranslator, SolverAdapter напрямую.
    - переменной `context` — словарь с входными данными от UI
    (например, текущий граф модели, последний результат).
    - переменной `result` — куда пользователь кладёт итог,
    он автоматически вернётся в UI.
- `backend/module_runner.py` — Запускает пользовательский Python-код в отдельном subprocess
с таймаутом и захватом stdout/stderr/result.

## Изменения

#### База данных (`backend/db/`)
- `backend/db/models.py` — SQLAlchemy 2.0 ORM модели для 1 таблицы: `user_modules` — Python-скрипты пользователя.
- `backend/db/repository.py` — слой репозитория (`UserModuleRepo`): CRUD-операции.

#### IPC-сервер (`backend/ipc_server.py`)
Поддерживаемые действия (4 команды):
`module:list`, `module:create`, `module:update`, `module:delete`.

### React/Vite frontend (`src/`)
`src/ustils/lomsApi.js` - Добавлены обертки для работы с пользовательскими модулями

### React Flow drag-and-drop визуальный редактор
- `src/components/Canvas.jsx` - Добавлен drag-and-drop визуальный редактор, 
исправлен баг соединения переменных с ограничениями,
Канвас теперь с скроллом: внутри есть огромная "сцена" (4000×3000).
---

## [1.0.0-w1] — 24-04-2026 · Неделя 1: Electron-оболочка и фундамент БД

### Добавлено

#### Electron-оболочка (`electron/`)
- `electron/main.js` — главный процесс Electron: создание окна (1280×820, minWidth 900),
  запуск дочернего Python-процесса (`ipc_server.py`) через `child_process.spawn`,
  передача пути `userData` через переменную окружения `LOMS_USER_DATA`
- `electron/preload.js` — защищённый мост (`contextBridge`) между главным процессом
  и рендерером. Экспортирует `window.loms` API: `py`, `openFile`, `saveFile`,
  `readFile`, `writeFile`, `getVersion`, `getUserData`, `openPath`
- IPC-канал работает через `stdin`/`stdout` JSON-протокол с request/response matching
  по полю `__id` (каждый запрос получает уникальный числовой идентификатор)
- Таймаут запроса к Python: 60 секунд (настраиваемый)
- Обработка аварийного завершения Python-процесса: все pending-запросы получают ошибку
- Диалоги ОС: открытие файлов `.loms`/`.json`, сохранение с именем по умолчанию
- Файловые операции: `fs:readFile`, `fs:writeFile` через IPC handlers
- Конфигурация `electron-builder` для сборки под Windows (NSIS), macOS (dmg), Linux (AppImage)

#### База данных (`backend/db/`)
- `backend/db/models.py` — SQLAlchemy 2.0 ORM модели для 4 таблиц:
  - `models` — модели оптимизационных задач (граф, название, теги, версия схемы)
  - `model_versions` — снимки версий графа для отката (version_number, graph_snapshot, lp_text, comment)
  - `solve_results` — история всех запусков солвера (статус, z*, переменные, время, gap)
  - `solver_configs` — именованные конфигурации решателя (backend, time_limit, gap_tolerance)
- `backend/db/database.py` — фабрика движка SQLAlchemy, определение пути к БД
  (приоритет: `LOMS_DB_PATH` env - `LOMS_USER_DATA` env - `./loms_data/loms.db`),
  автоматическое включение WAL-режима и PRAGMA foreign_keys=ON
- `backend/db/database.py` — `init_db()`: `create_all` + seed 3 дефолтных конфигураций
  солвера («По умолчанию» 300с/0.001, «Быстрый (30 сек)» 30с/0.01, «Точный (15 мин)» 900с/0.0)
- `backend/db/repository.py` — слой репозиториев (`ModelRepo`, `SolveResultRepo`,
  `SolverConfigRepo`): CRUD-операции, изолированные транзакции,
  метод `to_dict()` для сериализации в JSON

#### IPC-сервер (`backend/ipc_server.py`)
- Полностью переработан относительно RC1: добавлена маршрутизация DB-команд
- Поддерживаемые действия (18 команд):
  `ping`, `db:init`, `db:stats`,
  `model:create`, `model:list`, `model:get`, `model:update`, `model:delete`,
  `model:versions`, `model:restore`,
  `solver_config:list`, `solver_config:default`, `solver_config:create`,
  `result:list`, `result:get`,
  `solve`, `validate`, `get-lp-text`
- `solve` теперь автоматически сохраняет результат в `solve_results` при передаче `model_id`
- `solve` поддерживает `solver_config_id` — загружает конфигурацию из БД
- DB инициализируется автоматически при первом старте процесса
- Все ответы содержат поле `version: "1.0-w2"`

#### React/Vite frontend (`src/`)
- `src/main.jsx` — точка входа React 18, `createRoot`
- `src/App.jsx` — корневой компонент
- `src/ustils/lomsApi.js` - безопасная обёртка над window.loms (preload bridge)
- `src/ustils/lpText.js` - построение LP-текста как fallback (если Python недоступен).
- `src/ustils/templates.js` - шаблоны задач
- `src/components/Canvas.jsx` - графический редактор
- `src/components/Modals.jsx`- набор React-компонентов модальных окон (popup-диалогов) с общей обёрткой ModalShell.
- `src/components/RightPanel.jsx` - Правая панель с 4 вкладками
- `src/components/SideBar.jsx` - боковая панель интерфейса приложения для работы с моделями оптимизации.
- `src/components/Toast.jsx` - контекст для системы toast-уведомлений.
- `src/components/Toolbar.jsx` - компонент панели инструментов (toolbar) для управления процессом решения оптимизационной задачи.
- `src/styles/app.css` - основной CSS-файл интерфейса приложения LOMS

#### Конфигурация проекта
- `vite.config.js` — Vite 5 с плагином React, алиас `@` → `src/`, порт 5173, outDir `dist`
- `index.html` — HTML-точка входа с CSP-заголовком
- `package.json` — скрипты: `dev` (concurrently vite + electron), `build`, `dist`,
  `test:backend`; зависимости; конфигурация `electron-builder`
- `backend/requirements.txt` — Python-зависимости: `scipy>=1.9`, `numpy>=1.24`,
  `sqlalchemy>=2.0`

### Изменено
- `backend/solver_engine.py` — скопирован из RC1 без изменений (точка интеграции)
- `ipc_server.py` полностью переписан: RC1-версия была монолитным скриптом,
  новая версия — модульный маршрутизатор с отдельным DB-слоем
---

## [1.0-RC1] — 03-04-2026 · Release Candidate 1

### Исправлено
- [DEF-02] Неизвестный action теперь возвращает явный Error с кодом `UNKNOWN_ACTION`
  вместо молчаливого fallback на solve
- [DEF-03] При `time_limit < 1.0` с в ответ добавляется поле `warning`

### Добавлено
- Команда `ping` для health-check IPC-канала
- Поле `version` во всех JSON-ответах
- Поле `solver` в ответе solve
- Структурированные коды ошибок валидации:
  `NO_VARIABLES`, `NO_CONSTRAINTS`, `NO_OBJECTIVE`,
  `INVALID_COEFFICIENT`, `DISCONNECTED_CONSTRAINT`

---

## [0.1-beta] — 30-03-2026 · Beta Release

### Добавлено
- Ядро LP-солвера (scipy linprog, HiGHS)
- MIP-солвер (scipy milp, Branch and Bound)
- Model Translator (JSON-граф → LP/MIP)
- 4 шаблона задач: транспортная, назначения, рюкзак, планирование
- Одностраничный HTML-прототип UI
- Python CLI IPC-режим
