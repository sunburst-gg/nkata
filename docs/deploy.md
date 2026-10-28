# Deploying the server

One Fargate task runs the server behind a load balancer in ap-northeast-1. Postgres is RDS. The
store is S3. Mail is Resend. Why these: docs/decisions.md, 2026-10-28. `infra/aws/nkata.yaml`
describes all of it; `scripts/aws-deploy.sh` is the only way it changes. Every secret lives in
Secrets Manager, none in the repo.

## Once

1. The tools: the AWS CLI v2, Docker, jq. Sign in with `aws login` (or `aws configure sso`) as an
   account that may create IAM roles. `aws sts get-caller-identity` names the account.
2. The certificate: `./scripts/aws-deploy.sh cert`. It prints one CNAME. Add it in Cloudflare for
   nkata.app with the proxy off (DNS only). Run the command again until it says `ISSUED`.
3. The secrets: `./scripts/aws-deploy.sh secrets`. It asks for the Resend API key without echoing
   it and makes `LINK_SECRET` and `DISCORD_SECRET`. The database password and the store keys are
   made by the stack.
4. The first deploy: `./scripts/aws-deploy.sh deploy`. The first run takes about 15 minutes, most
   of it the database. It ends with the load balancer's name.
5. The name: in Cloudflare, a CNAME from `api` to that load balancer name, DNS only. Then
   `curl https://api.nkata.app/health` answers `{"v":1,"ok":true}`.

## Every release

`make test` green, pushed to main, then `./scripts/aws-deploy.sh deploy`. It refuses a working
tree with changes or a HEAD that is not origin/main, so the image tag names a revision anyone can
check out. The old task stops before the new one starts: about a minute without the server.
Migrations are forward only and run on start, so a deploy that adds one is safe to repeat. A task
that fails its health check rolls back by itself. To roll back by hand, check out the previous
revision and deploy it; the schema stays, since nothing drops a column.

## Looking

- `aws logs tail /nkata/server --follow`: one JSON line per event, with studio_id, project_id and
  part_id.
- `aws ecs describe-services --cluster nkata --services server`: the task and its last events.
- `aws ecs execute-command --cluster nkata --task <task id> --container server --interactive
  --command sh` opens a shell in the task (it needs the Session Manager plugin). From there
  `pnpm --filter @nkata/server exec tsx src/db/migrate.ts` runs migrations by hand.

## What is kept

The bucket stays if the stack is deleted. The database takes a final snapshot and has deletion
protection on. Backups keep seven days.

## The desktop app

Every build from CI talks to `https://api.nkata.app` (`VITE_NKATA_SERVER_URL` in
.github/workflows/desktop-build.yml). `pnpm tauri dev` keeps the local server. An app that signed
in before keeps the server it signed in to until Log out.

### Downloads, once

1. `./scripts/aws-deploy.sh downloads` makes the public bucket and the `nkata-release` role that
   only this repository's version tags can take. It prints both.
2. Tell the workflow where they are:
   ```
   gh variable set AWS_RELEASE_ROLE --body <ReleaseRoleArn>
   gh variable set DOWNLOADS_BUCKET --body nkata-downloads-<account id>
   ```

### A release

1. Set the version in `desktop/src-tauri/tauri.conf.json`, `make test`, push.
2. `git tag v<version> && git push origin v<version>`. The workflow refuses a tag that differs
   from the app's version.
3. The workflow builds a universal dmg and a Windows installer (NSIS and MSI) and puts them under
   `releases/<version>/` and at fixed names the website links to:
   - `https://nkata-downloads-<account id>.s3.ap-northeast-1.amazonaws.com/latest/Nkata-mac.dmg`
   - `.../latest/Nkata-windows-setup.exe`
   - `.../latest/Nkata-windows.msi`
   - `.../latest/version.json`

### Updates

Installed apps update themselves. A tag's release also publishes the update packages
(`Nkata.app.tar.gz` for macOS, the NSIS installer for Windows), each with a signature, and last
`latest/latest.json`, which every app checks shortly after launch and every six hours. A newer
version downloads in the background; the app shows "Nkata <version> is ready." with Restart.
Dev builds never update.

The update key signs every package. The private half and its password are the repository
secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, made on the
producer's Mac in `~/.tauri/nkata-updater.key` and `nkata-updater.password`; keep a copy of both
in the studio's password manager. The public half is `plugins.updater.pubkey` in
tauri.conf.json. Lose the private key and installed apps can no longer update: everyone would
download once more by hand.

### Signing

Unsigned until the certificates exist: Windows SmartScreen warns once, and macOS asks the person
to allow the app under System Settings, Privacy and Security.

- macOS: an Apple Developer account. Export the Developer ID Application certificate as a .p12
  and add these repository secrets: `APPLE_CERTIFICATE` (the .p12 in base64),
  `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (an
  app-specific password), `APPLE_TEAM_ID`. The next build signs and notarizes.
  https://v2.tauri.app/distribute/sign/macos/
- Windows: a code signing certificate, for example through Azure Trusted Signing, wired as
  Tauri's `signCommand`. https://v2.tauri.app/distribute/sign/windows/
