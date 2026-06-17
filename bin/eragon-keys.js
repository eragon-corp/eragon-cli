#!/usr/bin/env node
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
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
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
  if (commands.length > 2) {
    throw new UsageError(`unexpected argument: ${commands[2]}`);
  }
  return options;
}

function topHelp(commandName) {
  return `Usage: ${commandName} [options] <resource> <command>

Command-line tools for Eragon workflows.

Resources:
  workspaces        Workspace commands
  keys              Workspace API-key commands

Options:
  --base-url URL    Defaults to ERAGON_BASE_URL
  --token TOKEN     Defaults to ERAGON_TOKEN
  --timeout SEC     Request timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SECONDS}
  --json            Print raw JSON for list commands
  -h, --help        Show help
`;
}

function workspacesHelp(commandName) {
  return `Usage: ${commandName} workspaces <command>

Commands:
  list              List authorized workspaces
`;
}

function keysHelp(commandName) {
  return `Usage: ${commandName} keys <command>

Commands:
  create            Create an API key in an authorized workspace
  get               Get one workspace API key with analytics
  list              List API keys in an authorized workspace
`;
}

function keysCreateHelp(commandName) {
  return `Usage: ${commandName} keys create --workspace ID --name NAME [options]

Options:
  --workspace ID          Workspace id
  --name NAME            New API-key name
  --idempotency-key ID   Stable request id for safe retries
  --key-only             Print only the newly shown API key secret
`;
}

function keysListHelp(commandName) {
  return `Usage: ${commandName} keys list --workspace ID [options]

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

Options:
  --workspace ID    Workspace id
  --key ID          API-key id
  --from DATE       Inclusive start date, YYYY-MM-DD
  --to DATE         Exclusive end date, YYYY-MM-DD
  --include-cost    Request cost enrichment explicitly
  --no-cost         Skip Console usage-cost enrichment
`;
}

function helpFor(options) {
  const commandName = options.commandName || "eragon";
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
  if (options.resource === "keys") {
    return keysHelp(commandName);
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
    ["status", (row) => row.status],
    ["created_at", (row) => row.created_at],
  ]));
  return 0;
}

async function keysCreate(options, io) {
  requireOption(options, "workspace");
  requireOption(options, "name");
  const headers = {};
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  const data = await requestJson(
    options,
    io.fetchImpl,
    "POST",
    `/anthropic/workspaces/${options.workspace}/api-keys`,
    {
      body: { name: options.name },
      headers,
    },
  );
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

async function dispatch(options, io) {
  if (!options.resource) {
    throw new UsageError("missing resource");
  }
  if (options.resource === "workspaces" && options.command === "list") {
    return workspacesList(options, io);
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
  if (options.resource === "workspaces") {
    throw new UsageError("missing or unknown workspaces command");
  }
  if (options.resource === "keys") {
    throw new UsageError("missing or unknown keys command");
  }
  throw new UsageError(`unknown resource: ${options.resource}`);
}

export async function run(argv = process.argv.slice(2), runtime = {}) {
  const io = {
    stdout: runtime.stdout || process.stdout,
    stderr: runtime.stderr || process.stderr,
    fetchImpl: runtime.fetchImpl || globalThis.fetch,
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
