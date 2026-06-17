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

## Create a Workspace

Create a new workspace:

```bash
eragon workspaces create --name example-workspace
```

The response includes a `workspace_id`. Save it for later key operations.

## List Workspaces

List workspaces authorized for the configured token:

```bash
eragon workspaces list
```

For automation, return raw JSON:

```bash
eragon --json workspaces list
```

## Create a Key

Create a key in a workspace:

```bash
eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key
```

The `--name` value is a human-readable label for the key.
`eragon keys create` automatically sends a unique request id for safe retries.

Pipe the newly shown secret directly into a secret manager:

```bash
eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key \
  --key-only
```

Store the generated secret immediately. Newly created key secrets are typically
shown only once.

## Get Key Detail

Fetch one key and its usage for a date range:

```bash
eragon keys get \
  --workspace wrkspc_xxx \
  --key apikey_xxx \
  --from 2026-06-01 \
  --to 2026-07-01
```

## List Workspace Keys

List all keys in a workspace for a date range:

```bash
eragon keys list \
  --workspace wrkspc_xxx \
  --from 2026-06-01 \
  --to 2026-07-01
```

For automation, return raw JSON:

```bash
eragon --json keys list --workspace wrkspc_xxx
```

## Verify a Token

Run `eragon workspaces list` to confirm the configured token can access at
least one workspace.

## Local Development

```bash
npm test
npm install -g .
eragon --help
```

## Security

See [SECURITY.md](SECURITY.md). Do not paste tokens, generated secrets, logs,
screenshots, or account-specific URLs into public issues or shared docs.
