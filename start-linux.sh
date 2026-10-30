#!/bin/bash
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "First run: setting up PhoneForensics, this takes a few minutes..."
  python3 -m venv .venv || { echo "Please install Python 3 from https://www.python.org/downloads/"; read -r; exit 1; }
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -e . || { read -r; exit 1; }
fi
exec .venv/bin/python -m phoneforensics
