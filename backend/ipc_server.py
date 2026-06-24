"""
LOMS IPC Server — v1.0 Week 1
Reads JSON commands from stdin, writes JSON responses to stdout.

Supported actions (Week 1):
  ping              — health check
  db:init           — initialize database, return db path
  db:stats          — database statistics
  model:create      — create and save model
  model:list        — list all models
  model:get         — get model by id
  model:update      — update model (saves new version)
  model:delete      — delete model
  model:versions    — list versions of a model
  model:restore     — restore model to a version
  solver_config:list    — list solver configurations
  solver_config:default — get default solver config
  result:list       — list solve history
  result:get        — get single result
  solve             — solve an optimization model (+ auto-save result)
  validate          — validate model graph
  get-lp-text       — get LP notation

"""

from __future__ import annotations

import json
import sys
import os
import time

# Bootstrap sys.path so backend package is importable 
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from db import (
    init_db, get_db_path,
    ModelRepo, SolveResultRepo, SolverConfigRepo, UserModuleRepo,
)
from solver_engine import (
    ModelTranslator, SolverAdapter, ResultFormatter, ValidationError,
    __version__ as SOLVER_VERSION, SUPPORTED_ACTIONS as SOLVER_ACTIONS,
)

__version__ = "1.0-w2"
APP_VERSION = "LOMS v1.0 · Week 2"

# DB is initialized once at process start 
_DB_STATUS: dict | None = None

def ensure_db() -> dict:
    global _DB_STATUS
    if _DB_STATUS is None:
        _DB_STATUS = init_db()
    return _DB_STATUS

# Router
def handle(cmd: dict) -> dict:
    action = cmd.get("action", "")

    # Health
    if action == "ping":
        ensure_db()
        return {
            "status": "OK",
            "message": "pong",
            "version": __version__,
            "solver_version": SOLVER_VERSION,
            "db_path": str(get_db_path()),
        }
    
    # DB 
    if action == "db:init":
        result = ensure_db()
        return {**result, "version": __version__}

    if action == "db:stats":
        ensure_db()
        from db.database import get_session
        from db.models import Model, SolveResult, SolverConfig, UserModule
        with get_session() as session:
            return {
                "status": "OK",
                "models":        session.query(Model).count(),
                "solve_results": session.query(SolveResult).count(),
                "solver_configs": session.query(SolverConfig).count(),
                "user_modules":  session.query(UserModule).count(),
                "db_path":       str(get_db_path()),
            }

    # Models 
    if action == "model:create":
        ensure_db()
        name  = cmd.get("name", "Без названия")
        graph = cmd.get("graph", {})
        direction = cmd.get("direction", "min")
        description = cmd.get("description", "")
        tags = cmd.get("tags", [])
        m = ModelRepo.create(name, graph, direction, description, tags)
        return {"status": "OK", "model": m}

    if action == "model:list":
        ensure_db()
        models = ModelRepo.list_all(
            limit=cmd.get("limit", 50),
            offset=cmd.get("offset", 0),
        )
        return {"status": "OK", "models": models, "count": len(models)}

    if action == "model:get":
        ensure_db()
        m = ModelRepo.get(cmd.get("id"))
        if not m:
            return {"status": "Error", "error": "Модель не найдена"}
        return {"status": "OK", "model": m}

    if action == "model:update":
        ensure_db()
        m = ModelRepo.update(
            model_id=cmd.get("id"),
            name=cmd.get("name"),
            graph=cmd.get("graph"),
            direction=cmd.get("direction"),
            description=cmd.get("description"),
            tags=cmd.get("tags"),
            save_version=cmd.get("save_version", True),
            version_comment=cmd.get("version_comment", ""),
        )
        if not m:
            return {"status": "Error", "error": "Модель не найдена"}
        return {"status": "OK", "model": m}

    if action == "model:delete":
        ensure_db()
        ok = ModelRepo.delete(cmd.get("id"))
        if not ok:
            return {"status": "Error", "error": "Модель не найдена"}
        return {"status": "OK", "deleted_id": cmd.get("id")}

    if action == "model:versions":
        ensure_db()
        versions = ModelRepo.get_versions(cmd.get("id"))
        return {"status": "OK", "versions": versions}

    if action == "model:restore":
        ensure_db()
        m = ModelRepo.restore_version(cmd.get("model_id"), cmd.get("version_id"))
        if not m:
            return {"status": "Error", "error": "Версия не найдена"}
        return {"status": "OK", "model": m}

    # Solver Configs
    if action == "solver_config:list":
        ensure_db()
        configs = SolverConfigRepo.list_all()
        return {"status": "OK", "configs": configs}

    if action == "solver_config:default":
        ensure_db()
        cfg = SolverConfigRepo.get_default()
        return {"status": "OK", "config": cfg}

    if action == "solver_config:create":
        ensure_db()
        cfg = SolverConfigRepo.create(
            name=cmd.get("name", "Новая конфигурация"),
            backend=cmd.get("backend", "highs"),
            time_limit=cmd.get("time_limit", 300),
            gap_tolerance=cmd.get("gap_tolerance", 0.001),
        )
        return {"status": "OK", "config": cfg}

    # Results
    if action == "result:list":
        ensure_db()
        model_id = cmd.get("model_id")
        if model_id:
            results = SolveResultRepo.list_for_model(model_id)
        else:
            results = SolveResultRepo.list_all(limit=cmd.get("limit", 50))
        return {"status": "OK", "results": results, "count": len(results)}

    if action == "result:get":
        ensure_db()
        r = SolveResultRepo.get(cmd.get("id"))
        if not r:
            return {"status": "Error", "error": "Результат не найден"}
        return {"status": "OK", "result": r}

    # User Modules
    if action == "module:list":
        ensure_db()
        return {"status": "OK", "modules": UserModuleRepo.list_all()}

    if action == "module:create":
        ensure_db()
        m = UserModuleRepo.create(
            name=cmd.get("name", "Новый модуль"),
            code=cmd.get("code", ""),
            description=cmd.get("description", ""),
            tags=cmd.get("tags", []),
        )
        return {"status": "OK", "module": m}

    if action == "module:update":
        ensure_db()
        m = UserModuleRepo.update(
            cmd.get("id"), cmd.get("name"), cmd.get("code"),
            cmd.get("description"), cmd.get("tags"),
        )
        if not m:
            return {"status": "Error", "error": "Модуль не найден"}
        return {"status": "OK", "module": m}

    if action == "module:delete":
        ensure_db()
        ok = UserModuleRepo.delete(cmd.get("id"))
        return {"status": "OK" if ok else "Error",
                "deleted_id": cmd.get("id") if ok else None}
    
    if action == "module:get":
        ensure_db()
        m = UserModuleRepo.get(cmd.get("id"))
        if not m:
            return {"status": "Error", "error": "Модуль не найден"}
        return {"status": "OK", "module": m}

    if action == "module:run":
        ensure_db()
        try:
            from module_runner import run_user_module
        except Exception as ex:
            return {"status": "Error", "error": f"Не удалось загрузить runner: {ex}"}

        code = cmd.get("code", "")
        # Если передан id — берём код из БД (актуальная версия)
        if cmd.get("id") and not code:
            mod = UserModuleRepo.get(cmd.get("id"))
            if not mod:
                return {"status": "Error", "error": "Модуль не найден"}
            code = mod.get("code", "")

        ctx = cmd.get("context", {}) or {}
        timeout = float(cmd.get("timeout", 30.0))

        run_res = run_user_module(code, context=ctx, timeout=timeout)

        # Помечаем last_run_at, если запускали по id
        if cmd.get("id"):
            try:
                from datetime import datetime
                from db.database import get_session
                from db.models import UserModule
                with get_session() as session:
                    mod = session.get(UserModule, cmd.get("id"))
                    if mod:
                        mod.last_run_at = datetime.utcnow()
                        session.commit()
            except Exception:
                pass

        return {"status": run_res["status"], **run_res}

    # Solver actions (validate / get-lp-text / solve)
    if action in ("validate", "get-lp-text", "solve"):
        ensure_db()
        return _handle_solver(action, cmd)

    # Unknown action
    return {
        "status": "Error",
        "code":   "UNKNOWN_ACTION",
        "error":  (f"Неизвестное действие: '{action}'. "
                   f"Доступные: ping, db:init, db:stats, "
                   f"model:create/list/get/update/delete/versions/restore, "
                   f"solver_config:list/default/create, "
                   f"result:list/get, module:list/create/update/delete, "
                   f"solve, validate, get-lp-text"),
        "version": __version__,
    }

def _handle_solver(action: str, cmd: dict) -> dict:
    """Solver pipeline: translate → solve → save result to DB."""
    graph  = cmd.get("graph", {})
    config = cmd.get("config", {})

    # Override config from DB if solver_config_id is provided
    if cfg_id := cmd.get("solver_config_id"):
        db_cfg = SolverConfigRepo.get(cfg_id)
        if db_cfg:
            config = {
                "time_limit":    db_cfg["time_limit"],
                "gap_tolerance": db_cfg["gap_tolerance"],
            }

    translator = ModelTranslator(graph)
    try:
        translator.translate()
    except ValidationError as e:
        return {
            "status":          "Error",
            "error":           str(e),
            "details":         e.details,
            "code":            e.code,
            "variables":       {},
            "objective_value": None,
            "solve_time_sec":  0,
            "version":         __version__,
        }

    if action == "validate":
        out = {
            "status":        "Valid",
            "is_milp":       translator.is_milp(),
            "n_vars":        len(translator.variables),
            "n_constraints": len(translator.constraints),
            "version":       __version__,
        }
        if translator.unbounded_hint:
            out["warning"] = translator.unbounded_hint
        return out

    if action == "get-lp-text":
        return {"status": "OK", "lp_text": translator.lp_text(), "version": __version__}

    # solve
    adapter   = SolverAdapter(config)
    formatter = ResultFormatter(translator)
    t0 = time.perf_counter()
    try:
        if translator.is_milp():
            raw = adapter.solve_milp(translator.to_scipy_milp())
        else:
            raw = adapter.solve_lp(translator.to_scipy_lp())
    except Exception as ex:
        return {
            "status": "Error", "error": str(ex),
            "variables": {}, "objective_value": None,
            "solve_time_sec": round(time.perf_counter() - t0, 4),
            "version": __version__,
        }
    # Объединяем предупреждения адаптера и транслятора
    warnings = [w for w in (adapter.low_time_warning, translator.unbounded_hint) if w]
    warning = " ".join(warnings) if warnings else None
    result = formatter.format(raw, time.perf_counter() - t0, warning=warning)

    # Auto-save to DB if model_id provided
    model_id = cmd.get("model_id")
    if model_id:
        try:
            saved = SolveResultRepo.save(
                model_id=model_id,
                result=result,
                graph_snapshot=graph,
                solver_config_id=cmd.get("solver_config_id"),
            )
            result["result_id"] = saved["id"]
        except Exception as db_err:
            result["db_warning"] = f"Результат не сохранён в БД: {db_err}"

    result["version"] = __version__
    return result

def attach_id(result, cmd):
    if "__id" in cmd:
        result["__id"] = cmd["__id"]
    return result

# Main loop
def main():
    """IPC mode: read JSON lines from stdin, write JSON lines to stdout."""
    # Initialize DB immediately on startup
    try:
        ensure_db()
    except Exception as e:
        print(json.dumps({"status": "Error", "error": f"DB init failed: {e}"}),
              flush=True)

    print('{"status":"READY"}', flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({
                "status": "Error",
                "error":  f"JSON parse error: {e}",
                "version": __version__,
            }), flush=True)
            continue
        try:
            result = attach_id(handle(cmd), cmd)
        except Exception as e:
            result = attach_id({
                "status": "Error",
                "error":  f"Internal server error: {e}",
                "version": __version__,
            }, cmd)

        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
