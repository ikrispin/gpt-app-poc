import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("ocp-admin UI view resources are registered and serve correct HTML", async () => {
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
    clientInfo: { name: "ocp-admin-ui-contract", version: "1.0.0" },
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
    const resources = (await jsonRpc("resources/list")) as {
      resources?: Array<{ uri?: string }>;
    };
    const uris = new Set((resources.resources ?? []).map((entry) => entry.uri));

    assert.ok([...uris].some((u) => u === "ui://ocp-admin/views/inventory.html"), "missing inventory view resource");
    assert.ok([...uris].some((u) => u === "ui://ocp-admin/views/detail.html"), "missing detail view resource");
    assert.ok([...uris].some((u) => u === "ui://ocp-admin/views/creator.html"), "missing creator view resource");
    assert.ok([...uris].some((u) => u === "ui://ocp-admin/views/setup.html"), "missing setup view resource");

    const inventoryRead = (await jsonRpc("resources/read", { uri: "ui://ocp-admin/views/inventory.html" })) as {
      contents?: Array<{ mimeType?: string; text?: string }>;
    };
    assert.equal(inventoryRead.contents?.[0]?.mimeType, "text/html;profile=mcp-app");
    const html = inventoryRead.contents?.[0]?.text ?? "";
    assert.ok(html.includes('gpt-app-workflow'), "HTML must contain gpt-app-workflow meta tag");
    assert.ok(html.includes('ocp-admin'), "HTML workflow meta must contain ocp-admin");
    assert.ok(html.includes('gpt-app-view'), "HTML must contain gpt-app-view meta tag");
    assert.ok(html.includes('"inventory"'), "inventory view HTML must contain inventory view meta");

    const tools = (await jsonRpc("tools/list")) as {
      tools?: Array<{ name: string; _meta?: Record<string, unknown> }>;
    };
    const listTool = (tools.tools ?? []).find((t) => t.name === "list_ocp_clusters");
    assert.ok(listTool, "list_ocp_clusters tool must exist");
    const listTemplate = listTool?._meta?.["openai/outputTemplate"];
    assert.equal(listTemplate, "ui://ocp-admin/views/inventory.html", "list_ocp_clusters must use inventory view");
  } finally {
    srv.close();
  }
});
