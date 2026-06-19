#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_SECONDS = 30;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 2;
  }
}

class RequestError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 1;
  }
}

function stripTrailingSlash(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new UsageError("base URL cannot be blank");
  }
  return normalized;
}

function tokenFromEnv(env) {
  return env.ERAGON_TOKEN || "";
}

function generatedIdempotencyKey() {
  return `eragon-cli-${randomUUID()}`;
}

function optionKey(name) {
  return name
    .replace(/^--/, "")
    .replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function requireValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new UsageError(`${optionName} requires a value`);
  }
  return value;
}

function parseUsd(value, optionName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new UsageError(`${optionName} must be a non-negative number`);
  }
  return amount;
}

function commandNameFromArgv(argv1) {
  if (!argv1) {
    return "eragon";
  }
  const name = basename(argv1);
  return name === "eragon-keys.js" ? "eragon" : name;
}

export function parseArgs(argv, env = process.env, commandName = "eragon") {
  const configuredBaseUrl = baseUrlFromEnv(env);
  const options = {
    baseUrl: configuredBaseUrl ? stripTrailingSlash(configuredBaseUrl) : "",
    token: tokenFromEnv(env),
    timeout: DEFAULT_TIMEOUT_SECONDS,
    json: false,
    keyOnly: false,
    includeCost: undefined,
    format: "table",
    help: false,
    commandName,
  };
  const commands = [];
  const valueOptions = new Set([
    "--base-url",
    "--token",
    "--timeout",
    "--workspace",
    "--name",
    "--idempotency-key",
    "--key",
    "--from",
    "--to",
    "--date",
    "--format",
    "--cost-limit",
    "--limit",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
      options.format = "json";
    } else if (arg === "--key-only") {
      options.keyOnly = true;
    } else if (arg === "--include-cost") {
      options.includeCost = true;
    } else if (arg === "--no-cost") {
      options.includeCost = false;
    } else if (valueOptions.has(arg)) {
      const value = requireValue(argv, index, arg);
      index += 1;
      if (arg === "--base-url") {
        options.baseUrl = stripTrailingSlash(value);
      } else if (arg === "--timeout") {
        options.timeout = Number(value);
        if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
          throw new UsageError("--timeout must be a positive number");
        }
      } else if (arg === "--format") {
        options.format = parseFormat(value);
        options.json = options.format === "json";
      } else if (arg === "--cost-limit" || arg === "--limit") {
        options.costLimit = parseUsd(value, arg);
      } else {
        options[optionKey(arg)] = value;
      }
    } else if (arg.startsWith("-")) {
      throw new UsageError(`unknown option: ${arg}`);
    } else {
      commands.push(arg);
    }
  }

  options.resource = commands[0] || "";
  options.command = commands[1] || "";
  options.subcommand = commands[2] || "";
  if (commands.length > 2 && options.resource !== "analytics") {
    throw new UsageError(`unexpected argument: ${commands[2]}`);
  }
  if (commands.length > 3) {
    throw new UsageError(`unexpected argument: ${commands[3]}`);
  }
  return options;
}

function parseFormat(value) {
  const format = String(value || "").toLowerCase();
  if (!["table", "json", "csv"].includes(format)) {
    throw new UsageError("--format must be one of: table, json, csv");
  }
  return format;
}

function topHelp(commandName) {
  return `Usage: ${commandName} [options] <resource> <command>

Command-line tools for Eragon workflows.

Required setup:
  export ERAGON_BASE_URL='https://your-eragon-api-url'
  export ERAGON_TOKEN='token-from-eragon'

Resources:
  workspaces        Workspace commands
  keys              Workspace API-key commands
  analytics         Daily analytics export commands

Options:
  --base-url URL    Defaults to ERAGON_BASE_URL
  --token TOKEN     Defaults to ERAGON_TOKEN
  --timeout SEC     Request timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SECONDS}
  --format FORMAT   table, json, or csv where supported
  --json            Alias for --format json
  -h, --help        Show help
`;
}

function setupHelp() {
  return `Required setup:
  export ERAGON_BASE_URL='https://your-eragon-api-url'
  export ERAGON_TOKEN='token-from-eragon'
`;
}

function workspacesHelp(commandName) {
  return `Usage: ${commandName} workspaces <command>

Commands:
  create            Create a workspace
  list              List authorized workspaces
  set-limit         Set a workspace cost limit
  clear-limit       Clear a workspace cost limit
`;
}

function workspacesCreateHelp(commandName) {
  return `Usage: ${commandName} workspaces create --name NAME [--cost-limit USD]

Create a new workspace.

${setupHelp()}
Options:
  --name NAME       New workspace name
  --cost-limit USD  Optional advisory monthly USD cost limit
  --base-url URL    Override ERAGON_BASE_URL for this command
  --token TOKEN     Override ERAGON_TOKEN for this command

Example:
  ${commandName} workspaces create --name example-workspace --cost-limit 500
`;
}

function workspacesListHelp(commandName) {
  return `Usage: ${commandName} workspaces list

Lists workspaces authorized for the configured token.

${setupHelp()}
Options:
  --base-url URL    Override ERAGON_BASE_URL for this command
  --token TOKEN     Override ERAGON_TOKEN for this command
`;
}

function workspacesSetLimitHelp(commandName) {
  return `Usage: ${commandName} workspaces set-limit --workspace ID --limit USD

Set an advisory monthly USD cost limit for a workspace.

${setupHelp()}
Options:
  --workspace ID    Workspace id
  --limit USD       Advisory monthly USD cost limit
`;
}

function workspacesClearLimitHelp(commandName) {
  return `Usage: ${commandName} workspaces clear-limit --workspace ID

Clear the advisory monthly USD cost limit for a workspace.

${setupHelp()}
Options:
  --workspace ID    Workspace id
`;
}

function keysHelp(commandName) {
  return `Usage: ${commandName} keys <command>

Commands:
  create            Create an API key in an authorized workspace
  get               Get one workspace API key with analytics
  list              List API keys in an authorized workspace
  set-limit         Set an API-key cost limit
  clear-limit       Clear an API-key cost limit
`;
}

function keysCreateHelp(commandName) {
  return `Usage: ${commandName} keys create --workspace ID --name NAME [options]

Create a new API key in an authorized workspace.

${setupHelp()}
Options:
  --workspace ID          Workspace id, for example wrkspc_xxx
  --name NAME             Human-readable name for the new API key
  --cost-limit USD        Optional advisory monthly USD cost limit
  --key-only              Print only the newly shown API key secret
  --base-url URL          Override ERAGON_BASE_URL for this command
  --token TOKEN           Override ERAGON_TOKEN for this command

Example:
  ${commandName} keys create --workspace wrkspc_xxx --name example-project-key --cost-limit 125
`;
}

function keysListHelp(commandName) {
  return `Usage: ${commandName} keys list --workspace ID [options]

List API keys in an authorized workspace.

${setupHelp()}
Options:
  --workspace ID    Workspace id
  --from DATE       Inclusive start date, YYYY-MM-DD
  --to DATE         Exclusive end date, YYYY-MM-DD
  --include-cost    Request cost enrichment explicitly
  --no-cost         Skip Console usage-cost enrichment
`;
}

function keysGetHelp(commandName) {
  return `Usage: ${commandName} keys get --workspace ID --key ID [options]

Get one API key with usage details.

${setupHelp()}
Options:
  --workspace ID    Workspace id
  --key ID          API-key id
  --from DATE       Inclusive start date, YYYY-MM-DD
  --to DATE         Exclusive end date, YYYY-MM-DD
  --include-cost    Request cost enrichment explicitly
  --no-cost         Skip Console usage-cost enrichment
`;
}

function keysSetLimitHelp(commandName) {
  return `Usage: ${commandName} keys set-limit --workspace ID --key ID --limit USD

Set an advisory monthly USD cost limit for one API key.

${setupHelp()}
Options:
  --workspace ID    Workspace id
  --key ID          API-key id
  --limit USD       Advisory monthly USD cost limit
`;
}

function keysClearLimitHelp(commandName) {
  return `Usage: ${commandName} keys clear-limit --workspace ID --key ID

Clear the advisory monthly USD cost limit for one API key.

${setupHelp()}
Options:
  --workspace ID    Workspace id
  --key ID          API-key id
`;
}

function analyticsHelp(commandName) {
  return `Usage: ${commandName} analytics <command> daily [options]

Commands:
  api-key-usage     Export materialized daily API-key usage
  workspace-usage   Export materialized daily workspace usage
`;
}

function analyticsApiKeyUsageDailyHelp(commandName) {
  return `Usage: ${commandName} analytics api-key-usage daily [options]

Export materialized daily API-key usage.

${setupHelp()}
Options:
  --date DATE       Snapshot date, YYYY-MM-DD. Defaults to the API default.
  --workspace ID    Optional workspace filter
  --format FORMAT   table, json, or csv. Defaults to table.
  --json            Alias for --format json

Example:
  ${commandName} analytics api-key-usage daily --date 2026-06-17
  ${commandName} analytics api-key-usage daily --date 2026-06-17 --format csv
`;
}

function analyticsWorkspaceUsageDailyHelp(commandName) {
  return `Usage: ${commandName} analytics workspace-usage daily [options]

Export materialized daily workspace usage.

${setupHelp()}
Options:
  --date DATE       Snapshot date, YYYY-MM-DD. Defaults to the API default.
  --workspace ID    Optional workspace filter
  --format FORMAT   table, json, or csv. Defaults to table.
  --json            Alias for --format json

Example:
  ${commandName} analytics workspace-usage daily --date 2026-06-17
  ${commandName} analytics workspace-usage daily --date 2026-06-17 --format csv
`;
}

function helpFor(options) {
  const commandName = options.commandName || "eragon";
  if (options.resource === "workspaces" && options.command === "create") {
    return workspacesCreateHelp(commandName);
  }
  if (options.resource === "workspaces" && options.command === "list") {
    return workspacesListHelp(commandName);
  }
  if (options.resource === "workspaces" && options.command === "set-limit") {
    return workspacesSetLimitHelp(commandName);
  }
  if (options.resource === "workspaces" && options.command === "clear-limit") {
    return workspacesClearLimitHelp(commandName);
  }
  if (options.resource === "workspaces") {
    return workspacesHelp(commandName);
  }
  if (options.resource === "keys" && options.command === "create") {
    return keysCreateHelp(commandName);
  }
  if (options.resource === "keys" && options.command === "list") {
    return keysListHelp(commandName);
  }
  if (options.resource === "keys" && options.command === "get") {
    return keysGetHelp(commandName);
  }
  if (options.resource === "keys" && options.command === "set-limit") {
    return keysSetLimitHelp(commandName);
  }
  if (options.resource === "keys" && options.command === "clear-limit") {
    return keysClearLimitHelp(commandName);
  }
  if (options.resource === "keys") {
    return keysHelp(commandName);
  }
  if (
    options.resource === "analytics"
    && options.command === "api-key-usage"
    && options.subcommand === "daily"
  ) {
    return analyticsApiKeyUsageDailyHelp(commandName);
  }
  if (
    options.resource === "analytics"
    && options.command === "workspace-usage"
    && options.subcommand === "daily"
  ) {
    return analyticsWorkspaceUsageDailyHelp(commandName);
  }
  if (options.resource === "analytics") {
    return analyticsHelp(commandName);
  }
  return topHelp(commandName);
}

function requireToken(options) {
  if (!options.token) {
    throw new UsageError(
      "missing token; set ERAGON_TOKEN or pass --token",
    );
  }
}

function requireBaseUrl(options) {
  if (!options.baseUrl) {
    throw new UsageError(
      "missing base URL; set ERAGON_BASE_URL or pass --base-url",
    );
  }
}

function requireOption(options, name) {
  if (!options[name]) {
    throw new UsageError(`missing required --${name.replace(/[A-Z]/g, "-$&").toLowerCase()}`);
  }
}

function requestParams(options) {
  const params = {};
  if (options.from) {
    params.startingOn = options.from;
  }
  if (options.to) {
    params.endingBefore = options.to;
  }
  if (options.includeCost !== undefined) {
    params.includeCost = options.includeCost ? "true" : "false";
  }
  return params;
}

function dailySnapshotParams(options) {
  const params = {};
  if (options.date) {
    params.date = options.date;
  }
  if (options.workspace) {
    params.workspaceId = options.workspace;
  }
  return params;
}

function withParams(url, params) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      next.searchParams.set(key, value);
    }
  }
  return next.toString();
}

async function responseDetail(response) {
  const text = await response.text();
  if (!text.trim()) {
    return response.statusText || "request failed";
  }
  try {
    const body = JSON.parse(text);
    const detail = body.detail ?? body;
    if (typeof detail === "string") {
      return detail;
    }
    return JSON.stringify(detail);
  } catch (_error) {
    return text.trim();
  }
}

async function requestJson(options, fetchImpl, method, path, requestOptions = {}) {
  requireBaseUrl(options);
  requireToken(options);
  const headers = {
    authorization: `Bearer ${options.token}`,
    accept: "application/json",
    ...(requestOptions.headers || {}),
  };
  let body;
  if (requestOptions.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(requestOptions.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.floor(options.timeout * 1000),
  );
  const url = withParams(`${options.baseUrl}${path}`, requestOptions.params);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "request timed out" : error.message;
    throw new RequestError(`request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new RequestError(
      `request failed (${response.status}): ${await responseDetail(response)}`,
    );
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new RequestError("request succeeded but response was not valid JSON");
  }
}

function scalar(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number") {
    return String(Number(value.toFixed(6)));
  }
  return String(value);
}

function costValue(row) {
  return row.cost && typeof row.cost === "object" ? scalar(row.cost.cost_usd) : "";
}

function limitStatus(row) {
  return row.cost_limit_status && typeof row.cost_limit_status === "object"
    ? row.cost_limit_status.status
    : "";
}

function claudeCodeValue(row, key) {
  return row.claude_code && typeof row.claude_code === "object"
    ? scalar(row.claude_code[key])
    : "";
}

function table(rows, columns) {
  const headers = columns.map(([name]) => name);
  const bodyRows = rows.map((row) => columns.map(([, getter]) => scalar(getter(row))));
  const widths = headers.map((header, index) => (
    Math.max(header.length, ...bodyRows.map((row) => row[index].length))
  ));
  const lines = [
    headers.map((header, index) => header.padEnd(widths[index])).join("  "),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...bodyRows.map((row) => (
      row.map((cell, index) => cell.padEnd(widths[index])).join("  ")
    )),
  ];
  return `${lines.join("\n")}\n`;
}

function printJson(stdout, data) {
  stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function csvEscape(value) {
  const text = scalar(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csv(rows, columns) {
  const header = columns.map(([name]) => csvEscape(name)).join(",");
  const body = rows.map((row) => (
    columns.map(([, getter]) => csvEscape(getter(row))).join(",")
  ));
  return `${[header, ...body].join("\n")}\n`;
}

async function workspacesList(options, io) {
  const data = await requestJson(
    options,
    io.fetchImpl,
    "GET",
    "/anthropic/workspaces",
  );
  if (options.json) {
    printJson(io.stdout, data);
    return 0;
  }
  const rows = Array.isArray(data?.workspaces) ? data.workspaces : [];
  io.stdout.write(table(rows, [
    ["workspace_id", (row) => row.workspace_id || row.provider_workspace_id],
    ["name", (row) => row.name],
    ["limit_usd", (row) => row.cost_limit_usd],
    ["limit_status", limitStatus],
    ["status", (row) => row.status],
    ["created_at", (row) => row.created_at],
  ]));
  return 0;
}

async function workspacesCreate(options, io) {
  requireOption(options, "name");
  const body = { name: options.name };
  if (options.costLimit !== undefined) {
    body.cost_limit_usd = options.costLimit;
  }
  const data = await requestJson(
    options,
    io.fetchImpl,
    "POST",
    "/anthropic/workspaces",
    { body },
  );
  printJson(io.stdout, data);
  return 0;
}

async function workspacesLimit(options, io, costLimit) {
  requireOption(options, "workspace");
  const data = await requestJson(
    options,
    io.fetchImpl,
    "PATCH",
    `/anthropic/workspaces/${options.workspace}/limit`,
    { body: { cost_limit_usd: costLimit } },
  );
  printJson(io.stdout, data);
  return 0;
}

async function keysCreate(options, io) {
  requireOption(options, "workspace");
  requireOption(options, "name");
  const autoGeneratedIdempotencyKey = !options.idempotencyKey;
  const idempotencyKey = options.idempotencyKey || io.idempotencyKeyFactory();
  const headers = {
    "Idempotency-Key": idempotencyKey,
  };
  const body = { name: options.name };
  if (options.costLimit !== undefined) {
    body.cost_limit_usd = options.costLimit;
  }
  let data;
  try {
    data = await requestJson(
      options,
      io.fetchImpl,
      "POST",
      `/anthropic/workspaces/${options.workspace}/api-keys`,
      {
        body,
        headers,
      },
    );
  } catch (error) {
    if (autoGeneratedIdempotencyKey && error instanceof RequestError) {
      throw new RequestError(
        `${error.message}\nauto-generated idempotency key: ${idempotencyKey}`,
      );
    }
    throw error;
  }
  if (options.keyOnly) {
    if (!data?.api_key) {
      throw new RequestError("response did not include a newly shown api_key");
    }
    io.stdout.write(`${data.api_key}\n`);
    return 0;
  }
  printJson(io.stdout, data);
  return 0;
}

async function keysList(options, io) {
  requireOption(options, "workspace");
  const data = await requestJson(
    options,
    io.fetchImpl,
    "GET",
    `/anthropic/workspaces/${options.workspace}/api-keys`,
    { params: requestParams(options) },
  );
  if (options.json) {
    printJson(io.stdout, data);
    return 0;
  }
  const rows = Array.isArray(data?.api_keys) ? data.api_keys : [];
  io.stdout.write(table(rows, [
    ["api_key_id", (row) => row.api_key_id || row.key_id || row.id],
    ["name", (row) => row.name],
    ["status", (row) => row.status],
    ["cost_usd", costValue],
    ["limit_usd", (row) => row.cost_limit_usd],
    ["limit_status", limitStatus],
    ["created_at", (row) => row.created_at],
  ]));
  return 0;
}

async function keysGet(options, io) {
  requireOption(options, "workspace");
  requireOption(options, "key");
  const data = await requestJson(
    options,
    io.fetchImpl,
    "GET",
    `/anthropic/workspaces/${options.workspace}/api-keys/${options.key}`,
    { params: requestParams(options) },
  );
  printJson(io.stdout, data);
  return 0;
}

async function keysLimit(options, io, costLimit) {
  requireOption(options, "workspace");
  requireOption(options, "key");
  const data = await requestJson(
    options,
    io.fetchImpl,
    "PATCH",
    `/anthropic/workspaces/${options.workspace}/api-keys/${options.key}/limit`,
    { body: { cost_limit_usd: costLimit } },
  );
  printJson(io.stdout, data);
  return 0;
}

async function analyticsApiKeyUsageDaily(options, io) {
  const data = await requestJson(
    options,
    io.fetchImpl,
    "GET",
    "/analytics/api-key-usage/daily",
    { params: dailySnapshotParams(options) },
  );
  if (options.format === "json") {
    printJson(io.stdout, data);
    return 0;
  }
  const rows = Array.isArray(data?.api_keys) ? data.api_keys : [];
  const exportRows = rows.map((row) => ({
    ...row,
    _export_date: row.date || data?.date,
  }));
  const columns = [
    ["date", (row) => row._export_date],
    ["workspace_id", (row) => row.workspace_id || row.provider_workspace_id],
    ["workspace_name", (row) => row.workspace_name],
    ["workspace_record_id", (row) => row.workspace_record_id],
    ["api_key_id", (row) => row.api_key_id || row.provider_key_id],
    ["api_key_name", (row) => row.api_key_name || row.name],
    ["status", (row) => row.status],
    ["provider", (row) => row.provider],
    ["backend", (row) => row.backend],
    ["cost_usd", costValue],
    ["cost_currency", (row) => row.cost?.currency],
    ["cost_source", (row) => row.cost?.source],
    ["cost_availability", (row) => row.cost?.availability],
    ["claude_code_availability", (row) => row.claude_code?.availability],
    ["claude_code_match_type", (row) => row.claude_code?.match_type],
    ["claude_code_actor_name", (row) => row.claude_code?.actor_name],
    ["claude_code_estimated_cost_usd", (row) => claudeCodeValue(row, "estimated_cost_usd")],
    ["line_changes", (row) => claudeCodeValue(row, "line_changes")],
    ["loc_added", (row) => claudeCodeValue(row, "loc_added")],
    ["loc_removed", (row) => claudeCodeValue(row, "loc_removed")],
    ["loc_net", (row) => claudeCodeValue(row, "loc_net")],
    ["sessions", (row) => claudeCodeValue(row, "sessions")],
    ["commits_by_claude_code", (row) => claudeCodeValue(row, "commits_by_claude_code")],
    ["pull_requests_by_claude_code", (row) => claudeCodeValue(row, "pull_requests_by_claude_code")],
    ["accepted_edits", (row) => claudeCodeValue(row, "accepted_edits")],
    ["rejected_edits", (row) => claudeCodeValue(row, "rejected_edits")],
    ["suggestion_accept_rate", (row) => claudeCodeValue(row, "suggestion_accept_rate")],
    ["created_at", (row) => row.created_at],
    ["generated_at", (row) => row.generated_at],
  ];
  if (options.format === "csv") {
    io.stdout.write(csv(exportRows, columns));
    return 0;
  }
  io.stdout.write(table(rows, [
    ["date", (row) => row.date || data?.date],
    ["workspace_id", (row) => row.workspace_id || row.provider_workspace_id],
    ["api_key_id", (row) => row.api_key_id || row.provider_key_id],
    ["name", (row) => row.api_key_name || row.name],
    ["cost_usd", costValue],
    ["line_changes", (row) => claudeCodeValue(row, "line_changes")],
    ["sessions", (row) => claudeCodeValue(row, "sessions")],
  ]));
  return 0;
}

async function analyticsWorkspaceUsageDaily(options, io) {
  const data = await requestJson(
    options,
    io.fetchImpl,
    "GET",
    "/analytics/workspace-usage/daily",
    { params: dailySnapshotParams(options) },
  );
  if (options.format === "json") {
    printJson(io.stdout, data);
    return 0;
  }
  const rows = Array.isArray(data?.workspaces) ? data.workspaces : [];
  const exportRows = rows.map((row) => ({
    ...row,
    _export_date: row.date || data?.date,
  }));
  const columns = [
    ["date", (row) => row._export_date],
    ["workspace_id", (row) => row.workspace_id || row.provider_workspace_id],
    ["workspace_name", (row) => row.workspace_name || row.name],
    ["workspace_record_id", (row) => row.workspace_record_id],
    ["provider", (row) => row.provider],
    ["backend", (row) => row.backend],
    ["api_key_count", (row) => row.api_key_count],
    ["active_api_key_count", (row) => row.active_api_key_count],
    ["cost_usd", costValue],
    ["cost_currency", (row) => row.cost?.currency],
    ["cost_source", (row) => row.cost?.source],
    ["cost_availability", (row) => row.cost?.availability],
    ["claude_code_availability", (row) => row.claude_code?.availability],
    ["claude_code_estimated_cost_usd", (row) => claudeCodeValue(row, "estimated_cost_usd")],
    ["line_changes", (row) => claudeCodeValue(row, "line_changes")],
    ["loc_added", (row) => claudeCodeValue(row, "loc_added")],
    ["loc_removed", (row) => claudeCodeValue(row, "loc_removed")],
    ["loc_net", (row) => claudeCodeValue(row, "loc_net")],
    ["sessions", (row) => claudeCodeValue(row, "sessions")],
    ["commits_by_claude_code", (row) => claudeCodeValue(row, "commits_by_claude_code")],
    ["pull_requests_by_claude_code", (row) => claudeCodeValue(row, "pull_requests_by_claude_code")],
    ["accepted_edits", (row) => claudeCodeValue(row, "accepted_edits")],
    ["rejected_edits", (row) => claudeCodeValue(row, "rejected_edits")],
    ["suggestion_accept_rate", (row) => claudeCodeValue(row, "suggestion_accept_rate")],
    ["generated_at", (row) => row.generated_at],
  ];
  if (options.format === "csv") {
    io.stdout.write(csv(exportRows, columns));
    return 0;
  }
  io.stdout.write(table(rows, [
    ["date", (row) => row.date || data?.date],
    ["workspace_id", (row) => row.workspace_id || row.provider_workspace_id],
    ["name", (row) => row.workspace_name || row.name],
    ["api_keys", (row) => row.api_key_count],
    ["active_keys", (row) => row.active_api_key_count],
    ["cost_usd", costValue],
    ["line_changes", (row) => claudeCodeValue(row, "line_changes")],
    ["sessions", (row) => claudeCodeValue(row, "sessions")],
  ]));
  return 0;
}

async function dispatch(options, io) {
  if (!options.resource) {
    throw new UsageError("missing resource");
  }
  if (options.resource === "workspaces" && options.command === "list") {
    return workspacesList(options, io);
  }
  if (options.resource === "workspaces" && options.command === "create") {
    return workspacesCreate(options, io);
  }
  if (options.resource === "workspaces" && options.command === "set-limit") {
    if (options.costLimit === undefined) {
      throw new UsageError("missing required --limit");
    }
    return workspacesLimit(options, io, options.costLimit);
  }
  if (options.resource === "workspaces" && options.command === "clear-limit") {
    return workspacesLimit(options, io, null);
  }
  if (options.resource === "keys" && options.command === "create") {
    return keysCreate(options, io);
  }
  if (options.resource === "keys" && options.command === "list") {
    return keysList(options, io);
  }
  if (options.resource === "keys" && options.command === "get") {
    return keysGet(options, io);
  }
  if (options.resource === "keys" && options.command === "set-limit") {
    if (options.costLimit === undefined) {
      throw new UsageError("missing required --limit");
    }
    return keysLimit(options, io, options.costLimit);
  }
  if (options.resource === "keys" && options.command === "clear-limit") {
    return keysLimit(options, io, null);
  }
  if (
    options.resource === "analytics"
    && options.command === "api-key-usage"
    && options.subcommand === "daily"
  ) {
    return analyticsApiKeyUsageDaily(options, io);
  }
  if (
    options.resource === "analytics"
    && options.command === "workspace-usage"
    && options.subcommand === "daily"
  ) {
    return analyticsWorkspaceUsageDaily(options, io);
  }
  if (options.resource === "workspaces") {
    throw new UsageError("missing or unknown workspaces command");
  }
  if (options.resource === "keys") {
    throw new UsageError("missing or unknown keys command");
  }
  if (options.resource === "analytics") {
    throw new UsageError("missing or unknown analytics command");
  }
  throw new UsageError(`unknown resource: ${options.resource}`);
}

export async function run(argv = process.argv.slice(2), runtime = {}) {
  const io = {
    stdout: runtime.stdout || process.stdout,
    stderr: runtime.stderr || process.stderr,
    fetchImpl: runtime.fetchImpl || globalThis.fetch,
    idempotencyKeyFactory: runtime.idempotencyKeyFactory || generatedIdempotencyKey,
  };
  let options;
  try {
    options = parseArgs(
      argv,
      runtime.env || process.env,
      runtime.commandName || commandNameFromArgv(process.argv[1]),
    );
    if (options.help) {
      io.stdout.write(helpFor(options));
      return 0;
    }
    if (!io.fetchImpl) {
      throw new RequestError("Node 18 or newer is required for fetch support");
    }
    return await dispatch(options, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`${error.message}\n\n${helpFor(options || {})}`);
      return error.exitCode;
    }
    if (error instanceof RequestError) {
      io.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (isMainModule()) {
  process.exitCode = await run();
}
function baseUrlFromEnv(env) {
  return env.ERAGON_BASE_URL || "";
}
