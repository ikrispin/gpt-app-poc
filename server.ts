import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
import { listClusters, checkConnectivity, isPodmanAvailable, getClusterInfo, getClusterEvents, getClusterLogsUrl, createCluster, getClusterHosts, setHostRole, setClusterVips, startInstallation, getInstallationProgress } from "./src/mcp-client/ocp-mcp-client.js";
import type { ClusterDetailInfo, ClusterEvent, CreateClusterParams, HostInfo, InstallationProgress } from "./src/mcp-client/ocp-mcp-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "GPT App POC",
  version: "1.0.0",
});


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

const widgetResourceVersion = process.env.WIDGET_RESOURCE_VERSION?.trim();
const ocpAdminResourceUri = widgetResourceVersion
  ? `ui://ocp-admin/app.html?v=${encodeURIComponent(widgetResourceVersion)}`
  : "ui://ocp-admin/app.html";
const widgetBuildId = widgetResourceVersion || `build-${Date.now()}`;
const DEFAULT_WIDGET_DOMAIN = "https://leisured-carina-unpromotable.ngrok-free.dev";


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
    <title>OCP Admin</title>
    <style>
      body { margin: 0; padding: 1.5rem; font-family: sans-serif; }
      main { max-width: 52rem; margin: 0 auto; }
    </style>
  </head>
  <body>
    <main>
      <h1>OCP Admin</h1>
      <p>UI bundle unavailable.</p>
    </main>
  </body>
</html>`;
  }
};

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
  const metaTags = [
    `<meta name="gpt-app-api-base" content="${escapedWidgetDomain}" />`,
    `<meta name="gpt-app-build-id" content="${escapedWidgetBuildId}" />`,
    `<meta name="gpt-app-workflow" content="${escapedWorkflowId}" />`,
  ];
  const metaInjection = metaTags.join("");
  return html.includes("</head>")
    ? html.replace("</head>", `${metaInjection}</head>`)
    : `${metaInjection}${html}`;
};

const loadWidgetHtml = async (workflowId: string): Promise<string> => {
  const rawHtml = await loadRawWidgetHtml();
  return injectWidgetMeta(rawHtml, workflowId);
};

const loadOcpAdminWidgetHtml = async (): Promise<string> => loadWidgetHtml("ocp-admin");





registerAppTool(
  server,
  "check_ocp_prerequisites",
  {
    title: "Check OCP Admin Prerequisites",
    description: "Verifies that OFFLINE_TOKEN is set and that downstream MCP servers (openshift-self-managed, openshift-ocm-managed) are reachable. Call this before any cluster operation to confirm the environment is ready.",
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
    description: "Returns the current inventory of OpenShift clusters across all deployment types (OCP, SNO, ROSA, ARO, OSD). Queries both self-managed (Assisted Installer) and managed service (OCM) APIs in parallel, merging results into a single list with name, ID, status, type, version, provider, and region.",
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
    description: "Returns detailed information about a specific OpenShift cluster including version, network config, VIPs, console URL, DNS domain, host count, and platform type. Requires cluster_id (UUID) and cluster_type (OCP, SNO, ROSA, ARO, or OSD) to route to the correct backend API.",
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
    description: "Returns chronological event history for a self-managed OpenShift cluster (OCP/SNO only). Events include timestamps, severity levels, and messages useful for diagnosing installation failures and state transitions. Not available for managed clusters (ROSA/ARO/OSD).",
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
    description: "Returns a presigned download URL for the logs bundle of a self-managed OpenShift cluster (OCP/SNO only). The logs include installation, validation, host discovery, and diagnostic data. The URL may expire; generate a new one if needed. Not available for managed clusters (ROSA/ARO/OSD).",
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
    description: "Creates a new self-managed OpenShift cluster definition via the Assisted Installer API. Supports OCP (HA, high_availability_mode=Full) and SNO (single-node, high_availability_mode=None). Returns a cluster ID used for all subsequent operations (host registration, VIP config, installation). Does not start installation — use start_cluster_installation after configuring hosts and VIPs.",
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
    description: "Returns the list of registered hosts (hostname, status, role) and the discovery ISO download URL for a self-managed OpenShift cluster. Use after creating a cluster to check which hosts have booted from the discovery ISO and registered with the Assisted Installer.",
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
    description: "Assigns a role (master or worker) to a specific host in a self-managed OpenShift cluster. For HA clusters, at least 3 hosts must be assigned the master role. For SNO, the single host is assigned master. Requires user confirmation before calling.",
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
    description: "Configures API VIP and Ingress VIP for a self-managed HA OpenShift cluster. Required for baremetal, vsphere, and nutanix platforms before installation. Not needed for SNO clusters. Requires user confirmation before calling.",
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
    description: "Triggers installation of a self-managed OpenShift cluster. This is IRREVERSIBLE — once started, installation cannot be paused or cancelled. Requires hosts to be registered and roles assigned, and VIPs configured for HA clusters. Always require explicit user confirmation before calling. Monitor progress with get_installation_progress and get_cluster_events.",
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
    description: "Returns current installation status (e.g. installing, installed, error), progress percentage, and status info for a self-managed OpenShift cluster. Use to monitor installation after calling start_cluster_installation. Typical installation takes 45-60 minutes.",
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

  app.get("/privacy", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send(
        [
          "Privacy Policy",
          "",
          "This app only processes the minimum data required to fulfill requests.",
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
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({
        code: "internal_error",
        message,
      });
    }
  });

  return app;
};

const port = Number.parseInt(process.env.PORT ?? "", 10) || 3001;
const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(port, (err) => {
    if (err) {
      console.error("Error starting server:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    console.log(`Server listening on http://localhost:${port}/mcp`);
  });
}
