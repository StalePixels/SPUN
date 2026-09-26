.PHONY: install build test

node_modules: package.json pnpm-lock.yaml
	pnpm install --frozen-lockfile
	touch node_modules

install: node_modules

build: node_modules
	rm -rf build
	pnpm exec tsc -p tsconfig.json

test: build
	node --test "build/server/test/**/*.test.js"
