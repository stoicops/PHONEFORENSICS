#!/bin/bash
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "First run: setting up PhoneForensics. This takes a few minutes..."
  python3 -m venv .venv || { echo "Please install Python 3.10 or newer from https://www.python.org/downloads/"; read -r; exit 1; }
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.lock || { read -r; exit 1; }
  .venv/bin/python -m pip install --no-deps -e . || { read -r; exit 1; }
fi
exec .venv/bin/python -m phoneforensics
