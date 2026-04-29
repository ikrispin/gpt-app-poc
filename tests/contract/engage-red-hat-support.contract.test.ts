import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number; result: unknown }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

const ENGAGE_UI_URI = "ui://engage-red-hat-support/app.html";
const ENGAGE_STEP_SELECT_URI = "ui://engage-red-hat-support/steps/select-product.html";
const ENGAGE_STEP_TROUBLESHOOT_URI = "ui://engage-red-hat-support/steps/troubleshooting.html";
const ENGAGE_STEP_SOS_URI = "ui://engage-red-hat-support/steps/sos-report.html";
const ENGAGE_STEP_JIRA_URI = "ui://engage-red-hat-support/steps/jira-attach.html";
const ENGAGE_SKILL_URI = "skill://engage-red-hat-support/SKILL.md";

test("engage resources are discoverable with required metadata", async () => {
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
      clientInfo: { name: "engage-contract", version: "1.0.0" },
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

    const resources = (await jsonRpc("resources/list")) as {
      resources?: Array<{ uri?: string }>;
    };
    const uris = new Set((resources.resources ?? []).map((entry) => entry.uri));
    assert.ok(uris.has(ENGAGE_UI_URI), "missing engage ui resource");
    assert.ok(uris.has(ENGAGE_STEP_SELECT_URI), "missing engage step 1 resource");
    assert.ok(uris.has(ENGAGE_STEP_TROUBLESHOOT_URI), "missing engage step 2 resource");
    assert.ok(uris.has(ENGAGE_STEP_SOS_URI), "missing engage step 3 resource");
    assert.ok(uris.has(ENGAGE_STEP_JIRA_URI), "missing engage step 4 resource");
    assert.ok(uris.has(ENGAGE_SKILL_URI), "missing engage skill resource");

    const uiRead = (await jsonRpc("resources/read", { uri: ENGAGE_UI_URI })) as {
      contents?: Array<{ mimeType?: string; _meta?: Record<string, unknown>; text?: string }>;
    };
    assert.equal(uiRead.contents?.[0]?.mimeType, "text/html;profile=mcp-app");
    assert.equal(
      uiRead.contents?.[0]?._meta?.["openai/widgetDomain"],
      "https://leisured-carina-unpromotable.ngrok-free.dev",
    );
    assert.ok(uiRead.contents?.[0]?._meta?.["openai/widgetCSP"]);

    const skillRead = (await jsonRpc("resources/read", { uri: ENGAGE_SKILL_URI })) as {
      contents?: Array<{ mimeType?: string; text?: string }>;
    };
    assert.equal(skillRead.contents?.[0]?.mimeType, "text/markdown");
    assert.ok(
      (skillRead.contents?.[0]?.text ?? "").includes("Engage Red Hat Support"),
      "engage skill markdown content mismatch",
    );
    const skillMarkdown = skillRead.contents?.[0]?.text ?? "";
    const troubleshootingPos = skillMarkdown.indexOf("Step 2 - Troubleshooting CPU review");
    const sosPos = skillMarkdown.indexOf("Step 3 - Generate and fetch sos report");
    assert.ok(troubleshootingPos >= 0, "skill must include troubleshooting step guidance");
    assert.ok(sosPos > troubleshootingPos, "skill troubleshooting guidance must appear before sos guidance");

    const listedSkills = (await jsonRpc("tools/call", {
      name: "list_skills",
      arguments: {},
    })) as { content?: Array<{ type?: string; text?: string }> };
    const skillText = listedSkills.content?.find((entry) => entry.type === "text")?.text ?? "";
    assert.ok(skillText.includes(ENGAGE_SKILL_URI), "list_skills missing engage skill");

    const listedTools = (await jsonRpc("tools/list")) as {
      tools?: Array<{
        name?: string;
        annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean; destructiveHint?: boolean };
        _meta?: Record<string, unknown>;
      }>;
    };
    const getSkillTool = listedTools.tools?.find((tool) => tool.name === "get_skill");
    assert.ok(getSkillTool, "get_skill missing from tools/list");
    assert.equal(getSkillTool?.annotations?.readOnlyHint, true);
    assert.equal(getSkillTool?.annotations?.openWorldHint, false);
    assert.equal(getSkillTool?.annotations?.destructiveHint, false);

    const engageTools = (listedTools.tools ?? [])
      .filter((tool) => typeof tool.name === "string" && tool.name !== "list_skills" && tool.name !== "get_skill" && tool.name !== "start_ocp_admin");
    const outputTemplateDrift = engageTools
      .some((tool) => tool._meta?.["openai/outputTemplate"] !== ENGAGE_UI_URI);
    assert.equal(outputTemplateDrift, false, "engage tool output templates must remain bound to engage app URI");

    const getSkillResult = (await jsonRpc("tools/call", {
      name: "get_skill",
      arguments: { uri: ENGAGE_SKILL_URI },
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: { uri?: string; mimeType?: string; text?: string };
      isError?: boolean;
    };
    assert.equal(getSkillResult.isError, undefined);
    const getSkillText = getSkillResult.content?.find((entry) => entry.type === "text")?.text ?? "";
    assert.ok(getSkillText.includes("URI: skill://engage-red-hat-support/SKILL.md"));
    assert.ok(getSkillText.includes("Engage Red Hat Support"));
    assert.equal(getSkillResult.structuredContent?.uri, ENGAGE_SKILL_URI);
    assert.equal(getSkillResult.structuredContent?.mimeType, "text/markdown");
    assert.equal(
      getSkillResult.structuredContent?.text ?? "",
      skillRead.contents?.[0]?.text ?? "",
      "get_skill markdown must match resources/read markdown",
    );

    const getSkillInvalid = (await jsonRpc("tools/call", {
      name: "get_skill",
      arguments: { uri: "invalid://uri" },
    })) as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };
    assert.equal(getSkillInvalid.isError, true);
    const invalidText = getSkillInvalid.content?.find((entry) => entry.type === "text")?.text ?? "";
    assert.ok(invalidText.includes("Provide a non-empty skill URI"));

    const getSkillUnsupported = (await jsonRpc("tools/call", {
      name: "get_skill",
      arguments: { uri: "skill://unknown/SKILL.md" },
    })) as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
    };
    assert.equal(getSkillUnsupported.isError, true);
    const unsupportedText = getSkillUnsupported.content?.find((entry) => entry.type === "text")?.text ?? "";
    assert.ok(unsupportedText.includes("Use list_skills to discover supported URIs"));
  } finally {
    srv.close();
  }
});

test("engage workflow contract enforces opaque connection_id and no PAT fields", async () => {
  const file = path.join(
    process.cwd(),
    "specs",
    "007-engage-red-hat-support",
    "contracts",
    "engage-workflow-contract.json",
  );
  const raw = await fs.readFile(file, "utf8");
  const contract = JSON.parse(raw) as {
    compatibilityEntryPoint?: string;
    sequence: Array<{
      step: number;
      name: string;
      requiredInputs?: string[];
      requiredOperations?: string[];
      requiredPreconditions?: string[];
    }>;
    stateHandoff?: { requiredFields?: string[] };
    securityBoundary: { forbiddenFields: string[]; opaqueReference: string };
  };

  assert.deepEqual(
    contract.sequence.map((step) => step.name),
    ["select_product", "generate_and_fetch_diagnostics", "connect_verify_and_attach"],
  );
  assert.equal(contract.compatibilityEntryPoint, ENGAGE_UI_URI);
  assert.equal(contract.securityBoundary.opaqueReference, "connection_id");
  assert.ok(contract.securityBoundary.forbiddenFields.includes("pat"));
  assert.ok(contract.stateHandoff?.requiredFields?.includes("artifact_ref"));
  assert.ok(contract.stateHandoff?.requiredFields?.includes("issue_access_verified"));

  const step3 = contract.sequence.find((step) => step.name === "connect_verify_and_attach");
  assert.ok(step3, "missing connect_verify_and_attach step");
  assert.ok(
    step3?.requiredOperations?.some((op) => op.includes("jira_list_attachments")),
    "step 3 must require issue-read verification before attach",
  );
  assert.ok(
    step3?.requiredPreconditions?.includes("issue_access_verified=true"),
    "step 3 must require verified issue access",
  );

  for (const step of contract.sequence) {
    const keys = step.requiredInputs ?? [];
    assert.equal(keys.includes("pat"), false, `pat is forbidden in ${step.name}`);
    assert.equal(keys.includes("token"), false, `token is forbidden in ${step.name}`);
  }
});

test("011 consent contract captures consent-gated step-2 requirements", async () => {
  const file = path.join(
    process.cwd(),
    "specs",
    "011-consent-gate-sosreport",
    "contracts",
    "engage-consent-workflow.contract.v3.json",
  );
  const raw = await fs.readFile(file, "utf8");
  const contract = JSON.parse(raw) as {
    compatibility: { entryUri: string };
    sequence: Array<{ name: string; requiredOperations?: string[]; prohibitedAutomaticBehaviors?: string[] }>;
    consentGate: { requiredScope: string; requiredStep: number; tokenSingleUse: boolean; replayMustFail: boolean };
  };
  assert.equal(contract.compatibility.entryUri, ENGAGE_UI_URI);
  const step2 = contract.sequence.find((step) => step.name === "mint_consent_then_generate_and_fetch");
  assert.ok(step2, "missing 011 consent-gated step 2");
  assert.ok(step2?.requiredOperations?.includes("POST /api/engage/consent-tokens"));
  assert.ok(step2?.requiredOperations?.includes("generate_sosreport(consent_token)"));
  assert.ok(step2?.prohibitedAutomaticBehaviors?.includes("generate_on_page_load"));
  assert.equal(contract.consentGate.requiredScope, "generate_sosreport");
  assert.equal(contract.consentGate.requiredStep, 2);
  assert.equal(contract.consentGate.tokenSingleUse, true);
  assert.equal(contract.consentGate.replayMustFail, true);
});

test("013 contracts define MCP mint tool and headless sequence", async () => {
  const base = path.join(process.cwd(), "specs", "013-mcp-consent-mint-path", "contracts");

  const mintRaw = await fs.readFile(path.join(base, "engage-consent-mint-mcp.contract.v1.json"), "utf8");
  const mintContract = JSON.parse(mintRaw) as {
    tool?: {
      name?: string;
      input?: { permission_granted?: { required?: boolean; validation?: string } };
      output?: { requiredFields?: string[] };
    };
    security?: { explicitInvocationRequired?: boolean; automaticMintingForbidden?: boolean };
  };
  assert.equal(mintContract.tool?.name, "mint_engage_consent_token");
  if (mintContract.tool?.input?.permission_granted) {
    assert.equal(mintContract.tool.input.permission_granted.required, true);
    assert.ok(
      String(mintContract.tool.input.permission_granted.validation ?? "").includes("must be true"),
      "mint contract should require explicit permission_granted=true when permission field is present",
    );
  } else {
    // Backward-compatible contract interpretation: explicit permission is still enforced by sequence + runtime checks.
    assert.equal(mintContract.security?.explicitInvocationRequired, true);
  }
  assert.deepEqual(mintContract.tool?.output?.requiredFields, [
    "consent_token",
    "expires_at",
    "workflow_session_id",
  ]);
  assert.equal(mintContract.security?.explicitInvocationRequired, true);
  assert.equal(mintContract.security?.automaticMintingForbidden, true);

  const sequenceRaw = await fs.readFile(
    path.join(base, "engage-workflow-headless-sequence.contract.v1.json"),
    "utf8",
  );
  const sequenceContract = JSON.parse(sequenceRaw) as {
    requiredSequence?: Array<{ call?: string; arguments?: Record<string, unknown> }>;
    denials?: { mintBeforeStep1MustFail?: boolean; invalidWorkflowSessionIdMustFail?: boolean };
  };
  const calls = (sequenceContract.requiredSequence ?? []).map((step) => step.call);
  assert.deepEqual(calls, [
    "start_engage_red_hat_support",
    "select_engage_product",
    "mint_engage_consent_token",
    "generate_sosreport",
    "fetch_sosreport",
  ]);
  const mintStep = (sequenceContract.requiredSequence ?? []).find((step) => step.call === "mint_engage_consent_token");
  if (mintStep?.arguments && Object.hasOwn(mintStep.arguments, "permission_granted")) {
    assert.equal(mintStep.arguments.permission_granted, true);
  }
  assert.equal(sequenceContract.denials?.mintBeforeStep1MustFail, true);
  assert.equal(sequenceContract.denials?.invalidWorkflowSessionIdMustFail, true);
});

test("014 contracts preserve explicit permission, parsing compatibility, and web no-regression", async () => {
  const base = path.join(process.cwd(), "specs", "014-headless-consent-compat", "contracts");

  const permissionRaw = await fs.readFile(path.join(base, "headless-consent-permission.contract.v1.json"), "utf8");
  const permissionContract = JSON.parse(permissionRaw) as {
    requirements?: {
      explicitPermissionRequired?: boolean;
      permissionInput?: { field?: string; requiredValue?: boolean };
      mintWithoutExplicitPermission?: { mustFail?: boolean; errorCode?: string; mustProvideNextStepGuidance?: boolean };
    };
    mintOutput?: { requiredFields?: string[] };
    compatibility?: { webFlowBehaviorChanged?: boolean };
  };
  assert.equal(permissionContract.requirements?.explicitPermissionRequired, true);
  assert.equal(permissionContract.requirements?.permissionInput?.field, "permission_granted");
  assert.equal(permissionContract.requirements?.permissionInput?.requiredValue, true);
  assert.equal(permissionContract.requirements?.mintWithoutExplicitPermission?.mustFail, true);
  assert.equal(permissionContract.requirements?.mintWithoutExplicitPermission?.errorCode, "explicit_permission_required");
  assert.equal(permissionContract.requirements?.mintWithoutExplicitPermission?.mustProvideNextStepGuidance, true);
  assert.deepEqual(permissionContract.mintOutput?.requiredFields, [
    "consent_token",
    "expires_at",
    "workflow_session_id",
  ]);
  assert.equal(permissionContract.compatibility?.webFlowBehaviorChanged, false);

  const parsingRaw = await fs.readFile(path.join(base, "mint-output-parsing-compat.contract.v1.json"), "utf8");
  const parsingContract = JSON.parse(parsingRaw) as {
    parsingPriority?: string[];
    structuredContent?: { preferredSource?: boolean; requiredFields?: string[] };
    textFallback?: { allowedWhenStructuredUnavailable?: boolean; expectedKeys?: string[] };
    headlessSequence?: { requiredCalls?: string[] };
  };
  assert.deepEqual(parsingContract.parsingPriority, ["structuredContent", "content.text_fallback"]);
  assert.equal(parsingContract.structuredContent?.preferredSource, true);
  assert.deepEqual(parsingContract.structuredContent?.requiredFields, [
    "consent_token",
    "expires_at",
    "workflow_session_id",
  ]);
  assert.equal(parsingContract.textFallback?.allowedWhenStructuredUnavailable, true);
  assert.deepEqual(parsingContract.headlessSequence?.requiredCalls, [
    "start_engage_red_hat_support",
    "select_engage_product",
    "mint_engage_consent_token",
    "generate_sosreport",
    "fetch_sosreport",
  ]);

  const webRaw = await fs.readFile(path.join(base, "web-consent-regression-compat.contract.v1.json"), "utf8");
  const webContract = JSON.parse(webRaw) as {
    compatibilityBoundary?: { webConsentFlowMustRemainUnchanged?: boolean; headlessAdditionsMustBeNonBreakingForWeb?: boolean };
    protectedBehaviors?: { noAdditionalWebUserSteps?: boolean; noAutomaticDiagnosticsCollection?: boolean };
    nonRetroactiveRule?: { historicalSpecsModified?: boolean; newContractsPackage?: string };
  };
  assert.equal(webContract.compatibilityBoundary?.webConsentFlowMustRemainUnchanged, true);
  assert.equal(webContract.compatibilityBoundary?.headlessAdditionsMustBeNonBreakingForWeb, true);
  assert.equal(webContract.protectedBehaviors?.noAdditionalWebUserSteps, true);
  assert.equal(webContract.protectedBehaviors?.noAutomaticDiagnosticsCollection, true);
  assert.equal(webContract.nonRetroactiveRule?.historicalSpecsModified, false);
  assert.equal(webContract.nonRetroactiveRule?.newContractsPackage, "specs/014-headless-consent-compat/contracts");
});

test("015 contracts enforce split-readiness routing, deterministic fallback keys, and 014 immutability", async () => {
  const base = path.join(process.cwd(), "specs", "015-engage-support-split", "contracts");

  const routingRaw = await fs.readFile(path.join(base, "ui-headless-routing-semantics.contract.v1.json"), "utf8");
  const routingContract = JSON.parse(routingRaw) as {
    routingPolicy?: {
      primaryMode?: string;
      uiUnavailableBehavior?: string;
      alternateHeadlessSkillRegistrationInThisPhase?: boolean;
      alternateHeadlessSkillImplementationInThisPhase?: boolean;
    };
    migrationSemantics?: { newHeadlessSkillCreated?: boolean; newHeadlessSkillRegistered?: boolean };
  };
  assert.equal(routingContract.routingPolicy?.primaryMode, "ui_first");
  assert.equal(
    routingContract.routingPolicy?.uiUnavailableBehavior,
    "return_alternate_headless_skill_uri_placeholder",
  );
  assert.equal(routingContract.routingPolicy?.alternateHeadlessSkillRegistrationInThisPhase, false);
  assert.equal(routingContract.routingPolicy?.alternateHeadlessSkillImplementationInThisPhase, false);
  assert.equal(routingContract.migrationSemantics?.newHeadlessSkillCreated, false);
  assert.equal(routingContract.migrationSemantics?.newHeadlessSkillRegistered, false);

  const parityRaw = await fs.readFile(path.join(base, "handoff-text-structured-parity.contract.v1.json"), "utf8");
  const parityContract = JSON.parse(parityRaw) as {
    deterministicFallbackKeys?: string[];
    parityRequirements?: { mismatchedCriticalKeyValueMustFailContract?: boolean };
    failureConditions?: { missingKey?: string; duplicateKey?: string; mismatchedValue?: string };
  };
  assert.deepEqual(parityContract.deterministicFallbackKeys, [
    "workflow_session_id",
    "consent_token",
    "expires_at",
    "job_id",
    "status",
    "fetch_reference",
    "connection_id",
  ]);
  assert.equal(parityContract.parityRequirements?.mismatchedCriticalKeyValueMustFailContract, true);
  assert.equal(parityContract.failureConditions?.missingKey, "fail");
  assert.equal(parityContract.failureConditions?.duplicateKey, "fail");
  assert.equal(parityContract.failureConditions?.mismatchedValue, "fail");

  const regressionRaw = await fs.readFile(
    path.join(base, "web-ui-split-readiness-regression.contract.v1.json"),
    "utf8",
  );
  const regressionContract = JSON.parse(regressionRaw) as {
    compatibilityInvariants?: { forbidRetroactiveEditsTo014Contracts?: boolean; preserveCompatibilityEntryUri?: string };
    historicalBaselineReferences?: { historicalContractsModified?: boolean };
  };
  assert.equal(regressionContract.compatibilityInvariants?.forbidRetroactiveEditsTo014Contracts, true);
  assert.equal(
    regressionContract.compatibilityInvariants?.preserveCompatibilityEntryUri,
    "ui://engage-red-hat-support/app.html",
  );
  assert.equal(regressionContract.historicalBaselineReferences?.historicalContractsModified, false);
});

test("021 workflow/resource/skill contracts include troubleshooting as step 2", async () => {
  const base = path.join(process.cwd(), "specs", "021-cpu-info-ui-step", "contracts");

  const workflowRaw = await fs.readFile(
    path.join(base, "engage-workflow-troubleshooting.contract.v1.json"),
    "utf8",
  );
  const workflowContract = JSON.parse(workflowRaw) as {
    compatibility?: { entryUri?: string };
    resources?: { stepUris?: string[] };
    sequence?: Array<{ step: number; name: string }>;
  };
  assert.equal(workflowContract.compatibility?.entryUri, ENGAGE_UI_URI);
  assert.deepEqual(workflowContract.resources?.stepUris, [
    ENGAGE_STEP_SELECT_URI,
    ENGAGE_STEP_TROUBLESHOOT_URI,
    ENGAGE_STEP_SOS_URI,
    ENGAGE_STEP_JIRA_URI,
  ]);
  assert.deepEqual((workflowContract.sequence ?? []).map((step) => step.name), [
    "select_product",
    "troubleshooting_cpu_review",
    "generate_and_fetch_sos",
    "connect_verify_and_attach",
  ]);

  const resourceMapRaw = await fs.readFile(path.join(base, "engage-ui-resource-map.v3.json"), "utf8");
  const resourceMap = JSON.parse(resourceMapRaw) as {
    entryResource?: string;
    registeredResourceUris?: string[];
  };
  assert.equal(resourceMap.entryResource, ENGAGE_UI_URI);
  assert.ok(resourceMap.registeredResourceUris?.includes(ENGAGE_STEP_TROUBLESHOOT_URI));

  const skillRaw = await fs.readFile(path.join(base, "engage-skill-sequence.contract.v1.json"), "utf8");
  const skillContract = JSON.parse(skillRaw) as {
    requiredSequence?: Array<{ step: number; name: string }>;
  };
  const step2 = skillContract.requiredSequence?.find((step) => step.step === 2);
  assert.equal(step2?.name, "troubleshooting_cpu_review");
});

test("022 contracts and runtime support troubleshooting CPU telemetry resource semantics", async () => {
  const base = path.join(process.cwd(), "specs", "022-cpu-resource-ui", "contracts");
  const telemetryContractRaw = await fs.readFile(
    path.join(base, "engage-cpu-telemetry-resource.contract.v1.json"),
    "utf8",
  );
  const telemetryContract = JSON.parse(telemetryContractRaw) as {
    resource?: { uriTemplate?: string; updateIntervalSeconds?: number; maxRows?: number };
    subscriptionSemantics?: { subscribeMethod?: string; unsubscribeMethod?: string; sendResourceUpdatedRequired?: boolean };
  };
  assert.equal(
    telemetryContract.resource?.uriTemplate,
    "resource://engage/troubleshooting/cpu/{workflow_session_id}",
  );
  assert.equal(telemetryContract.resource?.updateIntervalSeconds, 1);
  assert.equal(telemetryContract.resource?.maxRows, 5);
  assert.equal(telemetryContract.subscriptionSemantics?.subscribeMethod, "resources/subscribe");
  assert.equal(telemetryContract.subscriptionSemantics?.unsubscribeMethod, "resources/unsubscribe");
  assert.equal(telemetryContract.subscriptionSemantics?.sendResourceUpdatedRequired, true);

  const workflowContractRaw = await fs.readFile(
    path.join(base, "engage-troubleshooting-live-workflow.contract.v1.json"),
    "utf8",
  );
  const workflowContract = JSON.parse(workflowContractRaw) as {
    sequence?: Array<{ step: number; name: string; requiredResource?: string }>;
  };
  const troubleshootingStep = (workflowContract.sequence ?? []).find((step) => step.step === 2);
  assert.equal(troubleshootingStep?.name, "troubleshooting_live_cpu_review");
  assert.equal(
    troubleshootingStep?.requiredResource,
    "resource://engage/troubleshooting/cpu/{workflow_session_id}",
  );

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
    if (!sessionId) sessionId = response.headers.get("mcp-session-id") ?? undefined;
    const payload = (await response.json()) as JsonRpcResponse;
    if ("error" in payload) throw new Error(payload.error.message);
    return payload.result;
  };
  try {
    await jsonRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "engage-telemetry-contract", version: "1.0.0" },
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
    const started = (await jsonRpc("tools/call", {
      name: "start_engage_red_hat_support",
      arguments: {},
    })) as { structuredContent?: { workflow_session_id?: string } };
    const workflowSessionId = String(started.structuredContent?.workflow_session_id ?? "");
    assert.ok(workflowSessionId.length > 0);

    await jsonRpc("tools/call", { name: "select_engage_product", arguments: { product: "linux" } });
    const uri = `resource://engage/troubleshooting/cpu/${workflowSessionId}`;
    await jsonRpc("resources/subscribe", { uri });
    const read = (await jsonRpc("resources/read", { uri })) as {
      contents?: Array<{ text?: string }>;
    };
    const payload = JSON.parse(String(read.contents?.[0]?.text ?? "{}")) as {
      workflow_session_id?: string;
      sample_count?: number;
      samples?: unknown[];
      text?: string;
    };
    assert.equal(payload.workflow_session_id, workflowSessionId);
    assert.equal(typeof payload.sample_count, "number");
    assert.equal(Array.isArray(payload.samples), true);
    assert.equal(typeof payload.text, "string");
    await jsonRpc("resources/unsubscribe", { uri });
  } finally {
    srv.close();
  }
});
