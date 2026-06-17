# Eragon CLI

Command-line tools for Eragon workflows.

The CLI requires Node.js 18 or newer and has no runtime package dependencies.

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

Configure the API URL and token provided by Eragon:

```bash
export ERAGON_BASE_URL='https://your-eragon-api-url'
export ERAGON_TOKEN='token-from-eragon'
```

Prefer environment variables over command-line flags so bearer tokens and
account-specific URLs do not appear in shell history or process lists.

```bash
eragon workspaces create --name example-workspace

eragon workspaces list

eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key

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

Pipe newly shown secrets directly into a secret manager:

```bash
eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key \
  --key-only
```

`eragon keys create` automatically sends a unique request id for safe retries.

## Local Development

```bash
npm test
npm install -g .
eragon --help
```

## Security

See [SECURITY.md](SECURITY.md). Do not paste tokens, generated secrets, logs,
screenshots, or account-specific URLs into public issues or shared docs.
