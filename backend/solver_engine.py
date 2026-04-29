"""
LOMS Backend — Optimization Engine
Release Candidate 1.0 (RC1)

Version:    1.0-RC1
Released:   03-04-2026
Author:     LOMS Project

Changes from Beta 0.1:
  [FIX DEF-02] Unknown action now returns explicit Error response instead of
               silently falling through to solve.
  [FIX DEF-03] time_limit values below 1 second now trigger a UserWarning
               embedded in the JSON response, alerting the caller.
  [IMP]        ValidationError carries a structured `code` field for machine
               parsing by the UI layer.
  [IMP]        Result formatter rounds float values with configurable precision.
"""

import json
import sys
import time
import warnings
from typing import Any

import numpy as np
from scipy.optimize import linprog, milp, LinearConstraint, Bounds


# Version
__version__ = "1.0-RC1"
__release_date__ = "03-04-2026"

SUPPORTED_ACTIONS = {"solve", "validate", "get-lp-text", "ping"}

# Exceptions
class ValidationError(Exception):
    def __init__(self, message: str, details: str = "", code: str = "VALIDATION_ERROR"):
        super().__init__(message)
        self.details = details
        self.code = code


# Model Translator
class ModelTranslator:
    """
    Translates a LOMS visual graph (JSON) into a normalized LP/MIP problem.

    Graph schema:
      nodes: list of {id, type: 'variable'|'constraint'|'objective',
                      name, var_type: 'cont'|'int'|'binary',
                      lb, ub, obj_coeff, sense: 'leq'|'eq'|'geq', rhs}
      edges: list of {source, target, coeff}
      direction: 'min' | 'max'
    """

    def __init__(self, graph: dict):
        self.graph = graph
        self.variables: list[dict] = []
        self.constraints: list[dict] = []
        self.direction: str = "min"
        self._var_index: dict[str, int] = {}
        self._adj: dict[str, list[dict]] = {}

    def validate(self):
        nodes = self.graph.get("nodes", [])
        edges = self.graph.get("edges", [])

        var_nodes = [n for n in nodes if n.get("type") == "variable"]
        con_nodes = [n for n in nodes if n.get("type") == "constraint"]
        obj_nodes = [n for n in nodes if n.get("type") == "objective"]

        if not var_nodes:
            raise ValidationError(
                "Граф не содержит переменных решения",
                "Добавьте хотя бы одну переменную.",
                code="NO_VARIABLES")

        if not con_nodes:
            raise ValidationError(
                "Граф не содержит ограничений",
                "Добавьте хотя бы одно ограничение.",
                code="NO_CONSTRAINTS")

        if not obj_nodes:
            raise ValidationError(
                "Граф не содержит целевой функции",
                "Добавьте узел целевой функции.",
                code="NO_OBJECTIVE")

        # Check all variables have finite obj_coeff
        for v in var_nodes:
            c = v.get("obj_coeff", 0)
            if not isinstance(c, (int, float)) or not np.isfinite(c):
                raise ValidationError(
                    f"Некорректный коэффициент целевой функции для переменной '{v.get('name')}'",
                    "Коэффициент должен быть конечным числом.",
                    code="INVALID_COEFFICIENT")

        # Check all constraints have at least one incoming edge
        edge_targets = {e.get("target") for e in edges}
        for con in con_nodes:
            if con["id"] not in edge_targets:
                raise ValidationError(
                    f"Ограничение '{con.get('name', con['id'])}' не связано ни с одной переменной",
                    "Добавьте рёбра от переменных к ограничению.",
                    code="DISCONNECTED_CONSTRAINT")

    def translate(self):
        self.validate()
        nodes = self.graph.get("nodes", [])
        edges = self.graph.get("edges", [])
        self.direction = self.graph.get("direction", "min")

        # Index variables
        self.variables = [n for n in nodes if n.get("type") == "variable"]
        for i, v in enumerate(self.variables):
            self._var_index[v["id"]] = i

        # Build adjacency: target_id → list of {var_idx, coeff}
        for e in edges:
            src = e.get("source")
            tgt = e.get("target")
            coeff = e.get("coeff", 1.0)
            if src not in self._var_index:
                continue
            if tgt not in self._adj:
                self._adj[tgt] = []
            self._adj[tgt].append({"var_idx": self._var_index[src], "coeff": coeff})

        # Build constraint list
        self.constraints = [n for n in nodes if n.get("type") == "constraint"]

    def to_scipy_lp(self) -> dict:
        """Build arrays for scipy linprog (LP only)."""
        n = len(self.variables)
        c = np.array([v.get("obj_coeff", 0.0) for v in self.variables], dtype=float)
        if self.direction == "max":
            c = -c

        A_ub, b_ub, A_eq, b_eq = [], [], [], []
        for con in self.constraints:
            row = np.zeros(n)
            for entry in self._adj.get(con["id"], []):
                row[entry["var_idx"]] = entry["coeff"]
            sense = con.get("sense", "leq")
            rhs = float(con.get("rhs", 0))
            if sense == "leq":
                A_ub.append(row); b_ub.append(rhs)
            elif sense == "geq":
                A_ub.append(-row); b_ub.append(-rhs)
            else:
                A_eq.append(row); b_eq.append(rhs)

        lbs = [v.get("lb") if v.get("lb") is not None else 0.0 for v in self.variables]
        ubs = [v.get("ub") if v.get("ub") is not None else None for v in self.variables]
        return {
            "c": c,
            "A_ub": np.array(A_ub) if A_ub else None,
            "b_ub": np.array(b_ub) if b_ub else None,
            "A_eq": np.array(A_eq) if A_eq else None,
            "b_eq": np.array(b_eq) if b_eq else None,
            "bounds": list(zip(lbs, ubs)),
            "direction": self.direction,
        }

    def to_scipy_milp(self) -> dict:
        """Build arrays for scipy milp (MIP)."""
        n = len(self.variables)
        c = np.array([v.get("obj_coeff", 0.0) for v in self.variables], dtype=float)
        if self.direction == "max":
            c = -c

        A_rows, lb_rows, ub_rows = [], [], []
        for con in self.constraints:
            row = np.zeros(n)
            for entry in self._adj.get(con["id"], []):
                row[entry["var_idx"]] = entry["coeff"]
            sense = con.get("sense", "leq")
            rhs = float(con.get("rhs", 0))
            A_rows.append(row)
            if sense == "leq":
                lb_rows.append(-np.inf); ub_rows.append(rhs)
            elif sense == "geq":
                lb_rows.append(rhs); ub_rows.append(np.inf)
            else:
                lb_rows.append(rhs); ub_rows.append(rhs)

        lbs  = np.array([v.get("lb") if v.get("lb") is not None else 0.0 for v in self.variables])
        ubs_ = np.array([v.get("ub") if v.get("ub") is not None else np.inf for v in self.variables])
        integrality = np.array([
            1 if v.get("var_type") in ("int", "binary") else 0
            for v in self.variables
        ])
        # Enforce binary bounds
        for i, v in enumerate(self.variables):
            if v.get("var_type") == "binary":
                lbs[i] = 0; ubs_[i] = 1

        return {
            "c": c,
            "constraints": LinearConstraint(
                np.array(A_rows) if A_rows else np.zeros((0, n)),
                np.array(lb_rows) if lb_rows else np.array([]),
                np.array(ub_rows) if ub_rows else np.array([]),
            ),
            "integrality": integrality,
            "bounds": Bounds(lbs, ubs_),
            "direction": self.direction,
        }

    def lp_text(self) -> str:
        """Generate LP-notation string for UI display."""
        lines = []
        sense_str = "Minimize" if self.direction == "min" else "Maximize"
        terms = []
        for i, v in enumerate(self.variables):
            c = v.get("obj_coeff", 0.0)
            name = v.get("name", f"x{i}")
            if c != 0:
                terms.append(f"{c:+g} {name}")
        lines += [sense_str, "  obj: " + (" ".join(terms) or "0"), ""]
        lines.append("Subject To")
        for j, con in enumerate(self.constraints):
            row_terms = []
            for e in self._adj.get(con["id"], []):
                vname = self.variables[e["var_idx"]].get("name", "x" + str(e["var_idx"]))
                row_terms.append(f"{e['coeff']:+g} {vname}")
            sense_map = {"leq": "<=", "geq": ">=", "eq": "="}
            lines.append(f"  {con.get('name', f'c{j}')}: {' '.join(row_terms)} "
                         f"{sense_map.get(con.get('sense','leq'),'<=')} {con.get('rhs', 0)}")
        lines += ["", "Bounds"]
        for i, v in enumerate(self.variables):
            lb = v.get("lb") if v.get("lb") is not None else 0
            ub = v.get("ub") if v.get("ub") is not None else "+inf"
            lines.append(f"  {lb} <= {v.get('name', f'x{i}')} <= {ub}")
        lines += ["", "Generals"]
        for v in self.variables:
            if v.get("var_type") == "int":
                lines.append(f"  {v.get('name')}")
        lines += ["Binaries"]
        for v in self.variables:
            if v.get("var_type") == "binary":
                lines.append(f"  {v.get('name')}")
        lines.append("End")
        return "\n".join(lines)

    def is_milp(self) -> bool:
        return any(v.get("var_type") in ("int", "binary") for v in self.variables)


# Solver Adapter
class SolverAdapter:
    STATUS_MAP = {0: "Optimal", 1: "TimeLimit", 2: "Infeasible", 3: "Unbounded", 4: "Error"}

    def __init__(self, config: dict):
        self.time_limit = float(config.get("time_limit", 300))
        self.gap = float(config.get("gap_tolerance", 0.001))
        # [FIX DEF-03] Warn if time_limit is unreasonably small
        self.low_time_warning: str | None = None
        if self.time_limit < 1.0:
            self.low_time_warning = (
                f"Предупреждение: time_limit={self.time_limit} с слишком мал. "
                "Для нетривиальных задач рекомендуется не менее 1 секунды."
            )

    def solve_lp(self, data: dict) -> dict:
        kwargs: dict[str, Any] = {"method": "highs",
                                  "options": {"time_limit": self.time_limit, "disp": False}}
        if data["A_ub"] is not None:
            kwargs["A_ub"] = data["A_ub"]; kwargs["b_ub"] = data["b_ub"]
        if data["A_eq"] is not None:
            kwargs["A_eq"] = data["A_eq"]; kwargs["b_eq"] = data["b_eq"]
        res = linprog(data["c"], bounds=data["bounds"], **kwargs)
        status = self.STATUS_MAP.get(res.status, "Error")
        obj = (-res.fun) if (data["direction"] == "max" and res.fun is not None) else res.fun
        return {"status": status, "objective_value": obj,
                "x": res.x.tolist() if res.x is not None else None,
                "message": res.message}

    def solve_milp(self, data: dict) -> dict:
        res = milp(data["c"],
                   constraints=data["constraints"],
                   integrality=data["integrality"],
                   bounds=data["bounds"],
                   options={"time_limit": self.time_limit, "mip_rel_gap": self.gap, "disp": False})
        status = self.STATUS_MAP.get(res.status, "Error")
        obj = (-res.fun) if (data["direction"] == "max" and res.fun is not None) else res.fun
        return {"status": status, "objective_value": obj,
                "x": res.x.tolist() if res.x is not None else None,
                "message": res.message}


# Result Formatter
class ResultFormatter:
    FLOAT_PRECISION = 10

    def __init__(self, translator: ModelTranslator):
        self.translator = translator

    def format(self, raw: dict, solve_time: float, warning: str | None = None) -> dict:
        status = raw.get("status", "Error")
        obj = raw.get("objective_value")
        x   = raw.get("x")
        variables: dict[str, float] = {}
        if x is not None:
            for i, v in enumerate(self.translator.variables):
                val = float(x[i])
                if v.get("var_type") == "binary":
                    val = 1.0 if val >= 0.5 else 0.0
                elif v.get("var_type") == "int":
                    val = float(round(val))
                variables[v.get("name", f"x{i}")] = round(val, self.FLOAT_PRECISION)
        result = {
            "status":           status,
            "objective_value":  round(float(obj), self.FLOAT_PRECISION) if obj is not None else None,
            "variables":        variables,
            "solve_time_sec":   round(solve_time, 4),
            "optimality_gap":   None,
            "message":          raw.get("message", ""),
            "solver":           "HiGHS (scipy)",
            "version":          __version__,
        }
        if warning:
            result["warning"] = warning
        return result


# IPC Handler

def handle_command(cmd: dict) -> dict:
    action = cmd.get("action")

    # [FIX DEF-02] Explicit check for unsupported actions
    if action not in SUPPORTED_ACTIONS:
        return {
            "status":   "Error",
            "error":    f"Неизвестное действие: '{action}'. "
                        f"Поддерживаются: {', '.join(sorted(SUPPORTED_ACTIONS))}.",
            "code":     "UNKNOWN_ACTION",
            "variables": {},
            "objective_value": None,
            "solve_time_sec": 0,
            "version":  __version__,
        }

    # Health-check ping
    if action == "ping":
        return {"status": "OK", "message": "pong", "version": __version__}

    graph  = cmd.get("graph", {})
    config = cmd.get("config", {})

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
        return {
            "status":        "Valid",
            "message":       "Модель корректна",
            "is_milp":       translator.is_milp(),
            "n_vars":        len(translator.variables),
            "n_constraints": len(translator.constraints),
            "version":       __version__,
        }

    if action == "get-lp-text":
        return {"status": "OK", "lp_text": translator.lp_text(), "version": __version__}

    # action == "solve"
    adapter   = SolverAdapter(config)
    formatter = ResultFormatter(translator)
    t0 = time.perf_counter()
    try:
        if translator.is_milp():
            data = translator.to_scipy_milp()
            raw  = adapter.solve_milp(data)
        else:
            data = translator.to_scipy_lp()
            raw  = adapter.solve_lp(data)
    except Exception as ex:
        return {
            "status":          "Error",
            "error":           str(ex),
            "variables":       {},
            "objective_value": None,
            "solve_time_sec":  round(time.perf_counter() - t0, 4),
            "version":         __version__,
        }
    t1 = time.perf_counter()
    return formatter.format(raw, t1 - t0, warning=adapter.low_time_warning)


def main():
    """Read JSON commands from stdin, write responses to stdout (IPC mode)."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"status": "Error", "error": f"JSON parse error: {e}",
                              "version": __version__}), flush=True)
            continue
        result = handle_command(cmd)
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
