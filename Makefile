.PHONY: install dev build build-firefox test zip zip-firefox ci deploy deploy-local deploy-zip

install:
	npm install

dev:
	npm run dev

build:
	npm run build

build-firefox:
	npm run build:firefox

test:
	npm test

zip:
	npm run zip

zip-firefox:
	npm run zip:firefox

ci: test build build-firefox

# One-click local deliverable (extension load folders)
deploy deploy-local: ci
	@echo "Chrome : .output/chrome-mv3"
	@echo "Firefox: .output/firefox-mv2"

deploy-zip pack: 
	node scripts/pack.mjs

pack-fast:
	node scripts/pack.mjs --skip-test
