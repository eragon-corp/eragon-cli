# Security

This repository contains only the public Eragon CLI. Do not commit tokens,
generated secrets, account-specific URLs, cookies, deployment config, or private
operational notes.

## Token Handling

- Prefer `ERAGON_TOKEN` over `--token` so bearer tokens do not appear in
  shell history or process lists.
- Prefer `ERAGON_BASE_URL` over `--base-url` so account-specific URLs do not
  appear in shell history or process lists.
- Treat `eragon keys create --key-only` output as a secret and pipe it directly
  into your secret manager when possible.
- Do not paste tokens, generated secrets, logs, screenshots, or account-specific
  URLs into public issues or shared docs.

## Reporting Issues

Report suspected security issues through your Eragon support contact. Do not
open public GitHub issues for secrets, token exposure, account-specific URLs, or
account-specific data.
