#!/bin/sh
# Полный регрессионный прогон перед коммитом/ревью. Те же проверки выполняет CI перед деплоем.
set -e
cd "$(dirname "$0")/.."
PY="${PYTHON:-.venv/bin/python}"; [ -x "$PY" ] || PY=python3
echo "== Node: логика просмотрщика, раскладка, языки, контракты, эталон дерева"; node tests/test_card_layout.cjs
echo "== Сборка для Firebase"; "$PY" tests/test_hosted_build.py
echo "== Локальный редактор"; "$PY" tests/test_editor.py
echo "== Браузерные тесты (синтетические данные)"; "$PY" tests/test_e2e.py
git diff --check
echo "Все проверки пройдены."
