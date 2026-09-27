PY := .venv/bin/python
API_URL ?= http://localhost:8000

.PHONY: demo-seed setup dev engine web seed test lint demo-check fixtures-check fixtures reset-demo

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
	cd web && NEXT_PUBLIC_API_URL=/engine npm run build

demo: web-build
	@trap 'kill 0' INT TERM EXIT; \
	$(PY) -m uvicorn engine.app:app --port 8000 & \
	(cd web && npx next start -p 3000) & \
	sleep 3; \
	IP=$$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1); \
	echo ""; \
	echo "Muster demo (laptop): http://localhost:3000/  (engine: http://localhost:8000)"; \
	echo "Phone on the same Wi-Fi: http://$$IP:3000/m   (or open http://localhost:3000/phone for a QR code)"; \
	echo "Recording tip: click Start over first. Filled demo instead: make demo-seed"; \
	echo ""; \
	wait

demo-seed:
	curl -fsS -X POST "$(API_URL)/demo/seed?scenario=populated" && echo

# Neo4j graph database (optional; docs/api.md §7). The API falls back to the in-memory
# graph whenever Neo4j is down or not loaded. Credentials: NEO4J_URI / NEO4J_USER /
# NEO4J_PASSWORD in the environment or .env.
.PHONY: graph-up graph-load

graph-up:
	@$(PY) scripts/load_graph.py --ping >/dev/null 2>&1 || (command -v neo4j >/dev/null 2>&1 && neo4j start) || echo "neo4j not installed; start it yourself (brew install neo4j)"
	@$(PY) scripts/load_graph.py --ping --wait 60
	@$(PY) scripts/load_graph.py --if-stale

graph-load:
	$(PY) scripts/load_graph.py
