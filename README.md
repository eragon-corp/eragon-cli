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
eragon workspaces create \
  --name example-workspace \
  --cost-limit 500
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
  --name example-project-key \
  --cost-limit 125
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

## Cost Limits

Create workspaces or keys with an initial advisory monthly USD limit:

```bash
eragon workspaces create \
  --name example-workspace \
  --cost-limit 500

eragon keys create \
  --workspace wrkspc_xxx \
  --name example-project-key \
  --cost-limit 125
```

Set or clear a workspace limit:

```bash
eragon workspaces set-limit \
  --workspace wrkspc_xxx \
  --limit 500

eragon workspaces clear-limit \
  --workspace wrkspc_xxx
```

Set or clear an API-key limit:

```bash
eragon keys set-limit \
  --workspace wrkspc_xxx \
  --key apikey_xxx \
  --limit 125

eragon keys clear-limit \
  --workspace wrkspc_xxx \
  --key apikey_xxx
```

## Archive Keys and Workspaces

Archive keys instead of deleting them, so historical usage and cost data remains
available.

Archive one key:

```bash
eragon keys archive \
  --workspace wrkspc_xxx \
  --key apikey_xxx
```

Archive a batch of keys:

```bash
eragon keys archive-bulk \
  --workspace wrkspc_xxx \
  --keys apikey_xxx,apikey_yyy \
  --reason cleanup
```

Archive an empty workspace after its API keys are archived:

```bash
eragon workspaces archive \
  --workspace wrkspc_xxx
```

## Export Daily Usage

Fetch materialized daily API-key usage. Pass `--date` explicitly for repeatable
exports:

```bash
eragon analytics api-key-usage daily --date 2026-06-17
```

Filter to one workspace when needed:

```bash
eragon analytics api-key-usage daily \
  --date 2026-06-17 \
  --workspace wrkspc_xxx
```

Fetch workspace-level daily rollups:

```bash
eragon analytics workspace-usage daily --date 2026-06-17
```

For Snowflake, Looker, or other automation, return raw JSON:

```bash
eragon analytics workspace-usage daily \
  --date 2026-06-17 \
  --format json
```

Export flattened CSV to stdout and redirect it to a file:

```bash
eragon analytics api-key-usage daily \
  --date 2026-06-17 \
  --format csv > api-key-usage-2026-06-17.csv
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
