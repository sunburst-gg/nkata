# Deploying the server

One Fly machine runs the server. Postgres is Fly Postgres. The store is Cloudflare R2. Mail is
Resend. Why these: docs/decisions.md, 2026-10-19. Every secret lives in Fly, none in the repo.

## Once

1. The bucket. With `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment:
   `./scripts/r2-bucket.sh`. It prints the three S3 settings. Make an R2 API token in the
   Cloudflare dashboard (R2, Manage API tokens, Object Read and Write on the bucket) for the keys.
2. The app and the database:
   ```
   fly apps create nkata-api
   fly postgres create --name nkata-db --region nrt --vm-size shared-cpu-1x --initial-cluster-size 1
   fly postgres attach nkata-db --app nkata-api
   ```
   The attach step sets `DATABASE_URL` on the app.
3. The secrets, in one call so the machine restarts once:
   ```
   fly secrets set --app nkata-api \
     S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com \
     S3_ACCESS_KEY=... S3_SECRET_KEY=... \
     RESEND_API_KEY=re_... "MAIL_FROM=Nkata <code@nkata.app>" \
     LINK_SECRET=$(openssl rand -hex 24) DISCORD_SECRET=$(openssl rand -hex 24)
   ```
4. The name. `fly certs add api.nkata.app --app nkata-api`, then at the DNS host a CNAME from
   `api` to `nkata-api.fly.dev`. `fly certs check api.nkata.app` says when it is live.
5. Deploy from the repo root: `fly deploy`. The server migrates and ensures the bucket on start.
   `curl https://api.nkata.app/health` answers `{"v":1,"ok":true}`.

## Every release

`make test` green, pushed to main, then `fly deploy`. Migrations are forward only and run on
start, so a deploy that adds one is safe to repeat. Roll back with `fly releases` and
`fly deploy --image <the previous image>`; the schema stays, since nothing drops a column.

## Looking

- `fly logs --app nkata-api`: one JSON line per event, with studio_id, project_id and part_id.
- `fly status --app nkata-api`: the machine and its last health check.
- `fly ssh console --app nkata-api` then `pnpm --filter @nkata/server exec tsx src/db/migrate.ts`
  to run migrations by hand if a deploy stopped before listening.

## The desktop app

The app signs in against the server the session names. For the pilot, the sign in screen's
server field is `https://api.nkata.app`; the agent then uses the same address.
