# Security

This repository contains only the customer-facing Eragon CLI. Do not commit
service tokens, generated Anthropic API keys, cookies, deployment config, or
private operational notes.

## Token Handling

- Prefer `ERAGON_KEYGEN_TOKEN` over `--token` so bearer tokens do not appear in
  shell history or process lists.
- Do not override `--base-url` unless Eragon support explicitly asks you to use a
  different endpoint.
- Treat `eragon keys create --key-only` output as a secret and pipe it directly
  into your secret manager when possible.
- Do not paste generated API keys or Eragon service tokens into Slack, tickets,
  logs, screenshots, or shared docs.

## Reporting Issues

Report suspected security issues through your Eragon support contact. Do not
open public GitHub issues for secrets, token exposure, or account-specific data.
