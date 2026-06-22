import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../bin/eragon-keys.js";

function makeStream() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 400 ? "Error" : "OK",
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

async function runCli(argv, { env = {}, response = makeResponse(200, {}) } = {}) {
  const stdout = makeStream();
  const stderr = makeStream();
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    return response;
  };
  const status = await run(argv, {
    env: { ERAGON_BASE_URL: "https://example.test", ...env },
    fetchImpl,
    stdout,
    stderr,
    commandName: "eragon",
    idempotencyKeyFactory: () => "eragon-cli-generated-id",
  });
  return { status, stdout: stdout.value, stderr: stderr.value, requests };
}

test("workspaces list uses env token and prints table", async () => {
  const result = await runCli(
    ["--base-url", "https://example.test", "workspaces", "list"],
    {
      env: { ERAGON_TOKEN: "example-token" },
      response: makeResponse(200, {
        workspaces: [
          {
            workspace_id: "wrkspc_123",
            name: "Claude Code",
            status: "active",
            created_at: "2026-06-17T00:00:00Z",
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /wrkspc_123/);
  assert.match(result.stdout, /Claude Code/);
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces",
      method: "GET",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
      },
      body: undefined,
    },
  ]);
});

test("workspaces create posts name and prints json response", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "workspaces",
      "create",
      "--name",
      "example-workspace",
      "--cost-limit",
      "500",
    ],
    {
      response: makeResponse(200, {
        workspace_id: "wrkspc_123",
        name: "example-workspace",
        cost_limit_usd: 500,
        status: "active",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).workspace_id, "wrkspc_123");
  assert.equal(result.stderr, "");
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "example-workspace", cost_limit_usd: 500 }),
    },
  ]);
});

test("keys create posts to workspace endpoint with cost limit and can print key only", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "create",
      "--workspace",
      "wrkspc_123",
      "--name",
      "example-project-key",
      "--idempotency-key",
      "ticket-123",
      "--cost-limit",
      "125",
      "--key-only",
    ],
    {
      response: makeResponse(200, {
        api_key: "generated-key-returned-once",
        name: "example-project-key",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "generated-key-returned-once\n");
  assert.equal(result.stderr, "");
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
        "Idempotency-Key": "ticket-123",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "example-project-key", cost_limit_usd: 125 }),
    },
  ]);
});

test("keys create auto-generates idempotency key when omitted", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "create",
      "--workspace",
      "wrkspc_123",
      "--name",
      "example-project-key",
    ],
    {
      response: makeResponse(200, {
        api_key: "generated-key-returned-once",
        name: "example-project-key",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.requests[0].headers["Idempotency-Key"], "eragon-cli-generated-id");
});

test("keys create reports auto-generated idempotency key on request failure", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "create",
      "--workspace",
      "wrkspc_123",
      "--name",
      "example-project-key",
    ],
    {
      response: makeResponse(503, { detail: { error: "reauth_required" } }),
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /request failed \(503\)/);
  assert.match(result.stderr, /auto-generated idempotency key: eragon-cli-generated-id/);
  assert.doesNotMatch(result.stderr, /example-token/);
});

test("keys list translates range and cost flags", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "list",
      "--workspace",
      "wrkspc_123",
      "--from",
      "2026-06-01",
      "--to",
      "2026-07-01",
      "--no-cost",
    ],
    {
      response: makeResponse(200, {
        api_keys: [
          {
            api_key_id: "apikey_123",
            name: "example-project-key",
            status: "active",
            created_at: "2026-06-17T00:00:00Z",
            cost: null,
            cost_limit_usd: 8,
            cost_limit_status: { status: "over_limit", used_usd: 9.25 },
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /apikey_123/);
  assert.match(result.stdout, /over_limit/);
  assert.equal(result.requests[0].method, "GET");
  assert.equal(
    result.requests[0].url,
    "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys"
      + "?startingOn=2026-06-01&endingBefore=2026-07-01&includeCost=false",
  );
});

test("workspaces and keys limits patch cost limit endpoints", async () => {
  const workspace = await runCli(
    [
      "--token",
      "example-token",
      "workspaces",
      "set-limit",
      "--workspace",
      "wrkspc_123",
      "--limit",
      "500",
    ],
    { response: makeResponse(200, { cost_limit_usd: 500 }) },
  );
  const key = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "clear-limit",
      "--workspace",
      "wrkspc_123",
      "--key",
      "apikey_123",
    ],
    { response: makeResponse(200, { cost_limit_usd: null }) },
  );

  assert.equal(workspace.status, 0);
  assert.equal(workspace.requests[0].method, "PATCH");
  assert.equal(
    workspace.requests[0].url,
    "https://example.test/v1/anthropic/workspaces/wrkspc_123/cost-limit",
  );
  assert.equal(workspace.requests[0].body, JSON.stringify({ cost_limit_usd: 500 }));
  assert.equal(key.status, 0);
  assert.equal(key.requests[0].method, "PATCH");
  assert.equal(
    key.requests[0].url,
    "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys/apikey_123/cost-limit",
  );
  assert.equal(key.requests[0].body, JSON.stringify({ cost_limit_usd: null }));
});

test("workspaces archive calls provider-scoped archive endpoint", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "workspaces",
      "archive",
      "--workspace",
      "wrkspc_123",
    ],
    {
      response: makeResponse(200, {
        workspace_id: "wrkspc_123",
        status: "archived",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).status, "archived");
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces/wrkspc_123/archive",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
      },
      body: undefined,
    },
  ]);
});

test("keys get prints json response", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "get",
      "--workspace",
      "wrkspc_123",
      "--key",
      "apikey_123",
    ],
    {
      response: makeResponse(200, {
        api_key_id: "apikey_123",
        name: "example-project-key",
        summary: { line_changes: 14 },
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).summary.line_changes, 14);
  assert.equal(
    result.requests[0].url,
    "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys/apikey_123",
  );
});

test("keys archive calls provider-scoped API key archive endpoint", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "archive",
      "--workspace",
      "wrkspc_123",
      "--key",
      "apikey_123",
    ],
    {
      response: makeResponse(200, {
        api_key_id: "apikey_123",
        status: "archived",
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).status, "archived");
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys/apikey_123/archive",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
      },
      body: undefined,
    },
  ]);
});

test("keys archive-bulk posts API key ids to bulk archive endpoint", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "keys",
      "archive-bulk",
      "--workspace",
      "wrkspc_123",
      "--keys",
      "apikey_123, apikey_456,apikey_123",
      "--reason",
      "cleanup",
    ],
    {
      response: makeResponse(200, {
        archived_count: 2,
        failed_count: 0,
        results: [
          { api_key_id: "apikey_123", status: "archived" },
          { api_key_id: "apikey_456", status: "archived" },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).archived_count, 2);
  assert.deepEqual(result.requests, [
    {
      url: "https://example.test/v1/anthropic/workspaces/wrkspc_123/api-keys/archive",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        api_key_ids: ["apikey_123", "apikey_456"],
        reason: "cleanup",
      }),
    },
  ]);
});

test("analytics api-key daily usage fetches materialized snapshot", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "analytics",
      "api-key-usage",
      "daily",
      "--date",
      "2026-06-17",
      "--workspace",
      "wrkspc_123",
    ],
    {
      response: makeResponse(200, {
        date: "2026-06-17",
        api_keys: [
          {
            date: "2026-06-17",
            workspace_id: "wrkspc_123",
            api_key_id: "apikey_123",
            api_key_name: "example-project-key",
            cost: { cost_usd: 12.345678 },
            claude_code: { line_changes: 42, sessions: 3 },
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /apikey_123/);
  assert.match(result.stdout, /example-project-key/);
  assert.match(result.stdout, /12.345678/);
  assert.equal(result.requests[0].method, "GET");
  assert.equal(
    result.requests[0].url,
    "https://example.test/v1/analytics/api-key-usage/daily"
      + "?date=2026-06-17&workspaceId=wrkspc_123",
  );
});

test("analytics workspace daily usage can print json response", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "analytics",
      "workspace-usage",
      "daily",
      "--date",
      "2026-06-17",
      "--format",
      "json",
    ],
    {
      response: makeResponse(200, {
        date: "2026-06-17",
        workspaces: [
          {
            workspace_id: "wrkspc_123",
            workspace_name: "Claude Code",
            api_key_count: 12,
            cost: { cost_usd: 99.5 },
            claude_code: { line_changes: 1234, sessions: 8 },
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).workspaces[0].workspace_id, "wrkspc_123");
  assert.equal(
    result.requests[0].url,
    "https://example.test/v1/analytics/workspace-usage/daily?date=2026-06-17",
  );
});

test("analytics daily usage can print csv export", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "analytics",
      "api-key-usage",
      "daily",
      "--date",
      "2026-06-17",
      "--format",
      "csv",
    ],
    {
      response: makeResponse(200, {
        date: "2026-06-17",
        api_keys: [
          {
            date: "2026-06-17",
            workspace_id: "wrkspc_123",
            workspace_name: "Claude Code",
            workspace_record_id: "ws_record_123",
            api_key_id: "apikey_123",
            api_key_name: "example, project key",
            status: "active",
            provider: "anthropic",
            backend: "native",
            created_at: "2026-06-17T00:00:00Z",
            generated_at: "2026-06-18T00:00:00Z",
            cost: {
              cost_usd: 12.345678,
              currency: "USD",
              source: "console_usage_cost",
              availability: "live",
            },
            claude_code: {
              availability: "live",
              match_type: "exact_key_name",
              actor_name: "example-project-key",
              estimated_cost_usd: 1.23,
              line_changes: 42,
              loc_added: 30,
              loc_removed: 12,
              loc_net: 18,
              sessions: 3,
              commits_by_claude_code: 1,
              pull_requests_by_claude_code: 1,
              accepted_edits: 7,
              rejected_edits: 1,
              suggestion_accept_rate: 87.5,
            },
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^date,workspace_id,workspace_name,/);
  assert.match(result.stdout, /2026-06-17,wrkspc_123,Claude Code,ws_record_123,apikey_123/);
  assert.match(result.stdout, /"example, project key"/);
  assert.match(result.stdout, /console_usage_cost,live,live,exact_key_name/);
  assert.equal(
    result.requests[0].url,
    "https://example.test/v1/analytics/api-key-usage/daily?date=2026-06-17",
  );
});

test("invalid format returns usage error without calling api", async () => {
  const result = await runCli(
    [
      "--token",
      "example-token",
      "analytics",
      "workspace-usage",
      "daily",
      "--format",
      "xml",
    ],
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--format must be one of: table, json, csv/);
  assert.deepEqual(result.requests, []);
});

test("missing base url returns error without calling api", async () => {
  const result = await runCli(
    ["--token", "example-token", "workspaces", "list"],
    { env: { ERAGON_BASE_URL: "" } },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /missing base URL/);
  assert.match(result.stderr, /export ERAGON_BASE_URL/);
  assert.doesNotMatch(result.stderr, /--idempotency-key/);
  assert.deepEqual(result.requests, []);
});

test("missing token returns error without calling api", async () => {
  const result = await runCli(["workspaces", "list"]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /missing token/);
  assert.deepEqual(result.requests, []);
});

test("api errors show status and detail without token", async () => {
  const result = await runCli(
    ["--token", "example-token", "workspaces", "list"],
    {
      response: makeResponse(403, { detail: { error: "missing_scope" } }),
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /request failed \(403\)/);
  assert.match(result.stderr, /missing_scope/);
  assert.doesNotMatch(result.stderr, /example-token/);
});

test("help is available at each command level", async () => {
  const top = await runCli(["--help"]);
  const workspaceCreate = await runCli(["workspaces", "create", "--help"]);
  const workspaceArchive = await runCli(["workspaces", "archive", "--help"]);
  const create = await runCli(["keys", "create", "--help"]);
  const archiveBulk = await runCli(["keys", "archive-bulk", "--help"]);
  const analytics = await runCli([
    "analytics",
    "workspace-usage",
    "daily",
    "--help",
  ]);

  assert.equal(top.status, 0);
  assert.match(top.stdout, /Usage: eragon/);
  assert.match(top.stdout, /analytics/);
  assert.match(top.stdout, /export ERAGON_BASE_URL/);
  assert.equal(workspaceCreate.status, 0);
  assert.match(workspaceCreate.stdout, /workspaces create --name NAME/);
  assert.match(workspaceCreate.stdout, /--cost-limit USD/);
  assert.equal(workspaceArchive.status, 0);
  assert.match(workspaceArchive.stdout, /workspaces archive --workspace ID/);
  assert.equal(create.status, 0);
  assert.match(create.stdout, /export ERAGON_BASE_URL/);
  assert.match(create.stdout, /--cost-limit USD/);
  assert.match(create.stdout, /eragon keys create --workspace wrkspc_xxx --name example-project-key --cost-limit 125/);
  assert.equal(archiveBulk.status, 0);
  assert.match(archiveBulk.stdout, /keys archive-bulk --workspace ID --keys IDS/);
  assert.match(archiveBulk.stdout, /preserving historical usage/i);
  assert.equal(analytics.status, 0);
  assert.match(analytics.stdout, /analytics workspace-usage daily/);
  assert.match(analytics.stdout, /--date DATE/);
  assert.match(analytics.stdout, /--format FORMAT/);
  assert.doesNotMatch(create.stdout, /--idempotency-key/);
  assert.deepEqual(top.requests, []);
  assert.deepEqual(workspaceCreate.requests, []);
  assert.deepEqual(workspaceArchive.requests, []);
  assert.deepEqual(create.requests, []);
  assert.deepEqual(archiveBulk.requests, []);
  assert.deepEqual(analytics.requests, []);
});

test("legacy eragon-keys alias can still render matching help", async () => {
  const stdout = makeStream();
  const stderr = makeStream();
  const status = await run(["keys", "list", "--help"], {
    env: {},
    fetchImpl: async () => makeResponse(200, {}),
    stdout,
    stderr,
    commandName: "eragon-keys",
  });

  assert.equal(status, 0);
  assert.match(stdout.value, /Usage: eragon-keys keys list/);
  assert.equal(stderr.value, "");
});
