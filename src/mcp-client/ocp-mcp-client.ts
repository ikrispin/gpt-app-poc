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
  } catch {
    return null;
  }
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
