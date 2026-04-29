"""
LOMS Database Models
SQLAlchemy 2.0 ORM — Week 1 implementation

Tables:
  models         — saved optimization model graphs
  model_versions — snapshots for versioning / rollback
  solve_results  — history of every solver run
  solver_configs — named solver configurations
  user_modules   — user Python scripts (Week 2)
  templates      — built-in and user-created templates (Week 2+)
"""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text,
    create_engine, event
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped,
    mapped_column, relationship,
)


# Base
class Base(DeclarativeBase):
    pass


# models
class Model(Base):
    __tablename__ = "models"

    id:             Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:           Mapped[str]      = mapped_column(String(255), nullable=False, default="Без названия")
    description:    Mapped[str]      = mapped_column(Text, nullable=False, default="")
    graph_json:     Mapped[str]      = mapped_column(Text, nullable=False)   # full graph JSON
    direction:      Mapped[str]      = mapped_column(String(10), nullable=False, default="min")
    schema_version: Mapped[str]      = mapped_column(String(20), nullable=False, default="1.0")
    is_template:    Mapped[bool]     = mapped_column(Boolean, nullable=False, default=False)
    tags:           Mapped[str]      = mapped_column(Text, nullable=False, default="")   # JSON array string
    created_at:     Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at:     Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                     default=datetime.utcnow,
                                                     onupdate=datetime.utcnow)

    versions: Mapped[list[ModelVersion]] = relationship(
        "ModelVersion", back_populates="model",
        cascade="all, delete-orphan", order_by="ModelVersion.version_number"
    )
    solve_results: Mapped[list[SolveResult]] = relationship(
        "SolveResult", back_populates="model",
        cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id":             self.id,
            "name":           self.name,
            "description":    self.description,
            "graph":          json.loads(self.graph_json) if self.graph_json else {},
            "direction":      self.direction,
            "schema_version": self.schema_version,
            "is_template":    self.is_template,
            "tags":           json.loads(self.tags) if self.tags else [],
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "updated_at":     self.updated_at.isoformat() if self.updated_at else None,
        }


# model_versions

class ModelVersion(Base):
    __tablename__ = "model_versions"

    id:             Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("models.id"), nullable=False)
    version_number: Mapped[int]      = mapped_column(Integer, nullable=False)
    graph_snapshot: Mapped[str]      = mapped_column(Text, nullable=False)
    lp_text:        Mapped[str]      = mapped_column(Text, nullable=False, default="")
    comment:        Mapped[str]      = mapped_column(Text, nullable=False, default="")
    created_at:     Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    model: Mapped[Model] = relationship("Model", back_populates="versions")

    def to_dict(self) -> dict:
        return {
            "id":             self.id,
            "model_id":       self.model_id,
            "version_number": self.version_number,
            "graph_snapshot": json.loads(self.graph_snapshot) if self.graph_snapshot else {},
            "lp_text":        self.lp_text,
            "comment":        self.comment,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }


# solver_configs
class SolverConfig(Base):
    __tablename__ = "solver_configs"

    id:             Mapped[int]   = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:           Mapped[str]   = mapped_column(String(100), nullable=False, default="По умолчанию")
    backend:        Mapped[str]   = mapped_column(String(50), nullable=False, default="highs")
    time_limit:     Mapped[int]   = mapped_column(Integer, nullable=False, default=300)
    gap_tolerance:  Mapped[float] = mapped_column(Float, nullable=False, default=0.001)
    is_default:     Mapped[bool]  = mapped_column(Boolean, nullable=False, default=False)

    solve_results: Mapped[list[SolveResult]] = relationship(
        "SolveResult", back_populates="solver_config"
    )

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "name":          self.name,
            "backend":       self.backend,
            "time_limit":    self.time_limit,
            "gap_tolerance": self.gap_tolerance,
            "is_default":    self.is_default,
        }


# solve_results
class SolveResult(Base):
    __tablename__ = "solve_results"

    id:               Mapped[int]    = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id:         Mapped[int]    = mapped_column(Integer, ForeignKey("models.id"), nullable=False)
    version_id:       Mapped[int | None] = mapped_column(Integer, ForeignKey("model_versions.id"), nullable=True)
    solver_config_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("solver_configs.id"), nullable=True)
    status:           Mapped[str]    = mapped_column(String(30), nullable=False)
    objective_value:  Mapped[float | None] = mapped_column(Float, nullable=True)
    variables_json:   Mapped[str]    = mapped_column(Text, nullable=False, default="{}")
    solver_name:      Mapped[str]    = mapped_column(String(50), nullable=False, default="HiGHS")
    solve_time_sec:   Mapped[float]  = mapped_column(Float, nullable=False, default=0.0)
    optimality_gap:   Mapped[float | None] = mapped_column(Float, nullable=True)
    graph_snapshot:   Mapped[str]    = mapped_column(Text, nullable=False, default="{}")
    solved_at:        Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    model:         Mapped[Model]                   = relationship("Model", back_populates="solve_results")
    solver_config: Mapped[SolverConfig | None]     = relationship("SolverConfig", back_populates="solve_results")
    version:       Mapped[ModelVersion | None]     = relationship("ModelVersion")

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "model_id":         self.model_id,
            "version_id":       self.version_id,
            "solver_config_id": self.solver_config_id,
            "status":           self.status,
            "objective_value":  self.objective_value,
            "variables":        json.loads(self.variables_json) if self.variables_json else {},
            "solver_name":      self.solver_name,
            "solve_time_sec":   self.solve_time_sec,
            "optimality_gap":   self.optimality_gap,
            "solved_at":        self.solved_at.isoformat() if self.solved_at else None,
        }


# user_modules
class UserModule(Base):
    __tablename__ = "user_modules"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:        Mapped[str]      = mapped_column(String(255), nullable=False)
    code:        Mapped[str]      = mapped_column(Text, nullable=False, default="")
    description: Mapped[str]      = mapped_column(Text, nullable=False, default="")
    tags:        Mapped[str]      = mapped_column(Text, nullable=False, default="[]")
    created_at:  Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at:  Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                  default=datetime.utcnow,
                                                  onupdate=datetime.utcnow)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "name":        self.name,
            "code":        self.code,
            "description": self.description,
            "tags":        json.loads(self.tags) if self.tags else [],
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
        }
