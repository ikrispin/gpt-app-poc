import test from "node:test";
import assert from "node:assert/strict";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

const REQUIRED_TOOLS = [
  "list_skills",
  "get_skill",
  "start_ocp_admin",
  "check_ocp_prerequisites",
  "list_ocp_clusters",
  "get_cpu_information",
  "mint_engage_consent_token",
  "generate_sosreport",
  "fetch_sosreport",
  "jira_connect_secure",
  "jira_connection_status",
  "jira_list_attachments",
  "jira_attach_artifact",
  "jira_disconnect",
] as const;
const REQUIRED_RESOURCES = [
  "ui://engage-red-hat-support/app.html",
  "ui://engage-red-hat-support/steps/select-product.html",
  "ui://engage-red-hat-support/steps/troubleshooting.html",
  "ui://engage-red-hat-support/steps/sos-report.html",
  "ui://engage-red-hat-support/steps/jira-attach.html",
  "skill://engage-red-hat-support/SKILL.md",
  "skill://ocp-admin/SKILL.md",
  "ui://ocp-admin/app.html",
] as const;
const TROUBLESHOOTING_CPU_RESOURCE_PREFIX = "resource://engage/troubleshooting/cpu/";

test("MCP tool surface includes existing and new tools", async () => {
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

  try {
    await jsonRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-surface-regression", version: "1.0.0" },
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
    const listed = (await jsonRpc("tools/list")) as {
      tools?: Array<{ name: string; _meta?: Record<string, unknown> }>;
    };
    const names = new Set((listed.tools ?? []).map((tool) => tool.name));
    for (const required of REQUIRED_TOOLS) {
      assert.ok(names.has(required), `missing tool ${required}`);
    }

    const OCP_ADMIN_TOOLS = ["start_ocp_admin", "check_ocp_prerequisites", "list_ocp_clusters"];
    const engageToolNames = REQUIRED_TOOLS.filter((name) => !OCP_ADMIN_TOOLS.includes(name));
    const incompatibleTemplateTool = (listed.tools ?? []).find((tool) => {
      if (!engageToolNames.includes(tool.name as (typeof REQUIRED_TOOLS)[number])) {
        return false;
      }
      return tool._meta?.["openai/outputTemplate"] !== "ui://engage-red-hat-support/app.html";
    });
    assert.equal(
      incompatibleTemplateTool === undefined,
      true,
      "engage tools must keep openai/outputTemplate bound to engage app URI",
    );
    const ocpAdminTool = (listed.tools ?? []).find((tool) => tool.name === "start_ocp_admin");
    assert.ok(ocpAdminTool, "start_ocp_admin tool must exist");
    assert.ok(
      typeof ocpAdminTool?._meta?.["openai/outputTemplate"] === "string" &&
        (ocpAdminTool._meta["openai/outputTemplate"] as string).startsWith("ui://ocp-admin/"),
      "start_ocp_admin must reference ocp-admin UI template",
    );

    const resources = (await jsonRpc("resources/list")) as { resources?: Array<{ uri?: string }> };
    const uris = new Set((resources.resources ?? []).map((entry) => entry.uri));
    for (const required of REQUIRED_RESOURCES) {
      assert.ok(uris.has(required), `missing resource ${required}`);
    }
    const dynamicTelemetryListed = [...uris].some((uri) => String(uri ?? "").startsWith(TROUBLESHOOTING_CPU_RESOURCE_PREFIX));
    assert.equal(
      dynamicTelemetryListed,
      false,
      "dynamic troubleshooting telemetry resources should be discoverable by template/read, not static resources/list",
    );
  } finally {
    srv.close();
  }
});
