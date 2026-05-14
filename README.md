# LOMS — Low-code Optimization Modeling System
## Версия 1.0.0-w4 · Неделя 4: Доработка Python-редактора, визуального редактора + Версии/история в UI + исправление багов

Графический редактор для решения прикладных задач линейной/целочисленной оптимизации (LP/MIP).

* **Frontend**: React + Vite, рендерится в Electron.
* **Backend**: Python (scipy.optimize.linprog / milp) + SQLAlchemy для хранения моделей и истории.
* **IPC**: Electron main - Python через JSON-сообщения по stdin/stdout.


## Установка и запуск (dev) 🖥️

### 1. Требования

| Компонент | Версия |
|-----------|--------|
| Node.js   | 20     |
| npm       | 10     |
| Python    | 3.12   |

### 2. Python-окружение

В корне проекта:

```bash
python3 -m venv .venv
source .venv/bin/activate           # Linux / macOS
# .venv\Scripts\activate             # Windows
pip install -r backend/requirements.txt
```

### 3. Node-зависимости

```bash
npm install
```

### 4. Запуск

```bash
npm run dev
```

Эта команда:
1. поднимает Vite на `http://localhost:5173`,
2. ждёт его готовности,
3. запускает Electron, который автоматически стартует Python-сервер.

База данных SQLite создаётся в `userData` Electron-приложения
(см. лог `[main] userData : ...` в консоли).

### Сборка production-версии

```bash
npm run build         # Vite собирает фронт в ./dist
# далее упаковка через electron-builder / electron-forge — на ваше усмотрение
```

Создаёт установщик в папке `release/`:
- Windows → `release/LOMS Setup 1.0.0.exe`
- macOS   → `release/LOMS-1.0.0.dmg`
- Linux   → `release/LOMS-1.0.0.AppImage`

---

## Что умеет приложение 🤖

### Граф (раздел «Граф»)
* Графический редактор узлов (переменные / ограничения / целевая функция)
* Drag-and-drop узлов, рисование рёбер, редактирование коэффициентов
* 4 встроенных шаблона задач (транспортная, назначения, рюкзак, производство)
* Решение LP и MIP через scipy (HiGHS)
* Валидация модели и просмотр LP-нотации
* Сохранение моделей в локальную SQLite БД
* Версионирование моделей с откатом
* История запусков решателя
* Импорт/экспорт `.loms` (JSON)
* Экспорт результата в CSV
* Несколько пресетов настроек решателя

### Модули (раздел «Модули»)
* Полноценный редактор пользовательских Python-скриптов
* CRUD операции в БД (название, описание, код)
* **Запуск в изолированном subprocess** с таймаутом в 30 сек (по умолчанию)
* Захват stdout / stderr / результата
* Доступ из кода:
    * `numpy`, `scipy.optimize` (linprog, milp, LinearConstraint, Bounds, etc.)
    * `solver_engine` - движок LOMS (`ModelTranslator`, `SolverAdapter`, `ResultFormatter`)
    * `context` - данные от UI: `context["graph"]`, `context["last_result"]`
    * `result` - переменная для возврата итога в UI

### Пример пользовательского кода (стартовый шаблон автоматически появляется при создании нового модуля):
```python
print("Hello from user module")

x = 10
y = 20

result = {
    "sum": x + y,
    "product": x * y,
}
```

---

## Как работает IPC ⚙️

```
Renderer (React)
    │  window.loms.py({ action: "solve", graph: {...} })
    ▼
Preload (contextBridge)
    │  ipcRenderer.invoke("py:command", cmd)
    ▼
Main Process (Electron)
    │  pyProcess.stdin.write(JSON + "\n")
    ▼
Python IPC Server (ipc_server.py)
    │  handle(cmd) → ModelTranslator → SolverAdapter → DB
    │  print(JSON + "\n")
    ▼
Main Process
    │  парсит stdout - resolve(Promise)
    ▼
Renderer
    │  result = await window.loms.py(...)
```

Каждый запрос получает уникальный `__id`. Python возвращает его в ответе.
Main process сопоставляет `__id` с ожидающим Promise и резолвит его.

---

## База данных 🗄️

Файл БД создаётся автоматически при первом запуске:
- **Electron**: `%APPDATA%/loms/loms.db` (Windows) или `~/Library/Application Support/loms/loms.db` (macOS)
- **Dev / тесты**: переопределяется через `LOMS_DB_PATH` или `LOMS_USER_DATA`

Таблицы:

| Таблица         | Назначение                              |
|-----------------|-----------------------------------------|
| `models`        | Сохранённые графы задач                 |
| `model_versions`| Снимки для версионирования и отката     |
| `solve_results` | История всех запусков решателя          |
| `solver_configs`| Именованные конфигурации (time_limit, gap) |
| `user_modules`  | Python-скрипты                          |

---

## IPC-команды 💾

| Действие              | Описание                                    |
|-----------------------|---------------------------------------------|
| `ping`                | Health-check, возвращает version + db_path  |
| `db:init`             | Создать таблицы, засеять конфигурации       |
| `db:stats`            | Статистика (счётчики всех таблиц)           |
| `model:create`        | Создать модель - возвращает model + version 1 |
| `model:list`          | Список моделей (desc по updated_at)         |
| `model:get`           | Получить по id                              |
| `model:update`        | Обновить (опционально — сохранить версию)   |
| `model:delete`        | Удалить каскадно (версии + результаты)      |
| `model:versions`      | Список версий модели                        |
| `model:restore`       | Откатить к версии                           |
| `solver_config:list`  | Все конфигурации солвера                    |
| `solver_config:default` | Конфигурация по умолчанию                 |
| `solver_config:create`| Создать именованную конфигурацию            |
| `result:list`         | История решений (все или по model_id)       |
| `result:get`          | Получить результат по id                    |
| `module:list/create/update/delete` | CRUD модулей (DB-слой готов)   |
| `solve`               | Решить LP/MIP → автосохранение в DB         |
| `validate`            | Проверить граф без решения                  |
| `get-lp-text`         | LP-нотация модели                           |

---

## Планы (следующие недели) 🗺️

- **Неделя 5**: Тесты E2E, dark mode, онбординг, улучшение UI, добавления горячих клавиш
- **Неделя 6**: electron-builder, финальная документация 

## Возможные добавления 🔍

- Перевод Python кода в графическую модель или LP-notation
- Добавление дополнительных компонентов: 
    - базовых: отображение более подробного результата, внешний источник данных, параметр узла
    - продвинутых: блок сумм, матричный блок, custom блок
- Python-custom компоненты, python классы которые можно использовать как компоненты
- Создание собственных шаблонов

