.PHONY: hooks dev dev-down test addon-vendor addon ue e2e quality fixtures fixtures-v8 export-intact

# One-time: route git hooks to the repo's .githooks folder.
hooks:
	git config core.hooksPath .githooks

# Local stack: Postgres 16 and RustFS (S3) in Docker.
dev: fixtures-v8
	docker compose -f infra/docker-compose.yml up -d --wait

# The v8 fixture models, fetched once (git-ignored). The renders ship in the repo.
fixtures-v8:
	@[ -s desktop/public/fixtures/glb/Lantern.glb ] || ./scripts/fetch-fixtures.sh

dev-down:
	docker compose -f infra/docker-compose.yml down -v

# Runs every package test plus the step gate with no editor installed.
# scripts/test.sh brings up Postgres and the S3 store (Docker, or local binaries
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

# The step 1a gate. Needs Blender and UE5; see e2e/README.md.
e2e:
	python3 e2e/mirror.py --blend "$(BLEND)" --object "$(OBJECT)" --asset "$(ASSET)"

# The quality bar. Needs Blender and UE5 and a project folder set up from fixtures/. Set PROJECT.
quality:
	@test -n "$(PROJECT)" || { echo "set PROJECT to the project folder"; exit 1; }
	python3 e2e/quality.py --project "$(PROJECT)"

# The step 17 gate, Blender half: a rigged, animated, textured save reaches the server whole,
# and each loss is named. Needs Blender: NKATA_BLENDER=/path/to/Blender make export-intact
export-intact:
	e2e/export_intact.sh
