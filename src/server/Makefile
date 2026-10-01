.PHONY: install build test e2e-up e2e-down

node_modules: package.json pnpm-lock.yaml
	pnpm install --frozen-lockfile
	touch node_modules

install: node_modules

build: node_modules
	rm -rf build
	pnpm exec tsc -p tsconfig.json

test: build
	node --test "build/server/test/**/*.test.js"

E2E = docker compose -p spun-e2e-server --env-file .env.e2e

# The e2e SPUNServer (settings in .env.e2e), started only while tests need it.
e2e-up:
	$(E2E) up -d --build --wait

e2e-down:
	$(E2E) down
