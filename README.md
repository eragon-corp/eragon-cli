# Eragon CLI

Customer command-line tool for Eragon-managed Anthropic workspace API keys.

The CLI requires Node.js 18 or newer and has no runtime package dependencies.
It talks to Eragon's managed key API at `https://api-keys.eragon.ai`.

## Install

Install directly from this public GitHub repository:

```bash
npm install -g github:eragon-corp/eragon-cli
```

Verify the command:

```bash
eragon --help
```

## Usage

Prefer `ERAGON_KEYGEN_TOKEN` over `--token` so bearer tokens do not appear in
shell history or process lists.

```bash
export ERAGON_KEYGEN_TOKEN='service-token-from-eragon'

eragon workspaces list

eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key \
  --idempotency-key request-uuid-or-lumos-request-id

eragon keys get \
  --workspace wrkspc_xxx \
  --key apikey_xxx \
  --from 2026-06-01 \
  --to 2026-07-01

eragon keys list \
  --workspace wrkspc_xxx \
  --from 2026-06-01 \
  --to 2026-07-01
```

Print raw JSON for automation:

```bash
eragon --json keys list --workspace wrkspc_xxx
```

Pipe the newly shown API key directly into a secret manager:

```bash
eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key \
  --idempotency-key request-uuid-or-lumos-request-id \
  --key-only
```

## Local Development

```bash
npm test
npm install -g .
eragon --help
```

## Security

See [SECURITY.md](SECURITY.md). Do not paste generated API keys or Eragon
service tokens into Slack, tickets, logs, screenshots, or shared docs.
