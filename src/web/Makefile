.PHONY: install lint typecheck test e2e e2e-reset e2e-up e2e-down

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

# Browser tests on their own dataset: reset it, start the e2e CMS and
# SPUNServer from this tree, run the tests, and stop both servers again,
# also after a failure. See .env.e2e.example.
e2e: node_modules e2e-reset
	pnpm exec playwright install chromium
	trap '$(MAKE) e2e-down' EXIT; $(MAKE) e2e-up && pnpm exec playwright test

# Empties the e2e database, storage and Redis keys named in .env.e2e and .env.e2e-cms.
e2e-reset: node_modules
	node e2e/reset.mts

# For a single spec: make e2e-up, pnpm exec playwright test <spec>, make e2e-down.
e2e-up:
	$(E2E_CMS) up -d --build --wait
	$(MAKE) -C ../server e2e-up
	curl -s -o /dev/null --retry 30 --retry-connrefused --retry-delay 1 "$$(sed -n 's/^E2E_BASE_URL=//p' .env.e2e)"

e2e-down:
	$(E2E_CMS) down
	$(MAKE) -C ../server e2e-down
