.PHONY: hooks dev test
hooks:
	git config core.hooksPath .githooks
dev:
	docker compose -f infra/docker-compose.yml up -d
test:
	pnpm -r test && cargo test --workspace
