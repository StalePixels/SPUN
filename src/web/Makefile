.PHONY: install lint typecheck test e2e

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

# Browser tests against the running CMS set in .env.e2e (see .env.e2e.example).
e2e: node_modules
	pnpm exec playwright install chromium
	pnpm exec playwright test
