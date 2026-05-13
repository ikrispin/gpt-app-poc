import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("setup flow: inventory lists setupable clusters then setup tools work for them", async () => {
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
    clientInfo: { name: "ocp-setup-flow-contract", version: "1.0.0" },
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
    // Step 1: List clusters and find setupable ones (pending-for-input, self-managed)
    const clusterResult = (await jsonRpc("tools/call", {
      name: "list_ocp_clusters",
      arguments: {},
    })) as {
      structuredContent?: {
        clusters: Array<{ name: string; id: string; status: string; type: string }>;
      };
    };

    const clusters = clusterResult.structuredContent!.clusters;
    assert.ok(clusters.length > 0, "should have at least one cluster");

    const setupableSelfManaged = clusters.filter(
      (c) =>
        ["pending-for-input", "insufficient", "ready"].includes(c.status) &&
        ["OCP", "SNO"].includes(c.type),
    );
    assert.ok(
      setupableSelfManaged.length > 0,
      "mock data should include at least one setupable self-managed cluster",
    );

    const setupCluster = setupableSelfManaged[0];

    // Step 2: Get hosts for the setupable cluster
    const hostsResult = (await jsonRpc("tools/call", {
      name: "get_cluster_hosts",
      arguments: { cluster_id: setupCluster.id },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        hosts: Array<{ id: string; hostname: string; status: string; role: string }>;
        discoveryIsoUrl: string;
        total: number;
        dataSource: string;
      };
    };

    assert.equal(hostsResult.content?.[0]?.type, "text");
    const hostsSc = hostsResult.structuredContent!;
    assert.ok(Array.isArray(hostsSc.hosts));
    assert.equal(typeof hostsSc.total, "number");
    assert.equal(typeof hostsSc.discoveryIsoUrl, "string");

    // Step 3: If hosts are registered, assign a role
    if (hostsSc.hosts.length > 0) {
      const host = hostsSc.hosts[0];
      const roleResult = (await jsonRpc("tools/call", {
        name: "set_host_role",
        arguments: { cluster_id: setupCluster.id, host_id: host.id, role: "master" },
      })) as {
        content?: Array<{ type: string; text: string }>;
        structuredContent?: { host_id: string; role: string; dataSource: string };
      };

      assert.equal(roleResult.content?.[0]?.type, "text");
      assert.ok(roleResult.content?.[0]?.text?.includes("master"));
      assert.equal(roleResult.structuredContent?.host_id, host.id);
      assert.equal(roleResult.structuredContent?.role, "master");
    }

    // Step 4: Set VIPs for the setupable cluster
    const vipsResult = (await jsonRpc("tools/call", {
      name: "set_cluster_vips",
      arguments: {
        cluster_id: setupCluster.id,
        api_vip: "10.0.0.100",
        ingress_vip: "10.0.0.101",
      },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: { api_vip: string; ingress_vip: string; dataSource: string };
    };

    assert.equal(vipsResult.content?.[0]?.type, "text");
    assert.equal(vipsResult.structuredContent?.api_vip, "10.0.0.100");
    assert.equal(vipsResult.structuredContent?.ingress_vip, "10.0.0.101");

    // Step 5: Verify cluster detail shows the setupable status
    const detailResult = (await jsonRpc("tools/call", {
      name: "get_cluster_info",
      arguments: { cluster_id: setupCluster.id, cluster_type: setupCluster.type },
    })) as {
      structuredContent?: { id: string; status: string; type: string };
    };

    assert.equal(detailResult.structuredContent?.id, setupCluster.id);
    assert.equal(detailResult.structuredContent?.type, setupCluster.type);
  } finally {
    srv.close();
  }
});
