@echo off
title PhoneForensics
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
if not exist ".venv\Scripts\python.exe" (
  echo First run: setting up PhoneForensics. This takes a few minutes...
  %PY% -m venv .venv || (echo Please install Python 3.10 or newer from https://www.python.org/downloads/ and tick "Add python.exe to PATH". & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.lock || (pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --no-deps -e . || (pause & exit /b 1)
)
".venv\Scripts\python.exe" -m phoneforensics
pause
