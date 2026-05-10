import test from "node:test";
import assert from "node:assert/strict";

const OCP_ADMIN_SKILL_URI = "skill://ocp-admin/SKILL.md";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

test("ocp-admin skill discovery, content retrieval, activation, and resource registration", async () => {
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
    clientInfo: { name: "ocp-admin-contract", version: "1.0.0" },
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
    const listResult = (await jsonRpc("tools/call", {
      name: "list_skills",
      arguments: {},
    })) as { content?: Array<{ type: string; text: string }> };
    const listText = listResult.content?.[0]?.text ?? "";
    assert.ok(listText.includes(OCP_ADMIN_SKILL_URI), "list_skills must include ocp-admin skill URI");

    const getResult = (await jsonRpc("tools/call", {
      name: "get_skill",
      arguments: { uri: OCP_ADMIN_SKILL_URI },
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: { uri: string; mimeType: string; text: string };
    };
    const getText = getResult.content?.[0]?.text ?? "";
    assert.ok(getText.includes("cluster-inventory"), "content must reference cluster-inventory");
    assert.equal(getResult.structuredContent?.uri, OCP_ADMIN_SKILL_URI);
    assert.equal(getResult.structuredContent?.mimeType, "text/markdown");

    const badResult = (await jsonRpc("tools/call", {
      name: "get_skill",
      arguments: { uri: "skill://nonexistent/SKILL.md" },
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
    };
    assert.equal(badResult.isError, true);
    const badText = badResult.content?.[0]?.text ?? "";
    assert.ok(badText.includes(OCP_ADMIN_SKILL_URI), "error must list ocp-admin URI");

    const startResult = (await jsonRpc("tools/call", {
      name: "start_ocp_admin",
      arguments: {},
    })) as {
      content?: Array<{ type: string; text: string }>;
      structuredContent?: {
        persona: string;
        skill_uri: string;
        available_skills: string[];
        prerequisites: { env_vars: string[]; mcp_servers: string[] };
      };
    };
    assert.equal(startResult.content?.[0]?.type, "text");
    assert.ok(startResult.content?.[0]?.text?.includes(OCP_ADMIN_SKILL_URI));
    const sc = startResult.structuredContent;
    assert.equal(sc?.persona, "ocp-admin");
    assert.equal(sc?.skill_uri, OCP_ADMIN_SKILL_URI);
    assert.ok(sc?.available_skills?.includes("cluster-inventory"));
    assert.ok(sc?.prerequisites?.env_vars?.includes("OFFLINE_TOKEN"));

    const resources = (await jsonRpc("resources/list")) as {
      resources?: Array<{ uri?: string }>;
    };
    const uris = new Set((resources.resources ?? []).map((entry) => entry.uri));
    assert.ok(uris.has(OCP_ADMIN_SKILL_URI), "missing ocp-admin skill resource");
  } finally {
    srv.close();
  }
});
