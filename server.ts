import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { listClusters, checkConnectivity, isPodmanAvailable, getClusterInfo, getClusterEvents, getClusterLogsUrl, createCluster, getClusterHosts, setHostRole, setClusterVips, startInstallation, getInstallationProgress } from "./src/mcp-client/ocp-mcp-client.js";
import type { ClusterDetailInfo, ClusterEvent, CreateClusterParams, HostInfo, InstallationProgress } from "./src/mcp-client/ocp-mcp-client.js";
import { JiraAuthContext, JiraClient } from "./src/jira/jira-client.js";
import {
  attachArtifactSchema,
  connectionIdSchema,
  connectSchema,
  listAttachmentsSchema,
} from "./src/jira/jira-tool-schemas.js";
import {
  handleAttachArtifact,
  handleConnectionStatus,
  handleDisconnect,
  handleListAttachments,
} from "./src/jira/jira-tool-handlers.js";
import { resolveArtifactSelection } from "./src/jira/artifact-selection.js";
import { mapJiraHttpError, JiraMappedError } from "./src/jira/jira-error-mapping.js";
import { ConnectionLifecycleStore } from "./src/security/connection-lifecycle.js";
import { sanitizeForLog, safeError } from "./src/security/redaction.js";
import { TokenVault } from "./src/security/token-vault.js";
import { emitSecurityEvent } from "./src/security/security-events.js";
import { ConsentTokenService } from "./src/security/consent-token-service.js";
import { authorizeSensitiveToolCall } from "./src/security/sensitive-tool-policy.js";
import {
  fetchSosreportSchema,
  generateSosreportSchema,
  mintEngageConsentTokenSchema,
  type GenerateSosreportInput,
} from "./src/sosreport/sosreport-tool-schemas.js";
import { handleFetchSosreport, handleGenerateSosreport } from "./src/sosreport/sosreport-tool-handlers.js";
import { getCpuInformationSchema } from "./src/linux/system-info/cpu-info-tool-schema.js";
import { handleGetCpuInformation } from "./src/linux/system-info/cpu-info-tool-handler.js";
import type { CpuInfo } from "./src/linux/system-info/cpu-info-model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jiraClient = new JiraClient();
const lifecycleStore = new ConnectionLifecycleStore();
const tokenVault = new TokenVault();
const DEFAULT_USER_ID = "default-user";
const DEFAULT_TEST_CONSENT_SIGNING_KEY = "test-consent-signing-key";
const DEFAULT_CONSENT_TTL_SECONDS = 120;
const USER_ID_DEBUG_ENABLED = process.env.DEBUG_USER_ID_RESOLUTION === "1";

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const resolveConsentSigningKey = (): string => {
  const configured = process.env.CONSENT_TOKEN_SIGNING_KEY?.trim();
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV === "test") return DEFAULT_TEST_CONSENT_SIGNING_KEY;
  throw new Error("CONSENT_TOKEN_SIGNING_KEY is required in non-test environments.");
};

const consentTokenService = new ConsentTokenService({
  signingKey: resolveConsentSigningKey(),
  ttlSeconds: parsePositiveInteger(process.env.CONSENT_TOKEN_TTL_SECONDS, DEFAULT_CONSENT_TTL_SECONDS),
});

type EngageWorkflowState = {
  workflowSessionId: string;
  userId: string;
  sessionId: string;
  selectedProduct: "linux" | null;
  step1CompletedAt: string | null;
  updatedAt: string;
};

const engageWorkflowStates = new Map<string, EngageWorkflowState>();

type GenerateJobStatus = "queued" | "running" | "succeeded" | "failed";
type GenerateSosreportJob = {
  jobId: string;
  userId: string;
  sessionId: string;
  status: GenerateJobStatus;
  createdAt: string;
  updatedAt: string;
  fetchReference?: string;
  errorCode?: string;
  errorText?: string;
};

const generateSosreportJobs = new Map<string, GenerateSosreportJob>();
const GENERATE_JOB_TTL_MS = 30 * 60 * 1000;
const resourceSubscriptions = new Set<string>();
const toGenerateJobResourceUri = (jobId: string): string => `resource://engage/sosreport/jobs/${jobId}`;
const TROUBLESHOOTING_CPU_RESOURCE_PREFIX = "resource://engage/troubleshooting/cpu/";
const toTroubleshootingCpuResourceUri = (workflowSessionId: string): string =>
  `${TROUBLESHOOTING_CPU_RESOURCE_PREFIX}${workflowSessionId}`;
const getWorkflowSessionIdFromCpuResourceUri = (uri: string): string | null => {
  if (!uri.startsWith(TROUBLESHOOTING_CPU_RESOURCE_PREFIX)) return null;
  const workflowSessionId = uri.slice(TROUBLESHOOTING_CPU_RESOURCE_PREFIX.length).trim();
  return workflowSessionId.length > 0 ? workflowSessionId : null;
};

type CpuTelemetrySample = CpuInfo & { sampled_at: string };
type CpuTelemetryBuffer = {
  workflowSessionId: string;
  userId: string;
  sessionId: string;
  samples: CpuTelemetrySample[];
  lastUpdatedAt: string;
  lastErrorCode?: string;
};
type CpuTelemetryJob = {
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
};
const MAX_CPU_TELEMETRY_ROWS = 5;
const CPU_TELEMETRY_INTERVAL_MS = 1000;
const cpuTelemetryBuffers = new Map<string, CpuTelemetryBuffer>();
const cpuTelemetryJobs = new Map<string, CpuTelemetryJob>();
const cpuTelemetrySubscriberCounts = new Map<string, number>();

const buildWorkflowKey = (userId: string, sessionId: string): string => `${userId}:${sessionId}`;

const getOrCreateWorkflowState = (userId: string, sessionId: string): EngageWorkflowState => {
  const key = buildWorkflowKey(userId, sessionId);
  const existing = engageWorkflowStates.get(key);
  if (existing) return existing;
  const created: EngageWorkflowState = {
    workflowSessionId: randomUUID(),
    userId,
    sessionId,
    selectedProduct: null,
    step1CompletedAt: null,
    updatedAt: new Date().toISOString(),
  };
  engageWorkflowStates.set(key, created);
  return created;
};

const markWorkflowProductSelection = (userId: string, sessionId: string, product: "linux"): EngageWorkflowState => {
  const current = getOrCreateWorkflowState(userId, sessionId);
  const updated: EngageWorkflowState = {
    ...current,
    selectedProduct: product,
    step1CompletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  engageWorkflowStates.set(buildWorkflowKey(userId, sessionId), updated);
  return updated;
};

const hasCompletedStep1LinuxSelection = (userId: string, sessionId: string): boolean => {
  const current = engageWorkflowStates.get(buildWorkflowKey(userId, sessionId));
  return current?.selectedProduct === "linux" && Boolean(current.step1CompletedAt);
};

const pruneExpiredGenerateJobs = () => {
  const now = Date.now();
  for (const [jobId, job] of generateSosreportJobs.entries()) {
    const updatedAtMs = Date.parse(job.updatedAt);
    if (Number.isNaN(updatedAtMs)) continue;
    if (now - updatedAtMs > GENERATE_JOB_TTL_MS) {
      generateSosreportJobs.delete(jobId);
    }
  }
};

const createGenerateJob = (input: { userId: string; sessionId: string }): GenerateSosreportJob => {
  const now = new Date().toISOString();
  const job: GenerateSosreportJob = {
    jobId: randomUUID(),
    userId: input.userId,
    sessionId: input.sessionId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  generateSosreportJobs.set(job.jobId, job);
  void notifyGenerateJobResourceUpdated(job.jobId).catch(() => {});
  return job;
};

const updateGenerateJob = (jobId: string, patch: Partial<GenerateSosreportJob>) => {
  const existing = generateSosreportJobs.get(jobId);
  if (!existing) return;
  const updated: GenerateSosreportJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  generateSosreportJobs.set(jobId, updated);
  void notifyGenerateJobResourceUpdated(jobId).catch(() => {});
};

const getOwnedGenerateJob = (input: {
  jobId: string;
  userId: string;
  sessionId: string;
}): GenerateSosreportJob | null => {
  const job = generateSosreportJobs.get(input.jobId);
  if (!job) return null;
  if (job.userId === input.userId || job.sessionId === input.sessionId) {
    return job;
  }
  return null;
};

const mapGenerateJobState = (job: GenerateSosreportJob) => {
  if (job.status === "succeeded") {
    return {
      job_id: job.jobId,
      status: job.status,
      fetch_reference: job.fetchReference,
      text: [
        "Generate completed successfully.",
        `job_id: ${job.jobId}`,
        `status: ${job.status}`,
        `fetch_reference: ${job.fetchReference ?? ""}`,
      ].join("\n"),
    };
  }
  if (job.status === "failed") {
    return {
      job_id: job.jobId,
      status: job.status,
      error_code: job.errorCode ?? "generate_failed",
      text: [
        job.errorText ?? "Generate failed.",
        `job_id: ${job.jobId}`,
        `status: ${job.status}`,
      ].join("\n"),
    };
  }
  return {
    job_id: job.jobId,
    status: job.status,
    text: [
      "Generate in progress.",
      `job_id: ${job.jobId}`,
      `status: ${job.status}`,
    ].join("\n"),
  };
};

const notifyGenerateJobResourceUpdated = async (jobId: string): Promise<void> => {
  const uri = toGenerateJobResourceUri(jobId);
  if (!resourceSubscriptions.has(uri)) return;
  await server.server.sendResourceUpdated({ uri });
};

const runGenerateJob = (input: {
  jobId: string;
  userId: string;
  args: GenerateSosreportInput;
  consentJti: string;
  consentScope: string;
  consentStep: number;
}) => {
  queueMicrotask(async () => {
    updateGenerateJob(input.jobId, { status: "running", errorCode: undefined, errorText: undefined });
    try {
      const mockArchivePath = process.env.NODE_ENV === "test"
        ? normalizeSessionId(process.env.SOSREPORT_TEST_ARCHIVE_PATH)
        : null;
      const result = mockArchivePath
        ? await handleGenerateSosreport(input.args, {
          runGenerate: async () => ({
            exitCode: 0,
            stdout: `Archive: ${mockArchivePath}`,
            stderr: "",
            timedOut: false,
          }),
          findLatest: async () => null,
        })
        : await handleGenerateSosreport(input.args);
      const fetchReference = String(result.structuredContent?.fetch_reference ?? "").trim();
      if (result.isError || fetchReference.length === 0) {
        const errorCode = String(result.structuredContent?.code ?? "generate_failed");
        const errorText = result.content?.find((item) => item.type === "text")?.text ?? "Generate failed.";
        updateGenerateJob(input.jobId, {
          status: "failed",
          errorCode,
          errorText,
          fetchReference: undefined,
        });
        consentTokenService.finalizeSingleUse(input.consentJti, false);
        emitSecurityEvent({
          action: "consent_authorize",
          outcome: "failed",
          userId: input.userId,
          errorCode: "generate_failed",
          details: { scope: input.consentScope, step: input.consentStep },
        });
        return;
      }
      updateGenerateJob(input.jobId, {
        status: "succeeded",
        fetchReference,
        errorCode: undefined,
        errorText: undefined,
      });
      consentTokenService.finalizeSingleUse(input.consentJti, true);
      emitSecurityEvent({
        action: "consent_authorize",
        outcome: "success",
        userId: input.userId,
        details: { scope: input.consentScope, step: input.consentStep },
      });
    } catch (_error) {
      updateGenerateJob(input.jobId, {
        status: "failed",
        errorCode: "generate_failed",
        errorText: "Generate failed unexpectedly.",
      });
      consentTokenService.finalizeSingleUse(input.consentJti, false);
      emitSecurityEvent({
        action: "consent_authorize",
        outcome: "failed",
        userId: input.userId,
        errorCode: "generate_failed",
        details: { scope: input.consentScope, step: input.consentStep },
      });
    }
  });
};

const getWorkflowStateByWorkflowSessionId = (
  userId: string,
  workflowSessionId: string,
): EngageWorkflowState | null => {
  for (const state of engageWorkflowStates.values()) {
    if (state.userId === userId && state.workflowSessionId === workflowSessionId) {
      return state;
    }
  }
  return null;
};

const getAnyWorkflowStateByWorkflowSessionId = (
  workflowSessionId: string,
): EngageWorkflowState | null => {
  for (const state of engageWorkflowStates.values()) {
    if (state.workflowSessionId === workflowSessionId) return state;
  }
  return null;
};

const toCpuTelemetrySample = (structured: unknown): CpuTelemetrySample | null => {
  const record = structured as Record<string, unknown> | undefined;
  if (!record) return null;
  const {
    model,
    logical_cores,
    physical_cores,
    frequency_mhz,
    load_avg_1m,
    load_avg_5m,
    load_avg_15m,
    cpu_line,
  } = record;
  if (typeof model !== "string" || model.length === 0) return null;
  if (typeof logical_cores !== "number" || !Number.isFinite(logical_cores)) return null;
  if (typeof physical_cores !== "number" || !Number.isFinite(physical_cores)) return null;
  if (typeof frequency_mhz !== "number" || !Number.isFinite(frequency_mhz)) return null;
  if (typeof load_avg_1m !== "number" || !Number.isFinite(load_avg_1m)) return null;
  if (typeof load_avg_5m !== "number" || !Number.isFinite(load_avg_5m)) return null;
  if (typeof load_avg_15m !== "number" || !Number.isFinite(load_avg_15m)) return null;
  if (typeof cpu_line !== "string" || cpu_line.length === 0) return null;
  return {
    model,
    logical_cores,
    physical_cores,
    frequency_mhz,
    load_avg_1m,
    load_avg_5m,
    load_avg_15m,
    cpu_line,
    sampled_at: new Date().toISOString(),
  };
};

const getOrCreateCpuTelemetryBuffer = (state: EngageWorkflowState): CpuTelemetryBuffer => {
  const existing = cpuTelemetryBuffers.get(state.workflowSessionId);
  if (existing) return existing;
  const created: CpuTelemetryBuffer = {
    workflowSessionId: state.workflowSessionId,
    userId: state.userId,
    sessionId: state.sessionId,
    samples: [],
    lastUpdatedAt: new Date().toISOString(),
  };
  cpuTelemetryBuffers.set(state.workflowSessionId, created);
  return created;
};

const buildCpuTelemetryText = (buffer: CpuTelemetryBuffer): string => {
  return [
    "Troubleshooting CPU telemetry snapshot.",
    `workflow_session_id: ${buffer.workflowSessionId}`,
    `sample_count: ${buffer.samples.length}`,
    buffer.samples.length > 0
      ? `latest_sample_at: ${buffer.samples[buffer.samples.length - 1]?.sampled_at ?? ""}`
      : "latest_sample_at: none",
  ].join("\n");
};

const notifyCpuTelemetryResourceUpdated = async (workflowSessionId: string): Promise<void> => {
  const uri = toTroubleshootingCpuResourceUri(workflowSessionId);
  if (!resourceSubscriptions.has(uri)) return;
  await server.server.sendResourceUpdated({ uri });
};

const applyCpuTelemetrySample = (workflowSessionId: string, sample: CpuTelemetrySample) => {
  const state = getAnyWorkflowStateByWorkflowSessionId(workflowSessionId);
  if (!state) return;
  const current = getOrCreateCpuTelemetryBuffer(state);
  current.samples = [...current.samples, sample];
  if (current.samples.length > MAX_CPU_TELEMETRY_ROWS) {
    current.samples = current.samples.slice(current.samples.length - MAX_CPU_TELEMETRY_ROWS);
  }
  current.lastUpdatedAt = new Date().toISOString();
  current.lastErrorCode = undefined;
  cpuTelemetryBuffers.set(workflowSessionId, current);
};

const updateCpuTelemetryError = (workflowSessionId: string, errorCode: string) => {
  const state = getAnyWorkflowStateByWorkflowSessionId(workflowSessionId);
  if (!state) return;
  const current = getOrCreateCpuTelemetryBuffer(state);
  current.lastUpdatedAt = new Date().toISOString();
  current.lastErrorCode = errorCode;
  cpuTelemetryBuffers.set(workflowSessionId, current);
};

const collectCpuTelemetryTick = async (workflowSessionId: string): Promise<void> => {
  const state = getAnyWorkflowStateByWorkflowSessionId(workflowSessionId);
  if (!state) {
    const existingJob = cpuTelemetryJobs.get(workflowSessionId);
    if (existingJob) {
      clearInterval(existingJob.timer);
      cpuTelemetryJobs.delete(workflowSessionId);
    }
    return;
  }
  const result = await handleGetCpuInformation({});
  if (result.isError) {
    updateCpuTelemetryError(workflowSessionId, String(result.structuredContent?.code ?? "cpu_info_unavailable"));
    return;
  }
  const sample = toCpuTelemetrySample(result.structuredContent);
  if (!sample) {
    updateCpuTelemetryError(workflowSessionId, "partial_parse");
    return;
  }
  applyCpuTelemetrySample(workflowSessionId, sample);
  await notifyCpuTelemetryResourceUpdated(workflowSessionId);
};

const startCpuTelemetryJobIfNeeded = (workflowSessionId: string) => {
  if (cpuTelemetryJobs.has(workflowSessionId)) return;
  const job: CpuTelemetryJob = {
    inFlight: false,
    timer: setInterval(() => {
      const current = cpuTelemetryJobs.get(workflowSessionId);
      if (!current || current.inFlight) return;
      current.inFlight = true;
      cpuTelemetryJobs.set(workflowSessionId, current);
      void collectCpuTelemetryTick(workflowSessionId).finally(() => {
        const latest = cpuTelemetryJobs.get(workflowSessionId);
        if (!latest) return;
        latest.inFlight = false;
        cpuTelemetryJobs.set(workflowSessionId, latest);
      });
    }, CPU_TELEMETRY_INTERVAL_MS),
  };
  job.timer.unref?.();
  cpuTelemetryJobs.set(workflowSessionId, job);
};

const stopCpuTelemetryJobIfIdle = (workflowSessionId: string) => {
  const count = cpuTelemetrySubscriberCounts.get(workflowSessionId) ?? 0;
  if (count > 0) return;
  const existing = cpuTelemetryJobs.get(workflowSessionId);
  if (!existing) return;
  clearInterval(existing.timer);
  cpuTelemetryJobs.delete(workflowSessionId);
};

const normalizeUserId = (candidate: unknown): string | null => {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeSessionId = (candidate: unknown): string | null => {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveUserId = (sources: { mcpUserId?: unknown; httpHeaderUserId?: unknown }): string => {
  return (
    normalizeUserId(sources.mcpUserId)
    ?? normalizeUserId(sources.httpHeaderUserId)
    ?? DEFAULT_USER_ID
  );
};

const debugResolvedUserId = (
  channel: "http" | "mcp",
  raw: { mcpUserId?: unknown; httpHeaderUserId?: unknown },
  resolvedUserId: string,
) => {
  if (!USER_ID_DEBUG_ENABLED) return;
  console.log(
    `[user_id_debug] channel=${channel} resolved=${resolvedUserId} raw=${JSON.stringify({
      mcpUserId: raw.mcpUserId,
      httpHeaderUserId: raw.httpHeaderUserId,
    })}`,
  );
};

const resolveMcpUserId = (authInfo: unknown): string => {
  const auth = authInfo as { userId?: unknown; extra?: { userId?: unknown } } | undefined;
  const raw = { mcpUserId: auth?.extra?.userId ?? auth?.userId };
  const resolved = resolveUserId(raw);
  debugResolvedUserId("mcp", raw, resolved);
  return resolved;
};

const resolveMcpSessionId = (extra: unknown, userId: string): string => {
  const details = extra as
    | {
        sessionId?: unknown;
        session_id?: unknown;
        requestInfo?: { sessionId?: unknown; session_id?: unknown };
      }
    | undefined;
  return (
    normalizeSessionId(details?.sessionId)
    ?? normalizeSessionId(details?.session_id)
    ?? normalizeSessionId(details?.requestInfo?.sessionId)
    ?? normalizeSessionId(details?.requestInfo?.session_id)
    ?? `mcp-session:${userId}`
  );
};

type JiraConnectionResponse = {
  connection_id: string;
  jira_base_url: string;
  status: string;
  expires_at: string;
  last_verified_at: string | null;
  text: string;
};

type NormalizedConnectInput = {
  jiraBaseUrl: string;
  authMode: "bearer_pat" | "basic_cloud";
  secret: string;
  accountEmail: string | null;
};

const normalizeConnectInput = (
  parsed: z.infer<typeof connectSchema>,
): NormalizedConnectInput => {
  const authMode = parsed.auth_mode ?? (parsed.api_token ? "basic_cloud" : "bearer_pat");
  if (authMode === "basic_cloud") {
    return {
      jiraBaseUrl: parsed.jira_base_url,
      authMode,
      secret: String(parsed.api_token ?? ""),
      accountEmail: String(parsed.account_email ?? ""),
    };
  }
  return {
    jiraBaseUrl: parsed.jira_base_url,
    authMode,
    secret: String(parsed.pat ?? ""),
    accountEmail: null,
  };
};

const authFromConnection = (
  conn: { authMode?: "bearer_pat" | "basic_cloud"; accountEmail?: string | null },
  secret: string,
): JiraAuthContext | null => {
  if (conn.authMode === "basic_cloud") {
    if (!conn.accountEmail) return null;
    return {
      authMode: "basic_cloud",
      accountEmail: conn.accountEmail,
      secret,
    };
  }
  return {
    authMode: "bearer_pat",
    secret,
  };
};

type ConsentMintOutcome =
  | {
      ok: true;
      sessionId: string;
      workflowSessionId: string;
      consentToken: string;
      expiresAt: string;
      scope: "generate_sosreport";
      step: 2;
    }
  | {
      ok: false;
      code: "workflow_session_invalid" | "product_selection_required";
      message: string;
      text: string;
    };

const mintConsentTokenForGenerate = (input: {
  userId: string;
  fallbackSessionId: string;
  requestedSessionId?: string | null;
  requestedWorkflowSessionId?: string | null;
  clientActionId?: string;
}): ConsentMintOutcome => {
  const workflowState = input.requestedWorkflowSessionId
    ? getWorkflowStateByWorkflowSessionId(input.userId, input.requestedWorkflowSessionId)
    : null;
  if (input.requestedWorkflowSessionId && !workflowState) {
    return {
      ok: false,
      code: "workflow_session_invalid",
      message: "Workflow session is invalid or no longer active.",
      text: "Restart Step 1 and retry Step 2 generate.",
    };
  }

  const sessionId = workflowState?.sessionId ?? input.requestedSessionId ?? input.fallbackSessionId;
  if (!hasCompletedStep1LinuxSelection(input.userId, sessionId)) {
    return {
      ok: false,
      code: "product_selection_required",
      message: "Step 1 product selection is required before consent mint.",
      text: "Select product linux first, then request permission to generate diagnostics.",
    };
  }

  const minted = consentTokenService.mint({
    userId: input.userId,
    sessionId,
    scope: "generate_sosreport",
    step: 2,
  });
  const state = getOrCreateWorkflowState(input.userId, sessionId);
  emitSecurityEvent({
    action: "consent_mint",
    outcome: "success",
    userId: input.userId,
    details: {
      scope: minted.claims.scope,
      step: minted.claims.step,
      sessionId,
      clientActionId: input.clientActionId,
    },
  });
  return {
    ok: true,
    sessionId,
    workflowSessionId: state.workflowSessionId,
    consentToken: minted.token,
    expiresAt: minted.expiresAt,
    scope: minted.claims.scope,
    step: minted.claims.step,
  };
};

const createSecureJiraConnection = async (
  userId: string,
  input: NormalizedConnectInput,
): Promise<JiraConnectionResponse> => {
  const conn = await lifecycleStore.create(userId, input.jiraBaseUrl, {
    authMode: input.authMode,
    accountEmail: input.accountEmail,
  });
  await tokenVault.store(conn.connectionId, input.secret);
  try {
    const auth: JiraAuthContext = input.authMode === "basic_cloud"
      ? {
        authMode: "basic_cloud",
        accountEmail: String(input.accountEmail ?? ""),
        secret: input.secret,
      }
      : { authMode: "bearer_pat", secret: input.secret };
    await jiraClient.verifyConnection(input.jiraBaseUrl, auth);
    await lifecycleStore.markVerified(userId, conn.connectionId);
  } catch (error) {
    const mapped = error as JiraMappedError;
    await lifecycleStore.markError(userId, conn.connectionId, mapped.code ?? "unexpected_error");
  }
  emitSecurityEvent({
    action: "connect",
    outcome: "success",
    userId,
    connectionId: conn.connectionId,
  });
  const current = await lifecycleStore.getOwned(userId, conn.connectionId);
  const effective = current ?? conn;
  return {
    connection_id: effective.connectionId,
    jira_base_url: effective.jiraBaseUrl,
    status: effective.status,
    expires_at: effective.expiresAt,
    last_verified_at: effective.lastVerifiedAt,
    text: [
      "Jira connection created successfully.",
      `connection_id: ${effective.connectionId}`,
      `status: ${effective.status}`,
    ].join("\n"),
  };
};

const server = new McpServer({
  name: "GPT App POC",
  version: "1.0.0",
});

const ENGAGE_SKILL_RESOURCE_URI = "skill://engage-red-hat-support/SKILL.md";
const ENGAGE_SKILL_RESOURCE_SOURCE_PATH = path.join(
  __dirname,
  "skills",
  "engage-red-hat-support",
  "SKILL.md",
);
const SKILL_RESOURCE_MIME_TYPE = "text/markdown";
const ENGAGE_SKILL_RESOURCE_FALLBACK = `# Engage Red Hat Support

Skill content is temporarily unavailable from the repository.
URI: ${ENGAGE_SKILL_RESOURCE_URI}`;
const widgetResourceVersion = process.env.WIDGET_RESOURCE_VERSION?.trim();
const engageResourceUri = widgetResourceVersion
  ? `ui://engage-red-hat-support/app.html?v=${encodeURIComponent(widgetResourceVersion)}`
  : "ui://engage-red-hat-support/app.html";
const engageStepSelectUri = "ui://engage-red-hat-support/steps/select-product.html";
const engageStepTroubleshootingUri = "ui://engage-red-hat-support/steps/troubleshooting.html";
const engageStepSosUri = "ui://engage-red-hat-support/steps/sos-report.html";
const engageStepJiraUri = "ui://engage-red-hat-support/steps/jira-attach.html";
const ocpAdminResourceUri = widgetResourceVersion
  ? `ui://ocp-admin/app.html?v=${encodeURIComponent(widgetResourceVersion)}`
  : "ui://ocp-admin/app.html";
const widgetBuildId = widgetResourceVersion || `build-${Date.now()}`;
const DEFAULT_WIDGET_DOMAIN = "https://leisured-carina-unpromotable.ngrok-free.dev";

const loadSkillMarkdown = async (sourcePath: string, fallback: string): Promise<string> => {
  try {
    return await fs.readFile(sourcePath, "utf-8");
  } catch (_error) {
    return fallback;
  }
};

const loadEngageSkillMarkdown = async (): Promise<string> => {
  return loadSkillMarkdown(ENGAGE_SKILL_RESOURCE_SOURCE_PATH, ENGAGE_SKILL_RESOURCE_FALLBACK);
};

const OCP_ADMIN_SKILL_RESOURCE_URI = "skill://ocp-admin/SKILL.md";
const OCP_ADMIN_SKILL_RESOURCE_SOURCE_PATH = path.join(
  __dirname,
  "skills",
  "ocp-admin",
  "SKILL.md",
);
const OCP_ADMIN_SKILL_RESOURCE_FALLBACK = `# OCP Admin

Skill content is temporarily unavailable from the repository.
URI: ${OCP_ADMIN_SKILL_RESOURCE_URI}`;

const loadOcpAdminSkillMarkdown = async (): Promise<string> => {
  return loadSkillMarkdown(OCP_ADMIN_SKILL_RESOURCE_SOURCE_PATH, OCP_ADMIN_SKILL_RESOURCE_FALLBACK);
};

type OcpClusterRow = {
  name: string;
  id: string;
  status: string;
  type: string;
  version: string;
  provider: string;
  region: string;
};

const OCP_MOCK_CLUSTERS: OcpClusterRow[] = [
  { name: "prod-ocp", id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", status: "installing", type: "OCP", version: "4.21.0", provider: "Baremetal", region: "-" },
  { name: "dev-ocp", id: "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7", status: "ready", type: "OCP", version: "4.20.5", provider: "vSphere", region: "-" },
  { name: "rosa-prod", id: "2o2gevtk4bohdu41ff4jps0dl8rrshb6", status: "ready", type: "ROSA", version: "4.21.0", provider: "AWS", region: "us-east-1" },
  { name: "aro-dev", id: "20ekbvg1jkaqssc47mmc0irlvhf59c0p", status: "ready", type: "ARO", version: "4.20.0", provider: "Azure", region: "-" },
  { name: "edge-01", id: "8e5d3e45-77c6-440b-9cfa-9f88187535c6", status: "pending-for-input", type: "SNO", version: "4.21.0", provider: "Self-managed", region: "-" },
];

const OCP_MOCK_CLUSTER_DETAILS: Record<string, ClusterDetailInfo> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": { name: "prod-ocp", id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", status: "installing", type: "OCP", version: "4.21.0", provider: "Baremetal", region: "-", created_at: "2026-04-28T10:15:00Z", host_count: 3, network_type: "OVNKubernetes", cluster_network_cidr: "10.128.0.0/14", service_network_cidr: "172.30.0.0/16", platform_type: "baremetal", dns_domain: "prod.example.com", source: "openshift-self-managed" },
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": { name: "dev-ocp", id: "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7", status: "ready", type: "OCP", version: "4.20.5", provider: "vSphere", region: "-", created_at: "2026-03-15T08:30:00Z", api_vip: "192.168.1.100", ingress_vip: "192.168.1.101", console_url: "https://console-openshift-console.apps.dev-ocp.example.com", host_count: 3, network_type: "OVNKubernetes", cluster_network_cidr: "10.128.0.0/14", service_network_cidr: "172.30.0.0/16", platform_type: "vsphere", dns_domain: "dev-ocp.example.com", source: "openshift-self-managed" },
  "2o2gevtk4bohdu41ff4jps0dl8rrshb6": { name: "rosa-prod", id: "2o2gevtk4bohdu41ff4jps0dl8rrshb6", status: "ready", type: "ROSA", version: "4.21.0", provider: "AWS", region: "us-east-1", created_at: "2026-04-01T14:00:00Z", api_url: "https://api.rosa-prod.abcd.p1.openshiftapps.com:6443", console_url: "https://console-openshift-console.apps.rosa-prod.abcd.p1.openshiftapps.com", host_count: 3, network_type: "OVNKubernetes", cluster_network_cidr: "10.128.0.0/14", service_network_cidr: "172.30.0.0/16", platform_type: "aws", source: "openshift-ocm-managed" },
  "20ekbvg1jkaqssc47mmc0irlvhf59c0p": { name: "aro-dev", id: "20ekbvg1jkaqssc47mmc0irlvhf59c0p", status: "ready", type: "ARO", version: "4.20.0", provider: "Azure", region: "-", created_at: "2026-02-20T11:45:00Z", api_url: "https://api.aro-dev.eastus.aroapp.io:6443", console_url: "https://console-openshift-console.apps.aro-dev.eastus.aroapp.io", host_count: 3, network_type: "OVNKubernetes", cluster_network_cidr: "10.128.0.0/14", service_network_cidr: "172.30.0.0/16", platform_type: "azure", source: "openshift-ocm-managed" },
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": { name: "edge-01", id: "8e5d3e45-77c6-440b-9cfa-9f88187535c6", status: "pending-for-input", type: "SNO", version: "4.21.0", provider: "Self-managed", region: "-", created_at: "2026-04-29T16:00:00Z", host_count: 1, network_type: "OVNKubernetes", cluster_network_cidr: "10.128.0.0/14", service_network_cidr: "172.30.0.0/16", platform_type: "none", dns_domain: "edge-01.lab.example.com", source: "openshift-self-managed" },
};

const SELF_MANAGED_CLUSTER_TYPES = new Set(["OCP", "SNO"]);

const OCP_MOCK_CLUSTER_EVENTS: Record<string, ClusterEvent[]> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": [
    { timestamp: "2026-04-28T10:15:00Z", severity: "info", message: "Cluster registration started", category: "cluster" },
    { timestamp: "2026-04-28T10:16:30Z", severity: "info", message: "Host host-0 registered successfully", category: "host" },
    { timestamp: "2026-04-28T10:16:45Z", severity: "info", message: "Host host-1 registered successfully", category: "host" },
    { timestamp: "2026-04-28T10:17:00Z", severity: "info", message: "Host host-2 registered successfully", category: "host" },
    { timestamp: "2026-04-28T10:20:00Z", severity: "info", message: "API VIP verification in progress", category: "network" },
    { timestamp: "2026-04-28T10:25:00Z", severity: "info", message: "Installation started", category: "cluster" },
    { timestamp: "2026-04-28T10:45:00Z", severity: "warning", message: "Host host-1 disk speed is below recommended threshold", category: "host" },
    { timestamp: "2026-04-28T11:00:00Z", severity: "info", message: "Bootstrap control plane initialized", category: "cluster" },
  ],
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": [
    { timestamp: "2026-03-15T08:30:00Z", severity: "info", message: "Cluster registration started", category: "cluster" },
    { timestamp: "2026-03-15T08:32:00Z", severity: "info", message: "3 hosts registered", category: "host" },
    { timestamp: "2026-03-15T08:40:00Z", severity: "info", message: "Network validation passed", category: "network" },
    { timestamp: "2026-03-15T09:00:00Z", severity: "info", message: "Installation started", category: "cluster" },
    { timestamp: "2026-03-15T09:45:00Z", severity: "info", message: "Installation completed successfully", category: "cluster" },
    { timestamp: "2026-03-15T09:46:00Z", severity: "info", message: "Console URL available", category: "cluster" },
  ],
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": [
    { timestamp: "2026-04-29T16:00:00Z", severity: "info", message: "SNO cluster registration started", category: "cluster" },
    { timestamp: "2026-04-29T16:01:00Z", severity: "info", message: "Host edge-host-0 registered", category: "host" },
    { timestamp: "2026-04-29T16:05:00Z", severity: "warning", message: "Waiting for user input: network configuration required", category: "network" },
  ],
};

const OCP_MOCK_LOGS_URLS: Record<string, string> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": "https://assisted-logs.example.com/clusters/762df996/logs.tar.gz?token=mock-token&expires=3600",
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": "https://assisted-logs.example.com/clusters/a1b2c3d4/logs.tar.gz?token=mock-token&expires=3600",
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": "https://assisted-logs.example.com/clusters/8e5d3e45/logs.tar.gz?token=mock-token&expires=3600",
};

const OCP_MOCK_HOSTS: Record<string, HostInfo[]> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": [
    { id: "host-0-uuid", hostname: "master-0.prod-ocp.example.com", status: "known", role: "master" },
    { id: "host-1-uuid", hostname: "master-1.prod-ocp.example.com", status: "known", role: "master" },
    { id: "host-2-uuid", hostname: "worker-0.prod-ocp.example.com", status: "known", role: "worker" },
  ],
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": [
    { id: "host-3-uuid", hostname: "master-0.dev-ocp.example.com", status: "known", role: "master" },
    { id: "host-4-uuid", hostname: "master-1.dev-ocp.example.com", status: "known", role: "master" },
    { id: "host-5-uuid", hostname: "worker-0.dev-ocp.example.com", status: "known", role: "worker" },
  ],
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": [
    { id: "host-6-uuid", hostname: "edge-host-0.edge-01.lab.example.com", status: "known", role: "master" },
  ],
};

const OCP_MOCK_DISCOVERY_ISO: Record<string, string> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": "https://assisted-iso.example.com/clusters/762df996/discovery.iso",
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": "https://assisted-iso.example.com/clusters/a1b2c3d4/discovery.iso",
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": "https://assisted-iso.example.com/clusters/8e5d3e45/discovery.iso",
};

const OCP_MOCK_INSTALL_STATUS: Record<string, InstallationProgress> = {
  "762df996-acba-4a42-9fe9-edb0a8ec8bee": { status: "installing", progress: 65, statusInfo: "Bootstrap complete, installing control plane components" },
  "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7": { status: "installed", progress: 100, statusInfo: "Installation completed successfully" },
  "8e5d3e45-77c6-440b-9cfa-9f88187535c6": { status: "installing", progress: 30, statusInfo: "Bootstrapping cluster, waiting for control plane" },
};

const createMockCluster = (params: { cluster_name: string; openshift_version: string; base_dns_domain: string; high_availability_mode: string }) => ({
  id: randomUUID(),
  name: params.cluster_name,
  status: "pending-for-input",
  type: params.high_availability_mode === "None" ? "SNO" : "OCP",
  version: params.openshift_version,
  provider: "Self-managed",
  region: "-",
});

const SKILL_LOADERS: Record<string, () => Promise<string>> = {
  [ENGAGE_SKILL_RESOURCE_URI]: loadEngageSkillMarkdown,
  [OCP_ADMIN_SKILL_RESOURCE_URI]: loadOcpAdminSkillMarkdown,
};

const loadRawWidgetHtml = async (): Promise<string> => {
  try {
    return await fs.readFile(
      path.join(__dirname, "dist", "mcp-app.html"),
      "utf-8",
    );
  } catch (_error) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Engage Red Hat Support</title>
    <style>
      :root {
        --rhds-font-family: "Red Hat Text", "Noto Sans", "Segoe UI", sans-serif;
        --rhds-heading-font: "Red Hat Display", "Noto Sans", "Segoe UI", sans-serif;
        --rhds-shell-bg: #f8f8f8;
        --rhds-surface-bg: #ffffff;
        --rhds-text-primary: #151515;
        --rhds-text-muted: #4f5255;
        --rhds-border-subtle: #d2d2d2;
      }
      body {
        margin: 0;
        padding: 1.5rem;
        font-family: var(--rhds-font-family);
        background: var(--rhds-shell-bg);
        color: var(--rhds-text-primary);
      }
      main {
        max-width: 52rem;
        margin: 0 auto;
        background: var(--rhds-surface-bg);
        border: 1px solid var(--rhds-border-subtle);
        border-radius: 0.375rem;
        padding: 1rem 1.25rem;
      }
      h1 {
        margin: 0 0 0.75rem 0;
        font-family: var(--rhds-heading-font);
        font-size: 1.125rem;
      }
      p {
        margin: 0 0 0.75rem 0;
      }
      ol {
        margin: 0;
        padding-left: 1.25rem;
        color: var(--rhds-text-muted);
      }
      li + li {
        margin-top: 0.375rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Engage Red Hat Support</h1>
      <p>UI bundle unavailable. Follow text fallback steps:</p>
      <ol>
        <li>Start workflow and select supported product (linux only).</li>
        <li>Review troubleshooting CPU information before diagnostics generation.</li>
        <li>Request explicit consent token, then run generate_sosreport and fetch_sosreport to produce artifact_ref.</li>
        <li>Use secure Jira intake to obtain connection_id, verify issue access, then attach artifact.</li>
      </ol>
    </main>
  </body>
</html>`;
  }
};

const loadEngageWidgetHtml = async (): Promise<string> => loadWidgetHtml("engage");
const loadOcpAdminWidgetHtml = async (): Promise<string> => loadWidgetHtml("ocp-admin");

const injectWidgetMeta = (html: string, workflowId: string): string => {
  const widgetDomain = process.env.WIDGET_DOMAIN?.trim() || DEFAULT_WIDGET_DOMAIN;
  const escapedWidgetDomain = widgetDomain
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const escapedWidgetBuildId = widgetBuildId
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const escapedWorkflowId = workflowId
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const metaInjection = [
    `<meta name="gpt-app-api-base" content="${escapedWidgetDomain}" />`,
    `<meta name="gpt-app-build-id" content="${escapedWidgetBuildId}" />`,
    `<meta name="gpt-app-workflow" content="${escapedWorkflowId}" />`,
  ].join("");
  return html.includes("</head>")
    ? html.replace("</head>", `${metaInjection}</head>`)
    : `${metaInjection}${html}`;
};

const loadWidgetHtml = async (workflowId: string): Promise<string> => {
  const rawHtml = await loadRawWidgetHtml();
  return injectWidgetMeta(rawHtml, workflowId);
};

const GET_SKILL_INPUT_SCHEMA = z.object({ uri: z.string().min(1, "skill URI is required") });
const SELECT_ENGAGE_PRODUCT_SCHEMA = z.object({
  product: z.literal("linux"),
});
const CONSENT_MINT_SCHEMA = z.object({
  workflow: z.literal("engage_red_hat_support"),
  step: z.literal(2),
  requested_scope: z.literal("generate_sosreport"),
  session_id: z.string().min(1).optional(),
  workflow_session_id: z.string().min(1).optional(),
  client_action_id: z.string().min(1).optional(),
});
const GENERATE_JOB_STATUS_SCHEMA = z.object({
  job_id: z.string().min(1),
});

registerAppTool(
  server,
  "start_engage_red_hat_support",
  {
    title: "Start Engage Red Hat Support Workflow",
    description: "Starts workflow and returns explicit step 1 product-selection guidance.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (_args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    const sessionId = resolveMcpSessionId(extra, userId);
    const state = getOrCreateWorkflowState(userId, sessionId);
    return {
      content: [
        {
          type: "text",
          text: [
            "Engage workflow started.",
            "Step 1: select product linux before troubleshooting and diagnostics generation.",
            `UI entrypoint: ${engageResourceUri}`,
          ].join("\n"),
        },
      ],
      structuredContent: {
        workflow: "engage_red_hat_support",
        workflow_session_id: state.workflowSessionId,
        current_step: "select_product",
        compatibility_entry_uri: engageResourceUri,
      },
    };
  },
);

registerAppTool(
  server,
  "select_engage_product",
  {
    title: "Select Engage Workflow Product",
    description: "Completes step 1 product selection for Engage workflow (linux only).",
    inputSchema: SELECT_ENGAGE_PRODUCT_SCHEMA,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    const sessionId = resolveMcpSessionId(extra, userId);
    const state = markWorkflowProductSelection(userId, sessionId, args.product);
    return {
      content: [{
        type: "text",
        text: "Step 1 complete: linux selected. Continue to troubleshooting CPU review before sos generation.",
      }],
      structuredContent: {
        workflow: "engage_red_hat_support",
        workflow_session_id: state.workflowSessionId,
        selected_product: "linux",
        current_step: "troubleshooting",
      },
    };
  },
);

registerAppTool(
  server,
  "mint_engage_consent_token",
  {
    title: "Mint Engage Consent Token",
    description: "Mints explicit consent token for Step 2 sosreport generation after user permission is granted.",
    inputSchema: mintEngageConsentTokenSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    if (args.permission_granted !== true) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: [
              "Explicit permission is required before generating diagnostics.",
              "Ask the user: \"sosreport collects invasive diagnostic data. Proceed with generation?\"",
              "If the user answers yes, retry mint_engage_consent_token with permission_granted=true.",
            ].join("\n"),
          },
        ],
        structuredContent: {
          code: "explicit_permission_required",
          next_step: "ask_user_permission_then_retry_mint",
        },
      };
    }

    const userId = resolveMcpUserId(extra?.authInfo);
    const sessionId = resolveMcpSessionId(extra, userId);
    const mint = mintConsentTokenForGenerate({
      userId,
      fallbackSessionId: sessionId,
      requestedWorkflowSessionId: normalizeSessionId(args.workflow_session_id),
    });
    if (!mint.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: mint.text }],
        structuredContent: {
          code: mint.code,
          next_step: "select_product",
        },
      };
    }

    return {
      content: [{
        type: "text",
        text: [
          "Consent token minted for Step 2 generate_sosreport.",
          `consent_token: ${mint.consentToken}`,
          `expires_at: ${mint.expiresAt}`,
          `workflow_session_id: ${mint.workflowSessionId}`,
          "Use consent_token with generate_sosreport immediately (single-use, short-lived).",
        ].join("\n"),
      }],
      structuredContent: {
        consent_token: mint.consentToken,
        expires_at: mint.expiresAt,
        workflow_session_id: mint.workflowSessionId,
      },
    };
  },
);

registerAppTool(
  server,
  "list_skills",
  {
    title: "List Available Skills",
    description: "Returns canonical URI(s) for repo-local skills.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "Available skills:",
          `  - ${ENGAGE_SKILL_RESOURCE_URI}`,
          `  - ${OCP_ADMIN_SKILL_RESOURCE_URI}`,
          "Use get_skill with a URI to load skill content.",
        ].join("\n"),
      },
    ],
  }),
);

registerAppTool(
  server,
  "get_skill",
  {
    title: "Get Skill Markdown",
    description: "Returns markdown content for a registered skill URI.",
    inputSchema: GET_SKILL_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args) => {
    const normalizedUri = args.uri.trim();
    if (!normalizedUri.startsWith("skill://")) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Invalid URI. Provide a non-empty skill URI like skill://engage-red-hat-support/SKILL.md.",
          },
        ],
      };
    }

    const loader = SKILL_LOADERS[normalizedUri];
    if (!loader) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: [
              `Unsupported skill URI: ${normalizedUri}`,
              `Use list_skills to discover supported URIs. Currently supported: ${Object.keys(SKILL_LOADERS).join(", ")}`,
            ].join("\n"),
          },
        ],
      };
    }

    const markdown = await loader();
    return {
      content: [
        {
          type: "text",
          text: [`URI: ${normalizedUri}`, "", markdown].join("\n"),
        },
      ],
      structuredContent: {
        uri: normalizedUri,
        mimeType: SKILL_RESOURCE_MIME_TYPE,
        text: markdown,
      },
    };
  },
);

registerAppTool(
  server,
  "start_ocp_admin",
  {
    title: "Start OCP Admin Workflow",
    description: "Returns skill routing guidance for OpenShift cluster administration.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "OCP Admin persona activated.",
          `Read the skill for detailed workflow instructions: ${OCP_ADMIN_SKILL_RESOURCE_URI}`,
          "Available sub-skills: cluster-inventory (read-only cluster listing), cluster-creator (create and install OCP/SNO clusters)",
          "Prerequisites: OFFLINE_TOKEN env var, openshift-self-managed and openshift-ocm-managed MCP servers",
        ].join("\n"),
      },
    ],
    structuredContent: {
      persona: "ocp-admin",
      skill_uri: OCP_ADMIN_SKILL_RESOURCE_URI,
      available_skills: ["cluster-inventory", "cluster-creator"],
      prerequisites: {
        env_vars: ["OFFLINE_TOKEN"],
        mcp_servers: ["openshift-self-managed", "openshift-ocm-managed"],
      },
    },
  }),
);

registerAppTool(
  server,
  "check_ocp_prerequisites",
  {
    title: "Check OCP Admin Prerequisites",
    description: "Checks whether required environment variables and MCP servers are available for OCP admin workflows.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async () => {
    const connectivity = await checkConnectivity();
    const tokenStatus = connectivity.offlineTokenSet ? "set" : "not set";
    const podmanStatus = connectivity.podmanAvailable ? "available" : "not available";
    const mcpServers = connectivity.servers.map((s) => ({
      name: s.name,
      status: s.status,
      description: s.description,
    }));
    return {
      content: [
        {
          type: "text",
          text: [
            `OFFLINE_TOKEN: ${tokenStatus}`,
            `Podman: ${podmanStatus}`,
            ...connectivity.servers.map((s) => `${s.name}: ${s.status} — ${s.description}${s.error ? ` (${s.error})` : ""}`),
          ].join("\n"),
        },
      ],
      structuredContent: {
        offline_token_set: connectivity.offlineTokenSet,
        podman_available: connectivity.podmanAvailable,
        mcp_servers: mcpServers,
      },
    };
  },
);

registerAppTool(
  server,
  "list_ocp_clusters",
  {
    title: "List OCP Clusters",
    description: "Returns the current inventory of OpenShift clusters across all deployment types.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async () => {
    const result = await listClusters();

    let clusters: OcpClusterRow[];
    let dataSource: "live" | "partial" | "mock";
    let statusNote = "";

    if (result.ok === false) {
      clusters = OCP_MOCK_CLUSTERS;
      dataSource = "mock";
      statusNote = `\n(Using mock data: ${result.error})`;
    } else {
      clusters = [...result.clusters];
      dataSource = result.dataSource;
      if (result.errors.length > 0) {
        statusNote = `\n(Partial data — some servers unavailable: ${result.errors.join("; ")})`;
      }
    }

    const lines = clusters.map(
      (c) => `${c.name} | ${c.status} | ${c.type} | ${c.version} | ${c.provider} | ${c.region}`,
    );
    return {
      content: [
        {
          type: "text",
          text: [
            `Found ${clusters.length} cluster(s) [source: ${dataSource}]:`,
            "Name | Status | Type | Version | Provider | Region",
            ...lines,
            statusNote,
          ].filter(Boolean).join("\n"),
        },
      ],
      structuredContent: {
        clusters,
        total: clusters.length,
        dataSource,
      },
    };
  },
);

registerAppTool(
  server,
  "get_cluster_info",
  {
    title: "Get Cluster Details",
    description: "Returns detailed information about a specific OpenShift cluster by ID.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
      cluster_type: z.string().min(1),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string; cluster_type: string }) => {
    const result = await getClusterInfo(args.cluster_id, args.cluster_type);

    let detail: ClusterDetailInfo | undefined;
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      detail = result.detail;
      dataSource = result.dataSource;
    } else {
      const mockDetail = OCP_MOCK_CLUSTER_DETAILS[args.cluster_id];
      if (mockDetail) {
        detail = mockDetail;
        dataSource = "mock";
      }
    }

    if (!detail) {
      return {
        isError: true,
        content: [{ type: "text", text: `Cluster not found: ${args.cluster_id}` }],
      };
    }

    const lines = [
      `Cluster: ${detail.name} (${detail.type})`,
      `ID: ${detail.id}`,
      `Status: ${detail.status}`,
      `Version: ${detail.version}`,
      `Provider: ${detail.provider}`,
      `Region: ${detail.region}`,
      detail.created_at ? `Created: ${detail.created_at}` : "",
      detail.host_count !== undefined ? `Hosts: ${detail.host_count}` : "",
      detail.api_vip ? `API VIP: ${detail.api_vip}` : "",
      detail.api_url ? `API URL: ${detail.api_url}` : "",
      detail.ingress_vip ? `Ingress VIP: ${detail.ingress_vip}` : "",
      detail.console_url ? `Console: ${detail.console_url}` : "",
      detail.dns_domain ? `DNS Domain: ${detail.dns_domain}` : "",
      detail.network_type ? `Network: ${detail.network_type}` : "",
      detail.cluster_network_cidr ? `Cluster CIDR: ${detail.cluster_network_cidr}` : "",
      detail.service_network_cidr ? `Service CIDR: ${detail.service_network_cidr}` : "",
      detail.platform_type ? `Platform: ${detail.platform_type}` : "",
    ].filter(Boolean);

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { ...detail, dataSource },
    };
  },
);

registerAppTool(
  server,
  "get_cluster_events",
  {
    title: "Get Cluster Events",
    description: "Returns event history for a self-managed OpenShift cluster (OCP/SNO only).",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
      cluster_type: z.string().min(1),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string; cluster_type: string }) => {
    if (!SELF_MANAGED_CLUSTER_TYPES.has(args.cluster_type)) {
      return {
        isError: true,
        content: [{ type: "text", text: "Events are only available for self-managed clusters (OCP/SNO)." }],
      };
    }

    const result = await getClusterEvents(args.cluster_id);

    let events: ClusterEvent[];
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      events = [...result.events];
      dataSource = result.dataSource;
    } else {
      const mockEvents = OCP_MOCK_CLUSTER_EVENTS[args.cluster_id];
      if (mockEvents) {
        events = mockEvents;
        dataSource = "mock";
      } else {
        events = [];
        dataSource = "mock";
      }
    }

    const lines = events.map(
      (e) => `[${e.timestamp}] ${e.severity.toUpperCase()}: ${e.message}`,
    );

    return {
      content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "No events found." }],
      structuredContent: { events, total: events.length, dataSource, cluster_id: args.cluster_id },
    };
  },
);

registerAppTool(
  server,
  "get_cluster_logs_url",
  {
    title: "Get Cluster Logs Download URL",
    description: "Returns a download URL for cluster logs of a self-managed OpenShift cluster (OCP/SNO only).",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
      cluster_type: z.string().min(1),
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string; cluster_type: string }) => {
    if (!SELF_MANAGED_CLUSTER_TYPES.has(args.cluster_type)) {
      return {
        isError: true,
        content: [{ type: "text", text: "Logs download is only available for self-managed clusters (OCP/SNO)." }],
      };
    }

    const result = await getClusterLogsUrl(args.cluster_id);

    let url: string;
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      url = result.url;
      dataSource = result.dataSource;
    } else {
      const mockUrl = OCP_MOCK_LOGS_URLS[args.cluster_id];
      if (mockUrl) {
        url = mockUrl;
        dataSource = "mock";
      } else {
        return {
          isError: true,
          content: [{ type: "text", text: `Logs not available for cluster: ${args.cluster_id}` }],
        };
      }
    }

    return {
      content: [{ type: "text", text: `Logs download URL: ${url}\nNote: This link may expire. Generate a new one if needed.` }],
      structuredContent: { url, dataSource, cluster_id: args.cluster_id },
    };
  },
);

registerAppTool(
  server,
  "create_ocp_cluster",
  {
    title: "Create OpenShift Cluster",
    description: "Creates a new self-managed OpenShift cluster via the Assisted Installer API.",
    inputSchema: z.object({
      cluster_name: z.string().min(1).max(54),
      openshift_version: z.string().min(1),
      base_dns_domain: z.string().min(1),
      high_availability_mode: z.enum(["Full", "None"]),
      network_type: z.enum(["OVNKubernetes", "OpenShiftSDN"]).default("OVNKubernetes"),
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_name: string; openshift_version: string; base_dns_domain: string; high_availability_mode: "Full" | "None"; network_type: "OVNKubernetes" | "OpenShiftSDN" }) => {
    const params: CreateClusterParams = {
      name: args.cluster_name,
      openshift_version: args.openshift_version,
      base_dns_domain: args.base_dns_domain,
      high_availability_mode: args.high_availability_mode,
      network_type: args.network_type,
    };

    const result = await createCluster(params);

    let cluster: { id: string; name: string; status: string; type: string };
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      cluster = { id: result.cluster_id, name: result.name, status: result.status, type: args.high_availability_mode === "None" ? "SNO" : "OCP" };
      dataSource = result.dataSource;
    } else {
      const mock = createMockCluster(args);
      cluster = { id: mock.id, name: mock.name, status: mock.status, type: mock.type };
      dataSource = "mock";
    }

    return {
      content: [{ type: "text", text: `Cluster '${cluster.name}' created. ID: ${cluster.id}. Status: ${cluster.status}.` }],
      structuredContent: { cluster_id: cluster.id, name: cluster.name, status: cluster.status, type: cluster.type, dataSource },
    };
  },
);

registerAppTool(
  server,
  "get_cluster_hosts",
  {
    title: "Get Cluster Hosts",
    description: "Returns registered hosts and discovery ISO URL for a self-managed OpenShift cluster.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string }) => {
    const result = await getClusterHosts(args.cluster_id);

    let hosts: HostInfo[];
    let discoveryIsoUrl: string;
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      hosts = [...result.hosts];
      discoveryIsoUrl = result.discoveryIsoUrl;
      dataSource = result.dataSource;
    } else {
      hosts = OCP_MOCK_HOSTS[args.cluster_id] ?? [];
      discoveryIsoUrl = OCP_MOCK_DISCOVERY_ISO[args.cluster_id] ?? "";
      dataSource = "mock";
    }

    const lines = hosts.map((h) => `${h.hostname} (${h.role}) — ${h.status}`);

    return {
      content: [{ type: "text", text: lines.length > 0 ? `${lines.length} host(s):\n${lines.join("\n")}` : "No hosts registered." }],
      structuredContent: { hosts, discoveryIsoUrl, total: hosts.length, dataSource, cluster_id: args.cluster_id },
    };
  },
);

registerAppTool(
  server,
  "set_host_role",
  {
    title: "Set Host Role",
    description: "Assigns a role (master or worker) to a host in a self-managed OpenShift cluster.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
      host_id: z.string().min(1),
      role: z.enum(["master", "worker"]),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string; host_id: string; role: "master" | "worker" }) => {
    const result = await setHostRole(args.cluster_id, args.host_id, args.role);

    if (result.ok === true) {
      return {
        content: [{ type: "text", text: `Host ${args.host_id} role set to ${args.role}.` }],
        structuredContent: { host_id: args.host_id, role: args.role, dataSource: result.dataSource },
      };
    }

    // Mock fallback — just confirm
    return {
      content: [{ type: "text", text: `Host ${args.host_id} role set to ${args.role}. (mock)` }],
      structuredContent: { host_id: args.host_id, role: args.role, dataSource: "mock" },
    };
  },
);

registerAppTool(
  server,
  "set_cluster_vips",
  {
    title: "Set Cluster VIPs",
    description: "Configures API and Ingress Virtual IPs for a self-managed OpenShift cluster.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
      api_vip: z.string().min(1),
      ingress_vip: z.string().min(1),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string; api_vip: string; ingress_vip: string }) => {
    const result = await setClusterVips(args.cluster_id, args.api_vip, args.ingress_vip);

    if (result.ok === true) {
      return {
        content: [{ type: "text", text: `VIPs configured. API: ${args.api_vip}, Ingress: ${args.ingress_vip}.` }],
        structuredContent: { api_vip: args.api_vip, ingress_vip: args.ingress_vip, dataSource: result.dataSource },
      };
    }

    return {
      content: [{ type: "text", text: `VIPs configured. API: ${args.api_vip}, Ingress: ${args.ingress_vip}. (mock)` }],
      structuredContent: { api_vip: args.api_vip, ingress_vip: args.ingress_vip, dataSource: "mock" },
    };
  },
);

registerAppTool(
  server,
  "start_cluster_installation",
  {
    title: "Start Cluster Installation",
    description: "Triggers installation of a self-managed OpenShift cluster. Requires hosts and VIPs to be configured.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string }) => {
    const result = await startInstallation(args.cluster_id);

    const dataSource = result.ok === true ? result.dataSource : "mock";

    return {
      content: [{ type: "text", text: `Installation started for cluster ${args.cluster_id}.` }],
      structuredContent: { cluster_id: args.cluster_id, status: "installing", dataSource },
    };
  },
);

registerAppTool(
  server,
  "get_installation_progress",
  {
    title: "Get Installation Progress",
    description: "Returns current installation status and progress for a self-managed OpenShift cluster.",
    inputSchema: z.object({
      cluster_id: z.string().min(1),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: {
      ui: { resourceUri: ocpAdminResourceUri },
      "openai/outputTemplate": ocpAdminResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args: { cluster_id: string }) => {
    const result = await getInstallationProgress(args.cluster_id);

    let progress: InstallationProgress;
    let dataSource: "live" | "mock";

    if (result.ok === true) {
      progress = result.progress;
      dataSource = result.dataSource;
    } else {
      progress = OCP_MOCK_INSTALL_STATUS[args.cluster_id] ?? { status: "pending-for-input", progress: 0, statusInfo: "Waiting for configuration" };
      dataSource = "mock";
    }

    return {
      content: [{ type: "text", text: `Status: ${progress.status} (${progress.progress}%)${progress.statusInfo ? ` — ${progress.statusInfo}` : ""}` }],
      structuredContent: { ...progress, dataSource, cluster_id: args.cluster_id },
    };
  },
);

registerAppTool(
  server,
  "get_cpu_information",
  {
    title: "Get Local CPU Information",
    description: "Returns local CPU model, core counts, frequency, and load averages.",
    inputSchema: getCpuInformationSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args) => handleGetCpuInformation(args),
);

registerAppTool(
  server,
  "generate_sosreport",
  {
    title: "Generate Local Sosreport",
    description: "Generates a local sosreport archive using non-interactive sudo execution.",
    inputSchema: generateSosreportSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    const requestedWorkflowSessionId = normalizeSessionId(args.workflow_session_id);
    const workflowState = requestedWorkflowSessionId
      ? getWorkflowStateByWorkflowSessionId(userId, requestedWorkflowSessionId)
      : null;
    if (requestedWorkflowSessionId && !workflowState) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Workflow session is invalid or no longer active. Restart Step 1 and retry generate.",
        }],
        structuredContent: { code: "workflow_session_invalid", next_step: "select_product" },
      };
    }
    const sessionId = workflowState?.sessionId ?? resolveMcpSessionId(extra, userId);
    if (!hasCompletedStep1LinuxSelection(userId, sessionId)) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: [
            "Step 1 required before diagnostics.",
            "Select product linux first, then request consent token and run generate_sosreport.",
            "If using tools directly: call start_engage_red_hat_support, then select_engage_product with product=linux.",
          ].join("\n"),
        }],
        structuredContent: { code: "product_selection_required", next_step: "select_product" },
      };
    }
    const decision = authorizeSensitiveToolCall({
      toolName: "generate_sosreport",
      consentToken: args.consent_token,
      userId,
      sessionId,
      consentService: consentTokenService,
    });
    if (!decision.allowed) {
      emitSecurityEvent({
        action: "consent_authorize",
        outcome: "denied",
        userId,
        errorCode: decision.reasonCode,
      });
      return {
        isError: true,
        content: [{ type: "text", text: decision.safeText }],
        structuredContent: {
          code: decision.reasonCode,
          next_step: "mint_consent_then_generate",
        },
      };
    }
    pruneExpiredGenerateJobs();
    const job = createGenerateJob({ userId, sessionId });
    runGenerateJob({
      jobId: job.jobId,
      userId,
      args,
      consentJti: decision.claims.jti,
      consentScope: decision.claims.scope,
      consentStep: decision.claims.step,
    });
    return {
      content: [
        {
          type: "text",
          text: [
            "Generate started. Poll status until completed, then fetch using returned fetch_reference.",
            `job_id: ${job.jobId}`,
            "status: queued",
          ].join("\n"),
        },
      ],
      structuredContent: {
        job_id: job.jobId,
        status: "queued",
        next_step: "poll_generate_status",
      },
    };
  },
);

registerAppTool(
  server,
  "fetch_sosreport",
  {
    title: "Fetch Local Sosreport Archive",
    description: "Fetches generated sosreport archive metadata and copies file to /tmp.",
    inputSchema: fetchSosreportSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args) => handleFetchSosreport(args),
);

registerAppTool(
  server,
  "get_generate_sosreport_status",
  {
    title: "Get Generate Sosreport Status",
    description: "Returns async generate_sosreport job status and fetch_reference when completed.",
    inputSchema: GENERATE_JOB_STATUS_SCHEMA,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    pruneExpiredGenerateJobs();
    const userId = resolveMcpUserId(extra?.authInfo);
    const sessionId = resolveMcpSessionId(extra, userId);
    const job = getOwnedGenerateJob({ jobId: args.job_id, userId, sessionId });
    if (!job) {
      return {
        isError: true,
        content: [{ type: "text", text: "Generate job not found. Start generate again." }],
        structuredContent: {
          code: "job_not_found",
          job_id: args.job_id,
        },
      };
    }
    return {
      content: [{ type: "text", text: mapGenerateJobState(job).text }],
      structuredContent: mapGenerateJobState(job),
    };
  },
);

registerAppTool(
  server,
  "jira_connect_secure",
  {
    title: "Connect Jira Securely",
    description: "Creates Jira connection and stores PAT in backend vault.",
    inputSchema: connectSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    try {
      const created = await createSecureJiraConnection(userId, normalizeConnectInput(args));
      return {
        content: [{ type: "text", text: created.text }],
        structuredContent: created,
      };
    } catch (_error) {
      emitSecurityEvent({ action: "connect", outcome: "failed", userId });
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Connection failed. Verify URL and credentials.",
        }],
      };
    }
  },
);

registerAppTool(
  server,
  "jira_connection_status",
  {
    title: "Jira Connection Status",
    description: "Returns non-sensitive Jira connection status.",
    inputSchema: connectionIdSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    return handleConnectionStatus(
      { userId, lifecycle: lifecycleStore, vault: tokenVault, client: jiraClient },
      args.connection_id,
    );
  },
);

registerAppTool(
  server,
  "jira_list_attachments",
  {
    title: "List Jira Issue Attachments",
    description: "Lists attachment metadata for a Jira issue by opaque connection reference.",
    inputSchema: listAttachmentsSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    try {
      return await handleListAttachments(
        { userId, lifecycle: lifecycleStore, vault: tokenVault, client: jiraClient },
        args.connection_id,
        args.issue_key,
      );
    } catch (error) {
      const mapped = error as JiraMappedError;
      return {
        isError: true,
        content: [{ type: "text", text: mapped.message ?? "Failed to list attachments." }],
      };
    }
  },
);

registerAppTool(
  server,
  "jira_attach_artifact",
  {
    title: "Attach Local Artifact to Jira Issue",
    description: "Uploads a selected local artifact using opaque Jira connection reference.",
    inputSchema: attachArtifactSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    try {
      return await handleAttachArtifact(
        { userId, lifecycle: lifecycleStore, vault: tokenVault, client: jiraClient },
        args.connection_id,
        args.issue_key,
        args.artifact_ref,
      );
    } catch (error) {
      const mapped = error as JiraMappedError;
      return {
        isError: true,
        content: [{ type: "text", text: mapped.message ?? "Failed to attach artifact." }],
      };
    }
  },
);

registerAppTool(
  server,
  "jira_disconnect",
  {
    title: "Disconnect Jira Connection",
    description: "Revokes a Jira connection by opaque reference.",
    inputSchema: connectionIdSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
    _meta: {
      ui: { resourceUri: engageResourceUri },
      "openai/outputTemplate": engageResourceUri,
      "openai/widgetAccessible": true,
    },
  },
  async (args, extra) => {
    const userId = resolveMcpUserId(extra?.authInfo);
    return handleDisconnect(
      { userId, lifecycle: lifecycleStore, vault: tokenVault, client: jiraClient },
      args.connection_id,
    );
  },
);

server.registerResource(
  "engage-red-hat-support-skill",
  ENGAGE_SKILL_RESOURCE_URI,
  { mimeType: SKILL_RESOURCE_MIME_TYPE },
  async () => ({
    contents: [
      {
        uri: ENGAGE_SKILL_RESOURCE_URI,
        mimeType: SKILL_RESOURCE_MIME_TYPE,
        text: await loadEngageSkillMarkdown(),
      },
    ],
  }),
);

server.registerResource(
  "ocp-admin-skill",
  OCP_ADMIN_SKILL_RESOURCE_URI,
  { mimeType: SKILL_RESOURCE_MIME_TYPE },
  async () => ({
    contents: [
      {
        uri: OCP_ADMIN_SKILL_RESOURCE_URI,
        mimeType: SKILL_RESOURCE_MIME_TYPE,
        text: await loadOcpAdminSkillMarkdown(),
      },
    ],
  }),
);

server.registerResource(
  "engage-sosreport-generate-job",
  new ResourceTemplate("resource://engage/sosreport/jobs/{jobId}", { list: undefined }),
  {
    title: "Engage sosreport generate job state",
    description: "Reports async generate_sosreport job status and fetch_reference when completed.",
    mimeType: "application/json",
  },
  async (_uri, params) => {
    pruneExpiredGenerateJobs();
    const jobId = String(params.jobId ?? "").trim();
    const job = generateSosreportJobs.get(jobId);
    if (!job) {
      return {
        contents: [
          {
            uri: toGenerateJobResourceUri(jobId),
            mimeType: "application/json",
            text: JSON.stringify({
              job_id: jobId,
              status: "missing",
              error_code: "job_not_found",
              text: "Generate job not found.",
            }),
          },
        ],
      };
    }
    return {
      contents: [
        {
          uri: toGenerateJobResourceUri(job.jobId),
          mimeType: "application/json",
          text: JSON.stringify({
            job_id: job.jobId,
            status: job.status,
            fetch_reference: job.fetchReference,
            error_code: job.errorCode,
            text:
              job.status === "succeeded"
                ? "Generate completed successfully."
                : job.status === "failed"
                  ? (job.errorText ?? "Generate failed.")
                  : "Generate in progress.",
          }),
        },
      ],
    };
  },
);

server.registerResource(
  "engage-troubleshooting-cpu-telemetry",
  new ResourceTemplate("resource://engage/troubleshooting/cpu/{workflowSessionId}", { list: undefined }),
  {
    title: "Engage troubleshooting CPU telemetry",
    description: "Provides rolling, session-scoped CPU telemetry samples for troubleshooting UI.",
    mimeType: "application/json",
  },
  async (_uri, params) => {
    const workflowSessionId = String(params.workflowSessionId ?? "").trim();
    const workflowState = getAnyWorkflowStateByWorkflowSessionId(workflowSessionId);
    const buffer = workflowState ? getOrCreateCpuTelemetryBuffer(workflowState) : undefined;
    const payload = {
      workflow_session_id: workflowSessionId,
      sample_count: buffer?.samples.length ?? 0,
      samples: buffer?.samples ?? [],
      text: buffer ? buildCpuTelemetryText(buffer) : "Troubleshooting CPU telemetry is unavailable for this session.",
      error_code: buffer?.lastErrorCode,
    };
    return {
      contents: [
        {
          uri: toTroubleshootingCpuResourceUri(workflowSessionId),
          mimeType: "application/json",
          text: JSON.stringify(payload),
        },
      ],
    };
  },
);

server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  const uri = String(request.params.uri ?? "").trim();
  if (uri.startsWith("resource://engage/sosreport/jobs/")) {
    resourceSubscriptions.add(uri);
  }
  const telemetryWorkflowSessionId = getWorkflowSessionIdFromCpuResourceUri(uri);
  if (telemetryWorkflowSessionId) {
    resourceSubscriptions.add(uri);
    const currentCount = cpuTelemetrySubscriberCounts.get(telemetryWorkflowSessionId) ?? 0;
    cpuTelemetrySubscriberCounts.set(telemetryWorkflowSessionId, currentCount + 1);
    startCpuTelemetryJobIfNeeded(telemetryWorkflowSessionId);
    void collectCpuTelemetryTick(telemetryWorkflowSessionId).catch(() => {});
  }
  return {};
});

server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  const uri = String(request.params.uri ?? "").trim();
  if (uri.startsWith("resource://engage/sosreport/jobs/")) {
    resourceSubscriptions.delete(uri);
  }
  const telemetryWorkflowSessionId = getWorkflowSessionIdFromCpuResourceUri(uri);
  if (telemetryWorkflowSessionId) {
    const currentCount = cpuTelemetrySubscriberCounts.get(telemetryWorkflowSessionId) ?? 0;
    const nextCount = Math.max(0, currentCount - 1);
    if (nextCount === 0) {
      cpuTelemetrySubscriberCounts.delete(telemetryWorkflowSessionId);
      resourceSubscriptions.delete(uri);
    } else {
      cpuTelemetrySubscriberCounts.set(telemetryWorkflowSessionId, nextCount);
    }
    stopCpuTelemetryJobIfIdle(telemetryWorkflowSessionId);
  }
  return {};
});

const registerEngageUiResource = (uri: string) => registerAppResource(
  server,
  uri,
  uri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await loadEngageWidgetHtml();
    const widgetDomain = process.env.WIDGET_DOMAIN?.trim() || DEFAULT_WIDGET_DOMAIN;
    return {
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          _meta: {
            "openai/widgetDomain": widgetDomain,
            "openai/widgetCSP": {
              connect_domains: [widgetDomain],
            },
          },
          text: html,
        },
      ],
    };
  },
);

registerEngageUiResource(engageResourceUri);
registerEngageUiResource(engageStepSelectUri);
registerEngageUiResource(engageStepTroubleshootingUri);
registerEngageUiResource(engageStepSosUri);
registerEngageUiResource(engageStepJiraUri);

const registerOcpAdminUiResource = (uri: string) => registerAppResource(
  server,
  uri,
  uri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await loadOcpAdminWidgetHtml();
    const widgetDomain = process.env.WIDGET_DOMAIN?.trim() || DEFAULT_WIDGET_DOMAIN;
    return {
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          _meta: {
            "openai/widgetDomain": widgetDomain,
            "openai/widgetCSP": {
              connect_domains: [widgetDomain],
            },
          },
          text: html,
        },
      ],
    };
  },
);

registerOcpAdminUiResource(ocpAdminResourceUri);

export const createApp = () => {
  const app = express();
  const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use((req, _res, next) => {
    const raw = { httpHeaderUserId: req.header("x-user-id") };
    req.userId = resolveUserId(raw);
    req.sessionId = normalizeSessionId(req.header("x-session-id")) ?? `http-session:${req.userId}`;
    debugResolvedUserId("http", raw, req.userId);
    next();
  });

  if (USER_ID_DEBUG_ENABLED) {
    app.get("/debug/user-id", (req, res) => {
      const rawHeader = req.header("x-user-id");
      return res.status(200).json({
        debug_enabled: true,
        default_user_id: DEFAULT_USER_ID,
        header_x_user_id: rawHeader ?? null,
        resolved_user_id: req.userId,
      });
    });
  }

  app.get("/privacy", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send(
        [
          "Privacy Policy",
          "",
          "This app only processes the minimum data required to fulfill requests.",
          "PAT credentials are handled in backend-only encrypted storage.",
          "No secret values are exposed in MCP payloads, prompts, transcripts, or logs.",
          "For details on data categories, purposes, recipients, and user controls,",
          "provide a full policy at https://leisured-carina-unpromotable.ngrok-free.dev/privacy.",
        ].join("\n"),
      );
  });

  app.get("/support", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send(
        [
          "Support",
          "",
          "For help, visit https://leisured-carina-unpromotable.ngrok-free.dev/support.",
        ].join("\n"),
      );
  });

  app.post("/api/engage/consent-tokens", (req, res) => {
    const parsed = CONSENT_MINT_SCHEMA.safeParse(req.body);
    if (!parsed.success) {
      emitSecurityEvent({
        action: "consent_mint",
        outcome: "failed",
        userId: req.userId,
        errorCode: "validation_error",
      });
      return res.status(400).json({
        code: "validation_error",
        message: "Invalid consent mint request.",
        text: "Consent mint request is invalid. Retry Step 2 Generate.",
      });
    }
    const requestedWorkflowSessionId = normalizeSessionId(parsed.data.workflow_session_id);
    const mint = mintConsentTokenForGenerate({
      userId: req.userId,
      fallbackSessionId: req.sessionId,
      requestedSessionId: normalizeSessionId(parsed.data.session_id),
      requestedWorkflowSessionId,
      clientActionId: parsed.data.client_action_id,
    });
    if (!mint.ok) {
      return res.status(409).json({
        code: mint.code,
        message: mint.message,
        text: mint.text,
      });
    }
    return res.status(201).json({
      consent_token: mint.consentToken,
      expires_at: mint.expiresAt,
      scope: mint.scope,
      step: mint.step,
      text: "Consent token minted for Step 2 generate_sosreport.",
    });
  });

  app.post("/api/engage/workflow/start", (req, res) => {
    const sessionId = normalizeSessionId(req.body?.session_id) ?? req.sessionId;
    const state = getOrCreateWorkflowState(req.userId, sessionId);
    return res.status(200).json({
      workflow: "engage_red_hat_support",
      workflow_session_id: state.workflowSessionId,
      current_step: "select_product",
      text: "Step 1: select product linux to continue.",
    });
  });

  app.post("/api/engage/workflow/select-product", (req, res) => {
    const product = String(req.body?.product ?? "").trim().toLowerCase();
    if (product !== "linux") {
      return res.status(422).json({
        code: "unsupported_product",
        message: "Only linux is supported in this workflow.",
        text: "Select linux to continue.",
      });
    }
    const requestedWorkflowSessionId = normalizeSessionId(req.body?.workflow_session_id);
    const workflowState = requestedWorkflowSessionId
      ? getWorkflowStateByWorkflowSessionId(req.userId, requestedWorkflowSessionId)
      : null;
    if (requestedWorkflowSessionId && !workflowState) {
      return res.status(409).json({
        code: "workflow_session_invalid",
        message: "Workflow session is invalid or no longer active.",
        text: "Restart Step 1 and retry product selection.",
      });
    }
    const sessionId = workflowState?.sessionId ?? normalizeSessionId(req.body?.session_id) ?? req.sessionId;
    const state = markWorkflowProductSelection(req.userId, sessionId, "linux");
    return res.status(200).json({
      workflow: "engage_red_hat_support",
      workflow_session_id: state.workflowSessionId,
      selected_product: "linux",
      current_step: "troubleshooting",
      text: "Step 1 complete. Continue to troubleshooting CPU review before generating sosreport.",
    });
  });

  app.get("/api/sosreport/jobs/:job_id", (req, res) => {
    pruneExpiredGenerateJobs();
    const jobId = String(req.params.job_id ?? "").trim();
    if (!jobId) {
      return res.status(400).json({
        code: "validation_error",
        message: "Missing job id.",
        text: "Provide a valid sosreport generate job id.",
      });
    }
    const job = getOwnedGenerateJob({ jobId, userId: req.userId, sessionId: req.sessionId });
    if (!job) {
      return res.status(404).json({
        code: "job_not_found",
        message: "Generate job not found.",
        text: "Start generate again to obtain a valid job id.",
      });
    }
    return res.status(200).json(mapGenerateJobState(job));
  });

  app.post("/api/jira/connection", (_req, res) => {
    return res.status(404).json({
      code: "not_found",
      message: "Endpoint not found.",
      text: "Use POST /api/jira/connections (plural) with Cloud or bearer credential intake fields.",
    });
  });

  app.post("/api/jira/connections", async (req, res) => {
    try {
      const parsed = connectSchema.parse(req.body);
      const created = await createSecureJiraConnection(req.userId, normalizeConnectInput(parsed));
      return res.status(201).json(created);
    } catch (error) {
      const message = safeError(error).message;
      emitSecurityEvent({ action: "connect", outcome: "failed", userId: req.userId });
      return res.status(422).json({
        code: "validation_error",
        message,
        text: "Connection failed. Verify URL and credentials.",
      });
    }
  });

  app.get("/api/jira/connections/:connection_id", async (req, res) => {
    const conn = await lifecycleStore.getOwned(req.userId, req.params.connection_id);
    if (!conn) {
      return res.status(404).json({
        code: "not_found",
        message: "Connection not found.",
        text: "No Jira connection found for the current user.",
      });
    }
    emitSecurityEvent({
      action: "verify",
      outcome: "success",
      userId: req.userId,
      connectionId: conn.connectionId,
    });
    return res.status(200).json({
      connection_id: conn.connectionId,
      jira_base_url: conn.jiraBaseUrl,
      status: conn.status,
      expires_at: conn.expiresAt,
      last_verified_at: conn.lastVerifiedAt,
      text: `Connection is ${conn.status}.`,
    });
  });

  app.delete("/api/jira/connections/:connection_id", async (req, res) => {
    const conn = await lifecycleStore.revoke(req.userId, req.params.connection_id);
    if (!conn) {
      return res.status(404).json({
        code: "not_found",
        message: "Connection not found.",
        text: "No Jira connection found to revoke.",
      });
    }
    await tokenVault.revoke(conn.connectionId);
    emitSecurityEvent({
      action: "revoke",
      outcome: "success",
      userId: req.userId,
      connectionId: conn.connectionId,
    });
    return res.status(204).send();
  });

  app.get("/api/jira/issues/:issue_key/attachments", async (req, res) => {
    const connectionId = String(req.header("x-connection-id") ?? "");
    if (!connectionId) {
      return res.status(400).json({
        code: "validation_error",
        message: "Missing X-Connection-Id header.",
        text: "Provide an opaque connection reference.",
      });
    }
    const conn = await lifecycleStore.getOwned(req.userId, connectionId);
    if (!conn) {
      emitSecurityEvent({ action: "list_attachments", outcome: "denied", userId: req.userId });
      return res.status(404).json({ code: "not_found", message: "Connection not found.", text: "Reconnect and try again." });
    }
    if (conn.status === "expired" || conn.status === "revoked") {
      const code = conn.status === "expired" ? "connection_expired" : "connection_revoked";
      return res.status(401).json({ code, message: "Connection is not active.", text: "Reconnect before listing attachments." });
    }
    const secret = await tokenVault.resolve(connectionId);
    if (!secret) {
      return res.status(401).json({ code: "invalid_credentials", message: "Credentials missing.", text: "Reconnect before listing attachments." });
    }
    try {
      const auth = authFromConnection(conn, secret);
      if (!auth) {
        return res.status(401).json({ code: "invalid_credentials", message: "Credentials missing.", text: "Reconnect before listing attachments." });
      }
      const attachments = await jiraClient.listAttachments(conn.jiraBaseUrl, auth, req.params.issue_key);
      emitSecurityEvent({
        action: "list_attachments",
        outcome: "success",
        userId: req.userId,
        connectionId,
      });
      return res.status(200).json({
        issue_key: req.params.issue_key,
        attachments,
        text: `Found ${attachments.length} attachment(s).`,
      });
    } catch (error) {
      const mapped = error as JiraMappedError;
      await lifecycleStore.markError(req.userId, connectionId, mapped.code ?? "unexpected_error");
      return res.status(mapped.status ?? 500).json({
        code: mapped.code ?? "unexpected_error",
        message: sanitizeForLog(mapped.message ?? "Failed to list attachments."),
        text: "Could not list attachments.",
      });
    }
  });

  app.post("/api/jira/issues/:issue_key/attachments", async (req, res) => {
    const connectionId = String(req.header("x-connection-id") ?? "");
    if (!connectionId) {
      return res.status(400).json({
        code: "validation_error",
        message: "Missing X-Connection-Id header.",
        text: "Provide an opaque connection reference.",
      });
    }
    const parsed = attachArtifactSchema.safeParse({
      connection_id: connectionId,
      issue_key: req.params.issue_key,
      artifact_ref: req.body?.artifact_ref,
    });
    if (!parsed.success) {
      return res.status(422).json({
        code: "validation_error",
        message: "Invalid attachment request.",
        text: "Provide issue and artifact details.",
      });
    }
    const conn = await lifecycleStore.getOwned(req.userId, connectionId);
    if (!conn) {
      return res.status(404).json({ code: "not_found", message: "Connection not found.", text: "Reconnect and try again." });
    }
    if (conn.status === "expired" || conn.status === "revoked") {
      const code = conn.status === "expired" ? "connection_expired" : "connection_revoked";
      return res.status(401).json({ code, message: "Connection is not active.", text: "Reconnect before attaching files." });
    }
    const secret = await tokenVault.resolve(connectionId);
    if (!secret) {
      return res.status(401).json({ code: "invalid_credentials", message: "Credentials missing.", text: "Reconnect before attaching files." });
    }
    try {
      const artifactRef = String(req.body.artifact_ref);
      const artifact = await resolveArtifactSelection(artifactRef);
      const auth = authFromConnection(conn, secret);
      if (!auth) {
        return res.status(401).json({ code: "invalid_credentials", message: "Credentials missing.", text: "Reconnect before attaching files." });
      }
      const uploaded = await jiraClient.attachArtifact(
        conn.jiraBaseUrl,
        auth,
        req.params.issue_key,
        artifact.filePath,
        artifact.filename,
      );
      emitSecurityEvent({
        action: "attach",
        outcome: "success",
        userId: req.userId,
        connectionId,
      });
      return res.status(201).json({
        ...uploaded,
        text: `Attached ${uploaded.filename} to ${req.params.issue_key}.`,
      });
    } catch (error) {
      const mapped = error as JiraMappedError;
      await lifecycleStore.markError(req.userId, connectionId, mapped.code ?? "unexpected_error");
      return res.status(mapped.status ?? 500).json({
        code: mapped.code ?? "unexpected_error",
        message: sanitizeForLog(mapped.message ?? "Attachment failed."),
        text: "Could not attach artifact.",
      });
    }
  });

  app.all("/mcp", async (req, res) => {
    try {
      const headerValue = req.header("mcp-session-id");
      const sessionId = typeof headerValue === "string" && headerValue.trim().length > 0
        ? headerValue
        : undefined;

      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId) {
        transport = mcpTransports.get(sessionId);
      } else if (req.method === "POST") {
        let registeredSessionId: string | undefined;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            registeredSessionId = newSessionId;
            mcpTransports.set(newSessionId, transport!);
          },
        });

        transport.onclose = () => {
          if (registeredSessionId) {
            mcpTransports.delete(registeredSessionId);
          }
        };

        await server.connect(transport);
      }

      if (!transport) {
        if (!sessionId && req.method !== "POST") {
          return res.status(400).json({
            code: "invalid_request",
            message: "Session required for non-POST MCP requests.",
          });
        }

        return res.status(404).json({
          code: "session_not_found",
          message: "MCP session not found.",
        });
      }

      await transport.handleRequest(req, res, req.body);
      return;
    } catch (error) {
      return res.status(500).json({
        code: "internal_error",
        message: safeError(error).message,
      });
    }
  });

  return app;
};

declare global {
  namespace Express {
    interface Request {
      userId: string;
      sessionId: string;
    }
  }
}

const port = Number.parseInt(process.env.PORT ?? "", 10) || 3001;
const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(port, (err) => {
    if (err) {
      console.error("Error starting server:", safeError(err).message);
      process.exit(1);
    }
    console.log(`Server listening on http://localhost:${port}/mcp`);
  });
}
