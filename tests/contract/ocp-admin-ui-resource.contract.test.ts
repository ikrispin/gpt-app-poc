import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("ocp-admin UI resource registration, workflow meta tag, and tool linkage", async () => {
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
    // ui://ocp-admin/app.html appears in resources/list
    const resources = (await jsonRpc("resources/list")) as {
      resources?: Array<{ uri?: string }>;
    };
    const uris = new Set((resources.resources ?? []).map((entry) => entry.uri));
    assert.ok(
      [...uris].some((u) => typeof u === "string" && u.startsWith("ui://ocp-admin/app.html")),
      "missing ocp-admin UI resource in resources/list",
    );

    // ocp-admin UI resource serves HTML with gpt-app-workflow=ocp-admin meta tag
    const ocpAdminUri = [...uris].find((u) => typeof u === "string" && u.startsWith("ui://ocp-admin/app.html"));
    const ocpRead = (await jsonRpc("resources/read", { uri: ocpAdminUri })) as {
      contents?: Array<{ mimeType?: string; text?: string }>;
    };
    assert.equal(ocpRead.contents?.[0]?.mimeType, "text/html;profile=mcp-app");
    const ocpHtml = ocpRead.contents?.[0]?.text ?? "";
    assert.ok(ocpHtml.includes('gpt-app-workflow'), "ocp-admin HTML must contain gpt-app-workflow meta tag");
    assert.ok(ocpHtml.includes('ocp-admin'), "ocp-admin HTML workflow meta must contain ocp-admin");

    // engage UI resource serves HTML with gpt-app-workflow=engage meta tag (regression)
    const engageUri = [...uris].find((u) => typeof u === "string" && u.startsWith("ui://engage-red-hat-support/app.html"));
    assert.ok(engageUri, "engage UI resource must still be registered");
    const engageRead = (await jsonRpc("resources/read", { uri: engageUri })) as {
      contents?: Array<{ mimeType?: string; text?: string }>;
    };
    const engageHtml = engageRead.contents?.[0]?.text ?? "";
    assert.ok(engageHtml.includes('gpt-app-workflow'), "engage HTML must contain gpt-app-workflow meta tag");
    assert.ok(engageHtml.includes('"engage"'), "engage HTML workflow meta must contain engage");

    // start_ocp_admin tool references ocp-admin UI, not engage
    const tools = (await jsonRpc("tools/list")) as {
      tools?: Array<{ name: string; _meta?: Record<string, unknown> }>;
    };
    const startTool = (tools.tools ?? []).find((t) => t.name === "start_ocp_admin");
    assert.ok(startTool, "start_ocp_admin tool must exist");
    const toolUi = (startTool?._meta?.ui as Record<string, unknown>)?.resourceUri;
    assert.ok(
      typeof toolUi === "string" && toolUi.startsWith("ui://ocp-admin/"),
      `start_ocp_admin must reference ocp-admin UI, got: ${toolUi}`,
    );
  } finally {
    srv.close();
  }
});
