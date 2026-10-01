.PHONY: hooks dev dev-down test

# One-time: route git hooks to the repo's .githooks folder.
hooks:
	git config core.hooksPath .githooks

# Local stack: Postgres 16 and MinIO in Docker.
dev:
	docker compose -f infra/docker-compose.yml up -d --wait

dev-down:
	docker compose -f infra/docker-compose.yml down -v

# Runs every package test plus the step gate with no editor installed.
# scripts/test.sh brings up Postgres and MinIO (Docker, or local binaries
# when Docker is absent), starts the server, and tears it all down.
test:
	./scripts/test.sh
