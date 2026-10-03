.PHONY: hooks dev dev-down test addon-vendor addon ue e2e fixtures

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

# Copy the generated shared Python types into the add-on as nkata.nkata_shared.
addon-vendor:
	rm -rf blender-addon/nkata/nkata_shared
	cp -r shared/py blender-addon/nkata/nkata_shared

# Symlink the add-on into Blender's extensions folder. Reload with F3 "Reload Scripts".
# Set BLENDER_EXTENSIONS to the user extensions folder of your Blender install.
addon: addon-vendor
	@test -n "$(BLENDER_EXTENSIONS)" || { echo "set BLENDER_EXTENSIONS, for example ~/Library/Application Support/Blender/4.2/extensions/user_default"; exit 1; }
	ln -sfn "$(CURDIR)/blender-addon" "$(BLENDER_EXTENSIONS)/nkata"

# Symlink the UE5 plugin into a test project's Plugins folder. Set UE_PROJECT.
ue:
	@test -n "$(UE_PROJECT)" || { echo "set UE_PROJECT to the folder holding the .uproject"; exit 1; }
	mkdir -p "$(UE_PROJECT)/Plugins"
	ln -sfn "$(CURDIR)/ue5-plugin" "$(UE_PROJECT)/Plugins/Nkata"

# Rebuild the fixture corpus from its recipe. Deterministic; see fixtures/README.md.
fixtures:
	python3 fixtures/build.py

# The step 1 gate. Needs Blender and UE5; see e2e/README.md.
e2e:
	python3 e2e/mirror.py --blend "$(BLEND)" --object "$(OBJECT)" --asset "$(ASSET)"
