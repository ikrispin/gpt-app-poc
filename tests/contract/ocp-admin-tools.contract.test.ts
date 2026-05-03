import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("check_ocp_prerequisites and list_ocp_clusters return correct structured responses", async () => {
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
    clientInfo: { name: "ocp-admin-tools-contract", version: "1.0.0" },
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
    // check_ocp_prerequisites returns structured prerequisite status
    const prereqResult = (await jsonRpc("tools/call", {
      name: "check_ocp_prerequisites",
      arguments: {},
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        offline_token_set: boolean;
        podman_available: boolean;
        mcp_servers: Array<{ name: string; status: string; description: string }>;
      };
    };

    assert.equal(prereqResult.content?.[0]?.type, "text");
    assert.ok(prereqResult.content?.[0]?.text?.includes("OFFLINE_TOKEN"));

    const prereqSc = prereqResult.structuredContent;
    assert.equal(typeof prereqSc?.offline_token_set, "boolean");
    assert.equal(typeof prereqSc?.podman_available, "boolean");
    assert.ok(Array.isArray(prereqSc?.mcp_servers));
    assert.ok(prereqSc!.mcp_servers.length >= 2);
    assert.equal(typeof prereqSc!.mcp_servers[0].name, "string");
    assert.equal(typeof prereqSc!.mcp_servers[0].status, "string");
    assert.equal(typeof prereqSc!.mcp_servers[0].description, "string");

    // list_ocp_clusters returns cluster array with total
    const clusterResult = (await jsonRpc("tools/call", {
      name: "list_ocp_clusters",
      arguments: {},
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        clusters: Array<{ name: string; status: string; type: string; version: string; provider: string; region: string }>;
        total: number;
        dataSource: string;
      };
    };

    assert.equal(clusterResult.content?.[0]?.type, "text");
    assert.ok(clusterResult.content?.[0]?.text?.includes("cluster(s)"));

    const clusterSc = clusterResult.structuredContent;
    assert.ok(Array.isArray(clusterSc?.clusters));
    assert.equal(clusterSc!.clusters.length, 5);
    assert.equal(clusterSc!.total, 5);
    assert.ok(["live", "partial", "mock"].includes(clusterSc!.dataSource));

    const firstCluster = clusterSc!.clusters[0];
    assert.equal(typeof firstCluster.name, "string");
    assert.equal(typeof firstCluster.status, "string");
    assert.equal(typeof firstCluster.type, "string");
    assert.equal(typeof firstCluster.version, "string");
    assert.equal(typeof firstCluster.provider, "string");
    assert.equal(typeof firstCluster.region, "string");
    // get_cluster_info returns detail for a known mock cluster
    const detailResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", cluster_type: "OCP" },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        name: string;
        id: string;
        status: string;
        type: string;
        dataSource: string;
      };
    };

    assert.equal(detailResult.content?.[0]?.type, "text");
    const detailSc = detailResult.structuredContent;
    assert.equal(typeof detailSc?.name, "string");
    assert.equal(detailSc?.id, "762df996-acba-4a42-9fe9-edb0a8ec8bee");
    assert.equal(typeof detailSc?.status, "string");
    assert.equal(typeof detailSc?.type, "string");
    assert.ok(["live", "mock"].includes(detailSc!.dataSource));

    // get_cluster_info returns error for unknown cluster
    const unknownResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: "nonexistent-id", cluster_type: "OCP" },
    })) as { isError?: boolean; content?: Array<{ type: string; text: string }> };

    assert.equal(unknownResult.isError, true);
    assert.ok(unknownResult.content?.[0]?.text?.includes("not found"));
  } finally {
    srv.close();
  }
});
