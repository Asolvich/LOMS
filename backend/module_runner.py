"""
LOMS Module Runner
─────────────────────────────────────────────────────────────────
Запускает пользовательский Python-код в отдельном subprocess
с таймаутом и захватом stdout/stderr/result.

Пользовательский код имеет доступ к:
  • numpy, scipy.optimize (linprog, milp, LinearConstraint, Bounds)
  • встроенному solver_engine — можно вызывать ModelTranslator,
    SolverAdapter напрямую
  • переменной `context` — словарь с входными данными от UI
    (например, текущий граф модели, последний результат)
  • переменной `result` — куда пользователь кладёт итог,
    он автоматически вернётся в UI

Пример пользовательского кода:
    import numpy as np
    print("Hello from user module!")
    print("Got context keys:", list(context.keys()))
    result = {"sum": sum(range(10)), "n": 10}
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path


# Шаблон-обёртка, в которую инлайним пользовательский код.
# Запускается в отдельном Python-процессе. Stdin содержит JSON-context.
# Размещён без отступов (без textwrap.dedent), чтобы избежать сюрпризов.
_RUNNER_TEMPLATE = '''\
import json, sys, traceback, io
from contextlib import redirect_stdout, redirect_stderr

# Читаем context из stdin
try:
    _ctx_raw = sys.stdin.read()
    context = json.loads(_ctx_raw) if _ctx_raw.strip() else {}
except Exception:
    context = {}

result = None

_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
_err = None

try:
    with redirect_stdout(_stdout_buf), redirect_stderr(_stderr_buf):
        # ─────── BEGIN USER CODE ───────
{user_code_indented}
        # ─────── END USER CODE ─────────
except SystemExit as ex:
    _err = "SystemExit: " + str(ex)
except BaseException:
    _err = traceback.format_exc()

# Безопасная JSON-сериализация result
def _safe(o, depth=0):
    if depth > 6:
        return repr(o)
    if o is None or isinstance(o, (bool, int, float, str)):
        return o
    if isinstance(o, (list, tuple)):
        return [_safe(x, depth+1) for x in o]
    if isinstance(o, dict):
        return {str(k): _safe(v, depth+1) for k, v in o.items()}
    try:
        import numpy as _np
        if isinstance(o, _np.ndarray):
            return _safe(o.tolist(), depth+1)
        if isinstance(o, _np.generic):
            return o.item()
    except Exception:
        pass
    return repr(o)

payload = {
    "stdout": _stdout_buf.getvalue(),
    "stderr": _stderr_buf.getvalue(),
    "result": _safe(result),
    "error":  _err,
}
sys.stdout.write("\\n@@@LOMS_MODULE_RESULT@@@\\n")
sys.stdout.write(json.dumps(payload, ensure_ascii=False))
sys.stdout.flush()
'''

def run_user_module(code: str,
                    context: dict | None = None,
                    timeout: float = 30.0) -> dict:
    """
    Запускает пользовательский код и возвращает результат.

    Returns dict:
      {
        "status":  "OK" | "Error" | "Timeout",
        "stdout":  str,
        "stderr":  str,
        "result":  any (JSON-serialisable),
        "error":   str | None,
        "elapsed": float,
      }
    """
    import time
    if context is None:
        context = {}

    # Indent user code for embedding inside the with-block (8 spaces)
    user_code_indented = "\n".join(
        ("        " + line) if line else ""
        for line in code.splitlines()
    ) or "        pass"

    # Используем replace вместо .format() — потому что в шаблоне есть
    # литералы dict и f-strings с фигурными скобками, которые format
    # неправильно бы интерпретировал.
    runner_src = _RUNNER_TEMPLATE.replace("{user_code_indented}", user_code_indented)

    # Сохраняем во временный файл, чтобы избежать проблем с длинными -c аргументами
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as tf:
        tf.write(runner_src)
        runner_path = tf.name

    t0 = time.perf_counter()
    try:
        proc = subprocess.run(
            [sys.executable, "-u", runner_path],
            input=json.dumps(context, ensure_ascii=False),
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
    except subprocess.TimeoutExpired as ex:
        try: os.unlink(runner_path)
        except Exception: pass
        return {
            "status": "Timeout",
            "stdout": (ex.stdout or "") if isinstance(ex.stdout, str) else "",
            "stderr": (ex.stderr or "") if isinstance(ex.stderr, str) else "",
            "result": None,
            "error":  f"Превышен лимит времени ({timeout} сек)",
            "elapsed": round(time.perf_counter() - t0, 4),
        }
    finally:
        try: os.unlink(runner_path)
        except Exception: pass

    elapsed = round(time.perf_counter() - t0, 4)
    raw_out = proc.stdout or ""
    raw_err = proc.stderr or ""

    # Из raw_out выделяем sentinel и payload
    marker = "\n@@@LOMS_MODULE_RESULT@@@\n"
    pre, _, post = raw_out.partition(marker)
    if post:
        try:
            payload = json.loads(post.strip())
            return {
                "status":  "Error" if payload.get("error") else "OK",
                "stdout":  payload.get("stdout", "") or pre,
                "stderr":  payload.get("stderr", "") or raw_err,
                "result":  payload.get("result"),
                "error":   payload.get("error"),
                "elapsed": elapsed,
            }
        except json.JSONDecodeError:
            pass

    # Падение runner-обёртки (ImportError и т.п.)
    return {
        "status": "Error",
        "stdout": raw_out,
        "stderr": raw_err,
        "result": None,
        "error":  raw_err.strip() or f"Runner exited with code {proc.returncode}",
        "elapsed": elapsed,
    }
