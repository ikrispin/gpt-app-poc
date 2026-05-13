import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("cluster lookup: get_cluster_info returns detail when called directly by ID (simulating lookup)", async () => {
  process.env.NODE_ENV = "test";
  const { createApp } = await import("../../server.js");
  const app = createApp();
  const srv = app.listen(0);
  const port = (srv.address() as { port: number }).port;
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  let sessionId: string | undefined;
  let id = 1;

  const jsonRpc = async (method: string, params?: unknown) => {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
    });
    assert.equal(response.ok, true);
    if (!sessionId) {
      sessionId = response.headers.get("mcp-session-id") ?? undefined;
    }
    const payload = (await response.json()) as JsonRpcResponse;
    if ("error" in payload) {
      throw new Error(payload.error.message);
    }
    return payload.result;
  };

  await jsonRpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ocp-cluster-lookup-contract", version: "1.0.0" },
  });
  await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "initialized" }),
  });

  try {
    // Lookup a self-managed cluster by ID (OCP type)
    const ocpResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", cluster_type: "OCP" },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: { name: string; id: string; status: string; type: string };
    };

    assert.equal(ocpResult.structuredContent?.id, "762df996-acba-4a42-9fe9-edb0a8ec8bee");
    assert.equal(ocpResult.structuredContent?.name, "prod-ocp");
    assert.equal(typeof ocpResult.structuredContent?.status, "string");

    // Lookup a managed cluster by ID (ROSA type)
    const rosaResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "2o2gevtk4bohdu41ff4jps0dl8rrshb6", cluster_type: "ROSA" },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: { name: string; id: string; status: string; type: string };
    };

    assert.equal(rosaResult.structuredContent?.id, "2o2gevtk4bohdu41ff4jps0dl8rrshb6");
    assert.equal(rosaResult.structuredContent?.name, "rosa-prod");

    // Lookup a SNO cluster in pending-for-input (setupable)
    const snoResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "8e5d3e45-77c6-440b-9cfa-9f88187535c6", cluster_type: "SNO" },
    })) as {
      structuredContent?: { name: string; id: string; status: string; type: string };
    };

    assert.equal(snoResult.structuredContent?.id, "8e5d3e45-77c6-440b-9cfa-9f88187535c6");
    assert.equal(snoResult.structuredContent?.status, "pending-for-input");

    // Lookup a nonexistent cluster returns error
    const missingResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "does-not-exist-anywhere", cluster_type: "OCP" },
    })) as { isError?: boolean; content?: Array<{ type: string; text: string }> };

    assert.equal(missingResult.isError, true);
    assert.ok(missingResult.content?.[0]?.text?.includes("not found"));
  } finally {
    srv.close();
  }
});
