@echo off
title PhoneForensics
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up PhoneForensics, this takes a few minutes...
  %PY% -m venv .venv || (echo Please install Python 3 from https://www.python.org/downloads/ and tick "Add to PATH". & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -e . || (pause & exit /b 1)
)
".venv\Scripts\python.exe" -m phoneforensics
pause
