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
      url: "https://example.test/anthropic/workspaces",
      method: "GET",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
      },
      body: undefined,
    },
  ]);
});

test("keys create posts to workspace endpoint and can print key only", async () => {
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
      url: "https://example.test/anthropic/workspaces/wrkspc_123/api-keys",
      method: "POST",
      headers: {
        authorization: "Bearer example-token",
        accept: "application/json",
        "Idempotency-Key": "ticket-123",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "example-project-key" }),
    },
  ]);
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
          },
        ],
      }),
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /apikey_123/);
  assert.equal(result.requests[0].method, "GET");
  assert.equal(
    result.requests[0].url,
    "https://example.test/anthropic/workspaces/wrkspc_123/api-keys"
      + "?startingOn=2026-06-01&endingBefore=2026-07-01&includeCost=false",
  );
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
    "https://example.test/anthropic/workspaces/wrkspc_123/api-keys/apikey_123",
  );
});

test("missing base url returns error without calling api", async () => {
  const result = await runCli(
    ["--token", "example-token", "workspaces", "list"],
    { env: { ERAGON_BASE_URL: "" } },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /missing base URL/);
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
  const create = await runCli(["keys", "create", "--help"]);

  assert.equal(top.status, 0);
  assert.match(top.stdout, /Usage: eragon/);
  assert.equal(create.status, 0);
  assert.match(create.stdout, /--idempotency-key/);
  assert.deepEqual(top.requests, []);
  assert.deepEqual(create.requests, []);
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
