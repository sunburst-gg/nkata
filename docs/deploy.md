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

The app signs in against the server the session names. For the pilot, the sign in screen's
server field is `https://api.nkata.app`; the agent then uses the same address.
