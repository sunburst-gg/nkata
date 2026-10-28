#!/usr/bin/env bash
# Deploys the server to AWS (docs/deploy.md). Three steps, each safe to run again:
#   ./scripts/aws-deploy.sh cert      requests the certificate and prints the DNS record it needs
#   ./scripts/aws-deploy.sh secrets   stores the Resend key and makes the link and Discord secrets
#   ./scripts/aws-deploy.sh deploy    builds the image of HEAD, pushes it, updates the stack
# Credentials come from the AWS CLI's own sign in (aws login), never from the repo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AWS_REGION="${AWS_REGION:-ap-northeast-1}"
DOMAIN="${NKATA_DOMAIN:-api.nkata.app}"
STACK=nkata
REPO=nkata-server
APP_SECRET=nkata/app
for tool in aws docker jq; do command -v "$tool" >/dev/null || { echo "$tool is not installed"; exit 1; }; done

cert_arn() {
  aws acm list-certificates --certificate-statuses PENDING_VALIDATION ISSUED \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text | grep -v '^None$' || true
}

cert() {
  local arn record
  arn=$(cert_arn)
  [ -n "$arn" ] || arn=$(aws acm request-certificate --domain-name "$DOMAIN" --validation-method DNS \
    --idempotency-token nkata --query CertificateArn --output text)
  # The record appears a few seconds after the request.
  for _ in $(seq 1 20); do
    record=$(aws acm describe-certificate --certificate-arn "$arn" \
      --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json)
    [ "$record" != "null" ] && break
    sleep 2
  done
  echo "Certificate: $(aws acm describe-certificate --certificate-arn "$arn" --query Certificate.Status --output text)"
  echo "$record" | jq -r '"Add at the DNS host, DNS only:\n  Type  CNAME\n  Name  \(.Name)\n  Value \(.Value)"'
}

secrets() {
  local key current
  read -rsp "Resend API key: " key && echo
  [[ "$key" == re_* ]] || { echo "a Resend key starts with re_"; exit 1; }
  if current=$(aws secretsmanager get-secret-value --secret-id "$APP_SECRET" --query SecretString --output text 2>/dev/null); then
    aws secretsmanager put-secret-value --secret-id "$APP_SECRET" \
      --secret-string "$(echo "$current" | jq -c --arg k "$key" '.RESEND_API_KEY = $k')" >/dev/null
  else
    aws secretsmanager create-secret --name "$APP_SECRET" --secret-string "$(jq -nc --arg k "$key" \
      --arg l "$(openssl rand -hex 24)" --arg d "$(openssl rand -hex 24)" \
      '{RESEND_API_KEY: $k, LINK_SECRET: $l, DISCORD_SECRET: $d}')" >/dev/null
  fi
  echo "Stored in $APP_SECRET."
}

deploy() {
  cd "$ROOT"
  # Only what is on main goes out, so the image tag names a revision anyone can check out.
  [ -z "$(git status --porcelain)" ] || { echo "the working tree has changes; deploy a clean HEAD"; exit 1; }
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD is not origin/main"; exit 1; }

  local account registry tag image arn app_secret vpc subnets
  account=$(aws sts get-caller-identity --query Account --output text)
  registry="$account.dkr.ecr.$AWS_REGION.amazonaws.com"
  tag=$(git rev-parse --short=12 HEAD)
  image="$registry/$REPO:$tag"

  arn=$(cert_arn)
  [ -n "$arn" ] || { echo "no certificate for $DOMAIN; run: $0 cert"; exit 1; }
  [ "$(aws acm describe-certificate --certificate-arn "$arn" --query Certificate.Status --output text)" = ISSUED ] \
    || { echo "the certificate is not issued yet; check the DNS record from: $0 cert"; exit 1; }
  app_secret=$(aws secretsmanager describe-secret --secret-id "$APP_SECRET" --query ARN --output text 2>/dev/null) \
    || { echo "no $APP_SECRET secret; run: $0 secrets"; exit 1; }

  vpc=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
  [ "$vpc" != None ] || { echo "no default VPC in $AWS_REGION; make one with: aws ec2 create-default-vpc"; exit 1; }
  subnets=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" Name=default-for-az,Values=true \
    --query 'Subnets[].SubnetId' --output text | tr '\t' ',')

  aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$REPO" --image-scanning-configuration scanOnPush=true >/dev/null
  aws ecr get-login-password | docker login --username AWS --password-stdin "$registry" >/dev/null
  docker buildx build --platform linux/arm64 -f server/Dockerfile -t "$image" --push .

  aws cloudformation deploy --stack-name "$STACK" --template-file infra/aws/nkata.yaml \
    --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
    --parameter-overrides "VpcId=$vpc" "SubnetIds=$subnets" "ImageUri=$image" \
      "CertificateArn=$arn" "AppSecretArn=$app_secret" "PublicUrl=https://$DOMAIN"
  aws ecs wait services-stable --cluster nkata --services server

  local lb
  lb=$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDns'].OutputValue" --output text)
  echo "Deployed $tag."
  echo "DNS, once: CNAME $DOMAIN -> $lb (DNS only)"
  curl -sf "https://$DOMAIN/health" && echo || echo "https://$DOMAIN/health does not answer yet"
}

case "${1:-}" in
  cert) cert ;;
  secrets) secrets ;;
  deploy) deploy ;;
  *) echo "usage: $0 cert|secrets|deploy"; exit 1 ;;
esac
