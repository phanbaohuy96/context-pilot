SHELL := /bin/bash
.DEFAULT_GOAL := help

TEST_FILE ?=
TEST_NAME ?=

.PHONY: help install services-up services-down db-generate db-migrate db-studio dev dev-web dev-worker build typecheck test test-watch test-file test-name verify

help:
	@printf "Teams Discovery Observer commands:\n"
	@printf "  make install                 Install npm dependencies\n"
	@printf "  make services-up             Start local Postgres and Redis\n"
	@printf "  make services-down           Stop local Postgres and Redis\n"
	@printf "  make db-generate             Generate Prisma client\n"
	@printf "  make db-migrate              Run Prisma migrations\n"
	@printf "  make db-studio               Open Prisma Studio\n"
	@printf "  make dev                     Start the Next.js web app\n"
	@printf "  make dev-web                 Start the Next.js web app\n"
	@printf "  make dev-worker              Start the BullMQ worker\n"
	@printf "  make build                   Build all workspaces\n"
	@printf "  make typecheck               Run TypeScript checks\n"
	@printf "  make test                    Run all tests\n"
	@printf "  make test-watch              Run tests in watch mode\n"
	@printf "  make test-file TEST_FILE=... Run one test file\n"
	@printf "  make test-name TEST_NAME=... Run tests matching a name\n"
	@printf "  make verify                  Run typecheck, tests, and build\n"

install:
	npm install

services-up:
	docker compose up -d

services-down:
	docker compose down

db-generate:
	npm run db:generate

db-migrate:
	npm run db:migrate

db-studio:
	npm run db:studio

dev: dev-web

dev-web:
	set -a; [ ! -f .env ] || source .env; set +a; npm run dev:web

dev-worker:
	set -a; [ ! -f .env ] || source .env; set +a; npm run dev:worker

build:
	npm run build

typecheck:
	npm run typecheck

test:
	npm test

test-watch:
	npm test -- --watch

test-file:
	@if [ -z "$(TEST_FILE)" ]; then printf "Usage: make test-file TEST_FILE=packages/graph/src/resources.test.ts\n" >&2; exit 2; fi
	npm test -- "$(TEST_FILE)"

test-name:
	@if [ -z "$(TEST_NAME)" ]; then printf "Usage: make test-name TEST_NAME='Graph resources'\n" >&2; exit 2; fi
	npm test -- -t "$(TEST_NAME)"

verify: typecheck test build
