from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        context = getattr(record, "context", None)
        if isinstance(context, dict):
            payload.update(context)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


class ContextAdapter(logging.LoggerAdapter):
    def process(self, msg: str, kwargs: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        extra = kwargs.setdefault("extra", {})
        context = extra.setdefault("context", {})
        if isinstance(self.extra, dict):
            context.update(self.extra)
        return msg, kwargs


def configure_logging(log_dir: Path) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    root_logger = logging.getLogger()
    if getattr(root_logger, "_sealed_nector_configured", False):
        return

    root_logger.setLevel(logging.INFO)
    formatter = JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S%z")

    file_handler = RotatingFileHandler(
        log_dir / "backend.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    root_logger.handlers.clear()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    root_logger._sealed_nector_configured = True  # type: ignore[attr-defined]


def get_logger(name: str, **context: Any) -> ContextAdapter:
    return ContextAdapter(logging.getLogger(name), context)
