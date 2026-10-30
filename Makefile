# Developer shortcuts. End users never need these: they use the Start PhoneForensics launchers.
PY ?= .venv/bin/python

.PHONY: setup start dev lint format typecheck test test-e2e check build lock

setup:            ## create .venv and install everything needed for development
	python3 -m venv .venv
	$(PY) -m pip install -r requirements-dev.lock
	$(PY) -m pip install --no-deps -e .
	npm ci
	npx playwright install chromium

start:            ## run the app like an end user would
	$(PY) -m phoneforensics

dev:              ## run without opening a browser, with debug logging
	$(PY) -m phoneforensics --no-browser --log-level DEBUG

lint:
	$(PY) -m ruff check src tests/python
	$(PY) -m ruff format --check src tests/python
	npm run lint

format:
	$(PY) -m ruff check --fix src tests/python
	$(PY) -m ruff format src tests/python
	npm run format

typecheck:
	$(PY) -m mypy
	npm run typecheck

test:
	$(PY) -m pytest --cov --cov-fail-under=85
	npm test

test-e2e:
	npm run test:e2e

check: lint typecheck test test-e2e build   ## everything CI runs

build:            ## build the wheel and source distribution into dist/
	$(PY) -m build

lock:             ## refresh requirements*.lock after changing dependencies in pyproject.toml
	uv pip compile --universal pyproject.toml -o requirements.lock
	uv pip compile --universal pyproject.toml --extra dev -o requirements-dev.lock
