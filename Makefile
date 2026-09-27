PY := .venv/bin/python
API_URL ?= http://localhost:8000

.PHONY: setup dev engine web seed test lint demo-check fixtures-check fixtures reset-demo

setup:
	@test -x $(PY) || uv venv --python 3.12 .venv
	uv pip install --python $(PY) -r engine/requirements.txt
	@if [ -f web/package.json ]; then cd web && npm install; else echo "web/package.json not found; skipping web install"; fi

dev:
	@if [ -f web/package.json ]; then trap 'kill 0' INT TERM EXIT; $(PY) -m uvicorn engine.app:app --reload --port 8000 & (cd web && npm run dev -- --port 3000) & wait; else echo "web/package.json not found; running engine only"; $(PY) -m uvicorn engine.app:app --reload --port 8000; fi

engine:
	$(PY) -m uvicorn engine.app:app --reload --port 8000

web:
	cd web && npm run dev -- --port 3000

seed:
	$(PY) -m engine.seed

test:
	$(PY) -m pytest engine/tests -q

lint:
	$(PY) -m ruff check engine scripts
	@if [ -f web/package.json ]; then cd web && npm run lint; else echo "web/package.json not found; skipping web lint"; fi

demo-check:
	$(PY) scripts/demo_check.py --api $(API_URL)

fixtures-check:
	$(PY) scripts/demo_check.py --fixtures

fixtures:
	$(PY) scripts/build_fixtures.py

reset-demo:
	curl -fsS -X POST $(API_URL)/demo/reset && echo

.PHONY: web-build demo

web-build:
	cd web && npm run build

demo: web-build
	@trap 'kill 0' INT TERM EXIT; \
	$(PY) -m uvicorn engine.app:app --port 8000 & \
	(cd web && npx next start -p 3000) & \
	sleep 3; \
	echo ""; \
	echo "Muster demo: http://localhost:3000/program  (engine: http://localhost:8000)"; \
	echo "Recording tip: click Reset demo first"; \
	echo ""; \
	wait
