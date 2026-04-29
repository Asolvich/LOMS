"""
LOMS Database — session factory, initialization, migrations
Week 1: create_all + seed default solver config
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, SolverConfig, Model


# Engine setup
def get_db_path() -> Path:
    """
    Determine database file path.
    Priority:
      1. LOMS_DB_PATH env var  (for testing / custom installs)
      2. Electron userData path passed via LOMS_USER_DATA env var
      3. ./loms_data/loms.db   (dev fallback)
    """
    if env_path := os.environ.get("LOMS_DB_PATH"):
        return Path(env_path)
    if user_data := os.environ.get("LOMS_USER_DATA"):
        p = Path(user_data) / "loms.db"
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    fallback = Path(__file__).parent.parent.parent / "loms_data" / "loms.db"
    fallback.parent.mkdir(parents=True, exist_ok=True)
    return fallback


_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        db_path = get_db_path()
        _engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
            echo=False,
        )
        # Enable WAL mode and foreign keys for SQLite
        from sqlalchemy import event as sa_event

        @sa_event.listens_for(_engine, "connect")
        def set_sqlite_pragma(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


def get_session() -> Session:
    return get_session_factory()()


# Initialization
def init_db() -> dict:
    """
    Create all tables if they don't exist.
    Seed default solver config if table is empty.
    Returns a status dict for IPC response.
    """
    engine = get_engine()
    Base.metadata.create_all(engine)

    with get_session() as session:
        # Seed default solver config
        if session.query(SolverConfig).count() == 0:
            session.add(SolverConfig(
                name="По умолчанию",
                backend="highs",
                time_limit=300,
                gap_tolerance=0.001,
                is_default=True,
            ))
            session.add(SolverConfig(
                name="Быстрый (30 сек)",
                backend="highs",
                time_limit=30,
                gap_tolerance=0.01,
                is_default=False,
            ))
            session.add(SolverConfig(
                name="Точный (15 мин)",
                backend="highs",
                time_limit=900,
                gap_tolerance=0.0,
                is_default=False,
            ))
            session.commit()

    db_path = get_db_path()
    return {
        "status": "OK",
        "db_path": str(db_path),
        "message": "База данных инициализирована",
    }
