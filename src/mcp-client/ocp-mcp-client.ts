import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "child_process";

// --- Types ---

export type OcpClusterRow = {
  readonly name: string;
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly version: string;
  readonly provider: string;
  readonly region: string;
};

export type ClusterListResult =
  | { readonly ok: true; readonly clusters: readonly OcpClusterRow[]; readonly dataSource: "live" | "partial"; readonly errors: readonly string[] }
  | { readonly ok: false; readonly error: string };

export type ClusterDetailInfo = {
  readonly name: string;
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly version: string;
  readonly provider: string;
  readonly region: string;
  readonly created_at?: string;
  readonly api_vip?: string;
  readonly ingress_vip?: string;
  readonly api_url?: string;
  readonly console_url?: string;
  readonly dns_domain?: string;
  readonly host_count?: number;
  readonly network_type?: string;
  readonly cluster_network_cidr?: string;
  readonly service_network_cidr?: string;
  readonly platform_type?: string;
  readonly source?: string;
};

export type ClusterDetailResult =
  | { ok: true; detail: ClusterDetailInfo; dataSource: "live" }
  | { ok: false; error: string };

export type ClusterEvent = {
  readonly timestamp: string;
  readonly severity: string;
  readonly message: string;
  readonly category?: string;
};

export type ClusterEventsResult =
  | { readonly ok: true; readonly events: readonly ClusterEvent[]; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type ClusterLogsUrlResult =
  | { readonly ok: true; readonly url: string; readonly expires_at?: string; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type CreateClusterParams = {
  readonly name: string;
  readonly openshift_version: string;
  readonly base_dns_domain: string;
  readonly high_availability_mode: "Full" | "None";
  readonly network_type: "OVNKubernetes" | "OpenShiftSDN";
};

export type CreateClusterResult =
  | { readonly ok: true; readonly cluster_id: string; readonly name: string; readonly status: string; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type HostInfo = {
  readonly id: string;
  readonly hostname: string;
  readonly status: string;
  readonly role: string;
};

export type ClusterHostsResult =
  | { readonly ok: true; readonly hosts: readonly HostInfo[]; readonly discoveryIsoUrl: string; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type SetHostRoleResult =
  | { readonly ok: true; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type SetVipsResult =
  | { readonly ok: true; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type StartInstallationResult =
  | { readonly ok: true; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type InstallationProgress = {
  readonly status: string;
  readonly progress: number;
  readonly statusInfo?: string;
};

export type InstallationProgressResult =
  | { readonly ok: true; readonly progress: InstallationProgress; readonly dataSource: "live" }
  | { readonly ok: false; readonly error: string };

export type ServerConnectivityStatus = {
  readonly name: string;
  readonly status: "connected" | "not_connected" | "error";
  readonly description: string;
  readonly error?: string;
};

export type ConnectivityResult = {
  readonly podmanAvailable: boolean;
  readonly offlineTokenSet: boolean;
  readonly servers: readonly ServerConnectivityStatus[];
};

// --- Server Configuration ---

const MCP_IMAGE = "quay.io/ecosystem-appeng/assisted-service-mcp:ocm";
const SSO_URL = "https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token";
const PULL_SECRET_URL = "https://api.openshift.com/api/accounts_mgmt/v1/access_token";

type ServerConfig = {
  readonly name: string;
  readonly description: string;
  readonly inventoryUrl: string;
};

const SERVER_CONFIGS: readonly ServerConfig[] = [
  {
    name: "openshift-self-managed",
    description: "Assisted Installer API for OCP/SNO cluster lifecycle",
    inventoryUrl: "https://api.openshift.com/api/assisted-install/v2",
  },
  {
    name: "openshift-ocm-managed",
    description: "OCM API for managed service clusters (ROSA, ARO, OSD)",
    inventoryUrl: "https://api.openshift.com/api/clusters_mgmt/v1",
  },
];

// --- Connection Cache ---

type CachedConnection = {
  readonly client: Client;
  readonly transport: StdioClientTransport;
};

const connectionCache = new Map<string, CachedConnection>();

// --- Podman Availability ---

let podmanAvailableCache: boolean | null = null;

export function isPodmanAvailable(): boolean {
  if (podmanAvailableCache !== null) {
    return podmanAvailableCache;
  }
  try {
    execSync("which podman", { stdio: "ignore" });
    podmanAvailableCache = true;
  } catch {
    podmanAvailableCache = false;
  }
  return podmanAvailableCache;
}

// --- Connection Management ---

type EnsureConnectionOk = { ok: true; client: Client };
type EnsureConnectionFail = { ok: false; error: string };
type EnsureConnectionResult = EnsureConnectionOk | EnsureConnectionFail;

async function ensureConnection(serverConfig: ServerConfig): Promise<EnsureConnectionResult> {
  const cached = connectionCache.get(serverConfig.name);
  if (cached) {
    return { ok: true, client: cached.client };
  }

  const offlineToken = process.env.OFFLINE_TOKEN;
  if (!offlineToken) {
    return { ok: false, error: "OFFLINE_TOKEN not set" };
  }

  if (!isPodmanAvailable()) {
    return { ok: false, error: "podman not available" };
  }

  try {
    const transport = new StdioClientTransport({
      command: "podman",
      args: [
        "run", "--rm", "-i", "--network=host",
        "-e", `OFFLINE_TOKEN=${offlineToken}`,
        "-e", "TRANSPORT=stdio",
        "-e", `INVENTORY_URL=${serverConfig.inventoryUrl}`,
        "-e", `PULL_SECRET_URL=${PULL_SECRET_URL}`,
        "-e", `SSO_URL=${SSO_URL}`,
        MCP_IMAGE,
      ],
    });

    const client = new Client({ name: `ocp-client-${serverConfig.name}`, version: "1.0.0" });
    await client.connect(transport);

    connectionCache.set(serverConfig.name, { client, transport });
    return { ok: true, client };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown connection error";
    return { ok: false, error: `Failed to connect to ${serverConfig.name}: ${message}` };
  }
}

async function reconnect(serverConfig: ServerConfig): Promise<EnsureConnectionResult> {
  const cached = connectionCache.get(serverConfig.name);
  if (cached) {
    try {
      await cached.transport.close();
    } catch {
      // ignore close errors
    }
    connectionCache.delete(serverConfig.name);
  }
  return ensureConnection(serverConfig);
}

// --- Cluster Data Parsing ---

function parseClusterResponse(text: string, serverName: string): OcpClusterRow[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const clusters: OcpClusterRow[] = [];

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === "object" && "name" in parsed) {
        const obj = parsed as Record<string, unknown>;
        clusters.push({
          name: String(obj.name ?? ""),
          id: String(obj.id ?? obj.cluster_id ?? ""),
          status: String(obj.status ?? "unknown"),
          type: detectClusterType(serverName, obj),
          version: String(obj.openshift_version ?? obj.version ?? ""),
          provider: detectProvider(serverName, obj),
          region: String(obj.region ?? obj.cloud_provider_region ?? "-"),
        });
      }
    } catch {
      // line-by-line: try pipe-delimited fallback
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length >= 6) {
        clusters.push({
          name: parts[0],
          id: parts[1] ?? "",
          status: parts[2] ?? "unknown",
          type: parts[3] ?? "",
          version: parts[4] ?? "",
          provider: parts[5] ?? "",
          region: parts[6] ?? "-",
        });
      }
    }
  }

  if (clusters.length === 0) {
    const dashParsed = parseDashBulletFormat(text, serverName);
    if (dashParsed.length > 0) return dashParsed;
  }

  return clusters;
}

function parseDashBulletFormat(text: string, serverName: string): OcpClusterRow[] {
  const clusters: OcpClusterRow[] = [];
  const blocks = text.split(/\n(?=[0-9a-f]{8}-[0-9a-f]{4}-|[0-9a-f]{32,})/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const name = lines[0].trim();
    if (!name) continue;

    const fields: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const match = line.match(/^-\s*([^:]+):\s*(.*)$/);
      if (match) {
        fields[match[1].trim().toLowerCase()] = match[2].trim();
      }
    }

    const id = fields["id"] ?? name;
    const status = fields["status"] ?? "unknown";
    const version = fields["openshift version"] ?? fields["version"] ?? "";
    const provider = fields["cloud provider"] ?? fields["provider"] ?? "";
    const region = fields["region"] ?? fields["cloud region"] ?? "-";

    const obj: Record<string, unknown> = {
      cloud_provider: provider,
      product: fields["product"] ?? "",
    };

    clusters.push({
      name: name.length > 40 ? (fields["name"] ?? name) : name,
      id,
      status,
      type: detectClusterType(serverName, obj),
      version,
      provider: provider || detectProvider(serverName, obj),
      region: region || "-",
    });
  }

  return clusters;
}

function detectClusterType(serverName: string, obj: Record<string, unknown>): string {
  if (serverName === "openshift-self-managed") {
    const highAvail = String(obj.high_availability_mode ?? "");
    return highAvail === "None" ? "SNO" : "OCP";
  }
  const product = String(obj.product?.toString() ?? obj.cloud_provider ?? "").toLowerCase();
  if (product.includes("rosa")) return "ROSA";
  if (product.includes("aro")) return "ARO";
  if (product.includes("osd")) return "OSD";
  return "Managed";
}

function detectProvider(serverName: string, obj: Record<string, unknown>): string {
  if (serverName === "openshift-self-managed") {
    return String(obj.platform ?? obj.platform_type ?? "Self-managed");
  }
  const cp = String(obj.cloud_provider ?? "").toLowerCase();
  if (cp.includes("aws")) return "AWS";
  if (cp.includes("azure")) return "Azure";
  if (cp.includes("gcp")) return "GCP";
  return String(obj.cloud_provider ?? "Cloud");
}

// --- Public API ---

function unwrapConnection(result: EnsureConnectionResult): Client {
  if (result.ok === false) {
    throw new Error(result.error);
  }
  return result.client;
}

async function fetchClustersFromServer(config: ServerConfig): Promise<{ serverName: string; clusters: OcpClusterRow[] }> {
  const client = unwrapConnection(await ensureConnection(config));

  try {
    const toolResult = await client.callTool({ name: "list_clusters", arguments: {} });
    const textContent = toolResult.content as Array<{ type: string; text: string }>;
    const text = textContent.find((c) => c.type === "text")?.text ?? "";
    return { serverName: config.name, clusters: parseClusterResponse(text, config.name) };
  } catch {
    const retriedClient = unwrapConnection(await reconnect(config));
    const toolResult = await retriedClient.callTool({ name: "list_clusters", arguments: {} });
    const textContent = toolResult.content as Array<{ type: string; text: string }>;
    const text = textContent.find((c) => c.type === "text")?.text ?? "";
    return { serverName: config.name, clusters: parseClusterResponse(text, config.name) };
  }
}

export async function listClusters(): Promise<ClusterListResult> {
  const results = await Promise.allSettled(
    SERVER_CONFIGS.map((config) => fetchClustersFromServer(config)),
  );

  const allClusters: OcpClusterRow[] = [];
  const errors: string[] = [];
  let successCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      allClusters.push(...result.value.clusters);
      successCount++;
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (successCount === 0) {
    return { ok: false, error: errors.join("; ") };
  }

  return {
    ok: true,
    clusters: allClusters,
    dataSource: successCount === SERVER_CONFIGS.length ? "live" : "partial",
    errors,
  };
}

export async function checkConnectivity(): Promise<ConnectivityResult> {
  const podmanOk = isPodmanAvailable();
  const offlineTokenSet = typeof process.env.OFFLINE_TOKEN === "string" && process.env.OFFLINE_TOKEN.length > 0;

  const serverStatuses: ServerConnectivityStatus[] = [];

  for (const config of SERVER_CONFIGS) {
    if (!podmanOk || !offlineTokenSet) {
      serverStatuses.push({
        name: config.name,
        status: "not_connected",
        description: config.description,
        error: !podmanOk ? "podman not available" : "OFFLINE_TOKEN not set",
      });
      continue;
    }

    const connResult = await ensureConnection(config);
    if (connResult.ok === true) {
      serverStatuses.push({
        name: config.name,
        status: "connected",
        description: config.description,
      });
    } else {
      serverStatuses.push({
        name: config.name,
        status: "error",
        description: config.description,
        error: connResult.error,
      });
    }
  }

  return {
    podmanAvailable: podmanOk,
    offlineTokenSet,
    servers: serverStatuses,
  };
}

// --- Cluster Detail ---

const SELF_MANAGED_TYPES = new Set(["OCP", "SNO"]);

function serverConfigForClusterType(clusterType: string): ServerConfig {
  return SELF_MANAGED_TYPES.has(clusterType) ? SERVER_CONFIGS[0] : SERVER_CONFIGS[1];
}

function parseClusterDetailResponse(text: string, serverName: string): ClusterDetailInfo | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    return buildDetailFromObject(obj, serverName);
  } catch {
    return parseDashBulletDetail(text, serverName);
  }
}

function buildDetailFromObject(obj: Record<string, unknown>, serverName: string): ClusterDetailInfo {
  return {
    name: String(obj.name ?? ""),
    id: String(obj.id ?? obj.cluster_id ?? ""),
    status: String(obj.status ?? "unknown"),
    type: detectClusterType(serverName, obj),
    version: String(obj.openshift_version ?? obj.version ?? ""),
    provider: detectProvider(serverName, obj),
    region: String(obj.region ?? obj.cloud_provider_region ?? "-"),
    created_at: obj.created_at ? String(obj.created_at) : undefined,
    api_vip: obj.api_vip ? String(obj.api_vip) : obj.api_url ? String(obj.api_url) : undefined,
    ingress_vip: obj.ingress_vip ? String(obj.ingress_vip) : undefined,
    api_url: obj.api_url ? String(obj.api_url) : undefined,
    console_url: obj.console_url ? String(obj.console_url) : obj.console ? String((obj.console as Record<string, unknown>).url ?? "") : undefined,
    dns_domain: obj.base_dns_domain ? String(obj.base_dns_domain) : obj.dns_domain ? String(obj.dns_domain) : undefined,
    host_count: typeof obj.host_count === "number" ? obj.host_count : typeof obj.nodes === "object" && obj.nodes ? Object.keys(obj.nodes).length : undefined,
    network_type: obj.network_type ? String(obj.network_type) : undefined,
    cluster_network_cidr: extractCidr(obj.cluster_networks ?? obj.cluster_network_cidr),
    service_network_cidr: extractCidr(obj.service_networks ?? obj.service_network_cidr),
    platform_type: obj.platform ? String(typeof obj.platform === "object" ? (obj.platform as Record<string, unknown>).type ?? obj.platform : obj.platform) : undefined,
    source: serverName,
  };
}

function parseDashBulletDetail(text: string, serverName: string): ClusterDetailInfo | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  const fields: Record<string, string> = {};
  let name = "";

  for (const line of lines) {
    const match = line.match(/^-\s*([^:]+):\s*(.*)$/);
    if (match) {
      fields[match[1].trim().toLowerCase()] = match[2].trim();
    } else if (!name && line.trim() && !line.startsWith("-")) {
      name = line.trim();
    }
  }

  if (!name && !fields["id"] && !fields["name"]) return null;

  return {
    name: fields["name"] ?? name,
    id: fields["id"] ?? name,
    status: fields["status"] ?? "unknown",
    type: detectClusterType(serverName, { cloud_provider: fields["cloud provider"] ?? "", product: fields["product"] ?? "" }),
    version: fields["openshift version"] ?? fields["version"] ?? "",
    provider: fields["cloud provider"] ?? fields["provider"] ?? detectProvider(serverName, {}),
    region: fields["region"] ?? fields["cloud region"] ?? "-",
    created_at: fields["created at"] ?? fields["creation date"] ?? undefined,
    api_url: fields["api url"] ?? fields["api"] ?? undefined,
    console_url: fields["console url"] ?? fields["console"] ?? undefined,
    dns_domain: fields["dns domain"] ?? fields["base dns domain"] ?? undefined,
    network_type: fields["network type"] ?? undefined,
    source: serverName,
  };
}

function extractCidr(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "object" && first && "cidr" in first) return String(first.cidr);
    if (typeof first === "string") return first;
  }
  return undefined;
}

export async function getClusterEvents(clusterId: string): Promise<ClusterEventsResult> {
  const config = SERVER_CONFIGS[0]; // events only available on self-managed server

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const toolResult = await client.callTool({ name: "cluster_events", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return { ok: true, events: parseClusterEventsResponse(text), dataSource: "live" };
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const toolResult = await retriedClient.callTool({ name: "cluster_events", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return { ok: true, events: parseClusterEventsResponse(text), dataSource: "live" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function getClusterLogsUrl(clusterId: string): Promise<ClusterLogsUrlResult> {
  const config = SERVER_CONFIGS[0]; // logs only available on self-managed server

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const toolResult = await client.callTool({ name: "cluster_logs_download_url", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "".trim();
      return parseLogsUrlResponse(text);
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const toolResult = await retriedClient.callTool({ name: "cluster_logs_download_url", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "".trim();
      return parseLogsUrlResponse(text);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

function parseClusterEventsResponse(text: string): ClusterEvent[] {
  const events: ClusterEvent[] = [];

  try {
    const parsed: unknown = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        events.push({
          timestamp: String(obj.event_time ?? obj.timestamp ?? obj.created_at ?? ""),
          severity: String(obj.severity ?? obj.level ?? "info"),
          message: String(obj.message ?? obj.event ?? ""),
          category: obj.category ? String(obj.category) : undefined,
        });
      }
    }
  } catch {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        events.push({
          timestamp: String(obj.event_time ?? obj.timestamp ?? obj.created_at ?? ""),
          severity: String(obj.severity ?? obj.level ?? "info"),
          message: String(obj.message ?? obj.event ?? ""),
          category: obj.category ? String(obj.category) : undefined,
        });
      } catch {
        // skip unparseable lines
      }
    }
  }

  return events;
}

function parseLogsUrlResponse(text: string): ClusterLogsUrlResult {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const url = String(obj.url ?? obj.logs_url ?? obj.download_url ?? "");
      if (url) {
        return { ok: true, url, expires_at: obj.expires_at ? String(obj.expires_at) : undefined, dataSource: "live" };
      }
    }
  } catch {
    // text might be a raw URL
    const trimmed = text.trim();
    if (trimmed.startsWith("http")) {
      return { ok: true, url: trimmed, dataSource: "live" };
    }
  }
  return { ok: false, error: "Failed to parse logs download URL" };
}

export async function getClusterInfo(clusterId: string, clusterType: string): Promise<ClusterDetailResult> {
  const config = serverConfigForClusterType(clusterType);

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const toolResult = await client.callTool({ name: "cluster_info", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      const detail = parseClusterDetailResponse(text, config.name);
      if (!detail) return { ok: false, error: "Failed to parse cluster detail response" };
      return { ok: true, detail, dataSource: "live" };
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const toolResult = await retriedClient.callTool({ name: "cluster_info", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      const detail = parseClusterDetailResponse(text, config.name);
      if (!detail) return { ok: false, error: "Failed to parse cluster detail response after retry" };
      return { ok: true, detail, dataSource: "live" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

// --- Cluster Creation ---

export async function createCluster(params: CreateClusterParams): Promise<CreateClusterResult> {
  const config = SERVER_CONFIGS[0]; // creation only via self-managed server

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const args = {
        name: params.name,
        version: params.openshift_version,
        base_domain: params.base_dns_domain,
        single_node: params.high_availability_mode === "None",
        network_type: params.network_type,
      };
      const toolResult = await client.callTool({ name: "create_cluster", arguments: args });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseCreateClusterResponse(text, params.name);
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const retryArgs = {
        name: params.name,
        version: params.openshift_version,
        base_domain: params.base_dns_domain,
        single_node: params.high_availability_mode === "None",
        network_type: params.network_type,
      };
      const toolResult = await retriedClient.callTool({ name: "create_cluster", arguments: retryArgs });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseCreateClusterResponse(text, params.name);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

function parseCreateClusterResponse(text: string, fallbackName: string): CreateClusterResult {
  const trimmed = text.trim();

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const id = String(obj.id ?? obj.cluster_id ?? obj.result ?? "");
      if (id) {
        return { ok: true, cluster_id: id, name: String(obj.name ?? fallbackName), status: String(obj.status ?? "pending-for-input"), dataSource: "live" };
      }
    }
  } catch {
    // not JSON — check if it's a raw UUID
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { ok: true, cluster_id: trimmed, name: fallbackName, status: "pending-for-input", dataSource: "live" };
  }

  return { ok: false, error: "Failed to parse create cluster response" };
}

// --- Host Registration & Network Configuration ---

export async function getClusterHosts(clusterId: string): Promise<ClusterHostsResult> {
  const config = SERVER_CONFIGS[0];

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const toolResult = await client.callTool({ name: "list_hosts", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseClusterHostsResponse(text);
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const toolResult = await retriedClient.callTool({ name: "list_hosts", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseClusterHostsResponse(text);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

function parseClusterHostsResponse(text: string): ClusterHostsResult {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const rawHosts = Array.isArray(obj.hosts) ? obj.hosts : Array.isArray(parsed) ? parsed as unknown[] : [];
      const hosts: HostInfo[] = rawHosts.map((h: unknown) => {
        const host = h as Record<string, unknown>;
        return {
          id: String(host.id ?? host.host_id ?? ""),
          hostname: String(host.hostname ?? host.requested_hostname ?? host.name ?? ""),
          status: String(host.status ?? "unknown"),
          role: String(host.role ?? host.host_role ?? "auto-assign"),
        };
      });
      const discoveryIsoUrl = String(obj.discovery_iso_url ?? obj.iso_download_url ?? "");
      return { ok: true, hosts, discoveryIsoUrl, dataSource: "live" };
    }
  } catch {
    // not JSON
  }
  return { ok: false, error: "Failed to parse host list response" };
}

export async function setHostRole(clusterId: string, hostId: string, role: string): Promise<SetHostRoleResult> {
  const config = SERVER_CONFIGS[0];

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      await client.callTool({ name: "update_host", arguments: { cluster_id: clusterId, host_id: hostId, host_role: role } });
      return { ok: true, dataSource: "live" };
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      await retriedClient.callTool({ name: "update_host", arguments: { cluster_id: clusterId, host_id: hostId, host_role: role } });
      return { ok: true, dataSource: "live" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function setClusterVips(clusterId: string, apiVip: string, ingressVip: string): Promise<SetVipsResult> {
  const config = SERVER_CONFIGS[0];

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      await client.callTool({ name: "update_cluster", arguments: { cluster_id: clusterId, api_vip: apiVip, ingress_vip: ingressVip } });
      return { ok: true, dataSource: "live" };
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      await retriedClient.callTool({ name: "update_cluster", arguments: { cluster_id: clusterId, api_vip: apiVip, ingress_vip: ingressVip } });
      return { ok: true, dataSource: "live" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

// --- Installation ---

export async function startInstallation(clusterId: string): Promise<StartInstallationResult> {
  const config = SERVER_CONFIGS[0];

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      await client.callTool({ name: "install_cluster", arguments: { cluster_id: clusterId } });
      return { ok: true, dataSource: "live" };
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      await retriedClient.callTool({ name: "install_cluster", arguments: { cluster_id: clusterId } });
      return { ok: true, dataSource: "live" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export async function getInstallationProgress(clusterId: string): Promise<InstallationProgressResult> {
  const config = SERVER_CONFIGS[0];

  try {
    const client = unwrapConnection(await ensureConnection(config));
    try {
      const toolResult = await client.callTool({ name: "cluster_info", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseInstallationProgress(text);
    } catch {
      const retriedClient = unwrapConnection(await reconnect(config));
      const toolResult = await retriedClient.callTool({ name: "cluster_info", arguments: { cluster_id: clusterId } });
      const textContent = toolResult.content as Array<{ type: string; text: string }>;
      const text = textContent.find((c) => c.type === "text")?.text ?? "";
      return parseInstallationProgress(text);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

function parseInstallationProgress(text: string): InstallationProgressResult {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        ok: true,
        progress: {
          status: String(obj.status ?? "unknown"),
          progress: typeof obj.progress === "number" ? obj.progress : typeof obj.install_completion_percentage === "number" ? obj.install_completion_percentage : 0,
          statusInfo: obj.status_info ? String(obj.status_info) : undefined,
        },
        dataSource: "live",
      };
    }
  } catch {
    // not JSON
  }
  return { ok: false, error: "Failed to parse installation progress" };
}
