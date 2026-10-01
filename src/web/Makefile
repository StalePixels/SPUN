.PHONY: install lint typecheck test e2e e2e-reset e2e-up

node_modules: package.json pnpm-lock.yaml
	pnpm install --frozen-lockfile
	touch node_modules

install: node_modules

lint: node_modules
	pnpm exec eslint

typecheck: node_modules
	pnpm exec tsc --noEmit

test: node_modules
	pnpm exec vitest run

E2E_CMS = docker compose -p spun-e2e-cms --env-file .env.e2e-cms
E2E_SERVER = docker compose -p spun-e2e-server --env-file ../server/.env.e2e -f ../server/docker-compose.yml

# Browser tests on their own dataset: reset it, start the e2e CMS and
# SPUNServer from this tree, then run the tests. See .env.e2e.example.
e2e: node_modules e2e-reset e2e-up
	pnpm exec playwright install chromium
	pnpm exec playwright test

# Empties the e2e database and storage named in .env.e2e.
e2e-reset: node_modules
	node e2e/reset.mts

e2e-up:
	$(E2E_CMS) up -d --build --wait
	$(E2E_SERVER) up -d --build --wait
	curl -s -o /dev/null --retry 30 --retry-connrefused --retry-delay 1 "$$(sed -n 's/^E2E_BASE_URL=//p' .env.e2e)"
