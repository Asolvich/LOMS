"""
LOMS Database Repository
CRUD operations for all entities — clean interface for IPC handlers
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from .database import get_session
from .models import Model, ModelVersion, SolveResult, SolverConfig, UserModule

# Models
class ModelRepo:

    @staticmethod
    def create(name: str, graph: dict, direction: str = "min",
               description: str = "", tags: list | None = None) -> dict:
        with get_session() as session:
            m = Model(
                name=name,
                description=description,
                graph_json=json.dumps(graph, ensure_ascii=False),
                direction=direction,
                tags=json.dumps(tags or []),
            )
            session.add(m)
            session.flush()  # get id before commit

            # Create version 1 automatically
            v = ModelVersion(
                model_id=m.id,
                version_number=1,
                graph_snapshot=json.dumps(graph, ensure_ascii=False),
                comment="Начальная версия",
            )
            session.add(v)
            session.commit()
            return m.to_dict()

    @staticmethod
    def get(model_id: int) -> dict | None:
        with get_session() as session:
            m = session.get(Model, model_id)
            return m.to_dict() if m else None

    @staticmethod
    def list_all(limit: int = 50, offset: int = 0) -> list[dict]:
        with get_session() as session:
            rows = (session.query(Model)
                    .filter(Model.is_template == False)
                    .order_by(Model.updated_at.desc())
                    .limit(limit).offset(offset).all())
            return [r.to_dict() for r in rows]

    @staticmethod
    def update(model_id: int, name: str | None = None,
               graph: dict | None = None, direction: str | None = None,
               description: str | None = None, tags: list | None = None,
               save_version: bool = True, version_comment: str = "") -> dict | None:
        with get_session() as session:
            m = session.get(Model, model_id)
            if not m:
                return None
            if name is not None:
                m.name = name
            if description is not None:
                m.description = description
            if direction is not None:
                m.direction = direction
            if tags is not None:
                m.tags = json.dumps(tags)
            if graph is not None:
                m.graph_json = json.dumps(graph, ensure_ascii=False)
                m.updated_at = datetime.utcnow()
                if save_version:
                    last_v = (session.query(ModelVersion)
                              .filter_by(model_id=model_id)
                              .order_by(ModelVersion.version_number.desc())
                              .first())
                    next_num = (last_v.version_number + 1) if last_v else 1
                    session.add(ModelVersion(
                        model_id=model_id,
                        version_number=next_num,
                        graph_snapshot=json.dumps(graph, ensure_ascii=False),
                        comment=version_comment or f"Версия {next_num}",
                    ))
            session.commit()
            return m.to_dict()

    @staticmethod
    def delete(model_id: int) -> bool:
        with get_session() as session:
            m = session.get(Model, model_id)
            if not m:
                return False
            session.delete(m)
            session.commit()
            return True

    @staticmethod
    def get_versions(model_id: int) -> list[dict]:
        with get_session() as session:
            rows = (session.query(ModelVersion)
                    .filter_by(model_id=model_id)
                    .order_by(ModelVersion.version_number.desc()).all())
            return [r.to_dict() for r in rows]

    @staticmethod
    def restore_version(model_id: int, version_id: int) -> dict | None:
        with get_session() as session:
            v = session.get(ModelVersion, version_id)
            if not v or v.model_id != model_id:
                return None
            m = session.get(Model, model_id)
            if not m:
                return None
            # Save current state as a new version before restoring
            last_v = (session.query(ModelVersion)
                      .filter_by(model_id=model_id)
                      .order_by(ModelVersion.version_number.desc()).first())
            next_num = (last_v.version_number + 1) if last_v else 1
            session.add(ModelVersion(
                model_id=model_id,
                version_number=next_num,
                graph_snapshot=m.graph_json,
                comment=f"Состояние до отката к версии {v.version_number}",
            ))
            # Restore
            m.graph_json = v.graph_snapshot
            m.updated_at = datetime.utcnow()
            session.commit()
            return m.to_dict()

# Solve Results
class SolveResultRepo:

    @staticmethod
    def save(model_id: int, result: dict, graph_snapshot: dict,
             solver_config_id: int | None = None,
             version_id: int | None = None) -> dict:
        with get_session() as session:
            row = SolveResult(
                model_id=model_id,
                version_id=version_id,
                solver_config_id=solver_config_id,
                status=result.get("status", "Unknown"),
                objective_value=result.get("objective_value"),
                variables_json=json.dumps(result.get("variables", {}), ensure_ascii=False),
                solver_name=result.get("solver", "HiGHS"),
                solve_time_sec=result.get("solve_time_sec", 0.0),
                optimality_gap=result.get("optimality_gap"),
                graph_snapshot=json.dumps(graph_snapshot, ensure_ascii=False),
            )
            session.add(row)
            session.commit()
            return row.to_dict()

    @staticmethod
    def list_for_model(model_id: int, limit: int = 20) -> list[dict]:
        with get_session() as session:
            rows = (session.query(SolveResult)
                    .filter_by(model_id=model_id)
                    .order_by(SolveResult.solved_at.desc())
                    .limit(limit).all())
            return [r.to_dict() for r in rows]

    @staticmethod
    def list_all(limit: int = 50) -> list[dict]:
        with get_session() as session:
            rows = (session.query(SolveResult)
                    .order_by(SolveResult.solved_at.desc())
                    .limit(limit).all())
            return [r.to_dict() for r in rows]

    @staticmethod
    def get(result_id: int) -> dict | None:
        with get_session() as session:
            r = session.get(SolveResult, result_id)
            return r.to_dict() if r else None

# Solver Configs
class SolverConfigRepo:

    @staticmethod
    def list_all() -> list[dict]:
        with get_session() as session:
            rows = session.query(SolverConfig).order_by(SolverConfig.id).all()
            return [r.to_dict() for r in rows]

    @staticmethod
    def get_default() -> dict | None:
        with get_session() as session:
            row = session.query(SolverConfig).filter_by(is_default=True).first()
            if not row:
                row = session.query(SolverConfig).first()
            return row.to_dict() if row else None

    @staticmethod
    def get(config_id: int) -> dict | None:
        with get_session() as session:
            r = session.get(SolverConfig, config_id)
            return r.to_dict() if r else None

    @staticmethod
    def create(name: str, backend: str = "highs",
               time_limit: int = 300, gap_tolerance: float = 0.001) -> dict:
        with get_session() as session:
            row = SolverConfig(
                name=name, backend=backend,
                time_limit=time_limit, gap_tolerance=gap_tolerance
            )
            session.add(row)
            session.commit()
            return row.to_dict()

# User Modules (stub, Week 2)
class UserModuleRepo:

    @staticmethod
    def list_all() -> list[dict]:
        with get_session() as session:
            rows = (session.query(UserModule)
                    .order_by(UserModule.updated_at.desc()).all())
            return [r.to_dict() for r in rows]

    @staticmethod
    def create(name: str, code: str, description: str = "",
               tags: list | None = None) -> dict:
        with get_session() as session:
            row = UserModule(
                name=name, code=code,
                description=description,
                tags=json.dumps(tags or []),
            )
            session.add(row)
            session.commit()
            return row.to_dict()

    @staticmethod
    def update(module_id: int, name: str | None = None,
               code: str | None = None, description: str | None = None,
               tags: list | None = None) -> dict | None:
        with get_session() as session:
            row = session.get(UserModule, module_id)
            if not row:
                return None
            if name is not None:
                row.name = name
            if code is not None:
                row.code = code
            if description is not None:
                row.description = description
            if tags is not None:
                row.tags = json.dumps(tags)
            row.updated_at = datetime.utcnow()
            session.commit()
            return row.to_dict()

    @staticmethod
    def delete(module_id: int) -> bool:
        with get_session() as session:
            row = session.get(UserModule, module_id)
            if not row:
                return False
            session.delete(row)
            session.commit()
            return True

    @staticmethod
    def get(module_id: int) -> dict | None:
        with get_session() as session:
            row = session.get(UserModule, module_id)
            return row.to_dict() if row else None
