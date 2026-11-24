#!/bin/zsh
cd -- "${0:A:h}"
tree_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [[ -x .venv/bin/python ]]; then
  tree_python=.venv/bin/python
elif [[ ! -x "$tree_python" ]]; then
  tree_python=python3
fi
exec "$tree_python" scripts/editor_server.py
