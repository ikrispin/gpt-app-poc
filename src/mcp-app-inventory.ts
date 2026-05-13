import { App } from "@modelcontextprotocol/ext-apps";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./mcp-app/rhds-step0.css";
import { InventoryApp } from "./mcp-app/ocp-admin/InventoryApp";
import type { ClusterRow, ClusterEvent, ClusterDetailInfo, DataSource, StatusVariant } from "./mcp-app/ocp-admin/ocp-state";

type ToolTextContent = { type: string; text?: string };
type ToolResult = {
  isError?: boolean;
  content?: ToolTextContent[];
  structuredContent?: Record<string, unknown>;
};

const appRoot = document.getElementById("app-root");
if (!appRoot) throw new Error("Missing app root element.");
const reactRoot = createRoot(appRoot);

const app = new App({ name: "OCP Admin Inventory", version: "1.0.0" });

const state = {
  statusMessage: "",
  statusVariant: "info" as StatusVariant,
  clusters: [] as ClusterRow[],
  isLoading: false,
  dataSource: null as DataSource,
  selectedClusterId: null as string | null,
  clusterDetail: null as ClusterDetailInfo | null,
  isLoadingDetail: false,
  events: [] as ClusterEvent[],
  isLoadingEvents: false,
  eventsDataSource: null as DataSource,
  logsDownloadUrl: null as string | null,
  isLoadingLogsUrl: false,
  searchQuery: "",
  isLookingUp: false,
  lookupError: null as string | null,
};

const setStatus = (message: string, variant: StatusVariant) => {
  state.statusMessage = message;
  state.statusVariant = variant;
};

const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
  try {
    return (await app.callServerTool({ name, arguments: args })) as ToolResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Operation failed: ${message}`, "danger");
    render();
    return { isError: true, content: [{ type: "text", text: message }] };
  }
};

const onLoadClusters = async () => {
  state.isLoading = true;
  setStatus("", "info");
  render();

  const result = await callTool("list_ocp_clusters", {});
  if (result.isError) {
    state.isLoading = false;
    setStatus("Failed to load clusters.", "danger");
    render();
    return;
  }

  const sc = result.structuredContent ?? {};
  state.clusters = (sc.clusters ?? []) as ClusterRow[];
  state.dataSource = (sc.dataSource as DataSource) ?? "mock";
  state.isLoading = false;
  const label = state.dataSource === "live" ? " (live)" : state.dataSource === "partial" ? " (partial)" : " (mock)";
  setStatus(`Loaded ${state.clusters.length} cluster(s)${label}.`, "success");
  render();
};

const onSelectCluster = async (clusterId: string) => {
  const cluster = state.clusters.find((c) => c.id === clusterId);
  if (!cluster) {
    setStatus("Cluster not found in inventory.", "warning");
    render();
    return;
  }

  state.selectedClusterId = clusterId;
  state.clusterDetail = null;
  state.isLoadingDetail = true;
  setStatus("", "info");
  render();

  const result = await callTool("get_cluster_info", { cluster_id: clusterId, cluster_type: cluster.type });
  if (result.isError) {
    state.isLoadingDetail = false;
    setStatus("Failed to load cluster details.", "danger");
    render();
    return;
  }

  state.clusterDetail = (result.structuredContent ?? {}) as ClusterDetailInfo;
  state.dataSource = (result.structuredContent?.dataSource as DataSource) ?? "mock";
  state.isLoadingDetail = false;
  setStatus(`Loaded details for ${cluster.name}.`, "success");
  render();
};

const onBackToInventory = () => {
  state.selectedClusterId = null;
  state.clusterDetail = null;
  state.isLoadingDetail = false;
  state.events = [];
  state.isLoadingEvents = false;
  state.logsDownloadUrl = null;
  state.isLoadingLogsUrl = false;
  state.eventsDataSource = null;
  setStatus("", "info");
  render();
};

const onSearchQueryChange = (query: string) => {
  state.searchQuery = query;
  state.lookupError = null;
  render();
};

const onLookupCluster = async () => {
  const query = state.searchQuery.trim();
  if (!query) return;

  state.isLookingUp = true;
  state.lookupError = null;
  render();

  for (const clusterType of ["OCP", "ROSA"]) {
    const result = await callTool("get_cluster_info", { cluster_id: query, cluster_type: clusterType });
    if (!result.isError && result.structuredContent) {
      state.isLookingUp = false;
      state.selectedClusterId = String(result.structuredContent.id ?? query);
      state.clusterDetail = result.structuredContent as ClusterDetailInfo;
      state.dataSource = (result.structuredContent.dataSource as DataSource) ?? "live";
      setStatus(`Found cluster: ${result.structuredContent.name}`, "success");
      render();
      return;
    }
  }

  state.isLookingUp = false;
  state.lookupError = `No cluster found with ID "${query}" on either backend.`;
  render();
};

const onSetupCluster = async (clusterId: string) => {
  const cluster = state.clusters.find((c) => c.id === clusterId);
  const name = cluster?.name ?? clusterId;
  try {
    await app.sendMessage({
      role: "user",
      content: [{ type: "text", text: `Set up cluster ${name} (ID: ${clusterId})` }],
    });
  } catch {
    setStatus("Could not send setup request to chat. Please type it manually.", "warning");
    render();
  }
};

const onLoadEvents = async () => {
  const cluster = state.clusters.find((c) => c.id === state.selectedClusterId);
  if (!cluster) return;

  state.isLoadingEvents = true;
  state.events = [];
  render();

  const result = await callTool("get_cluster_events", { cluster_id: cluster.id, cluster_type: cluster.type });
  if (result.isError) {
    state.isLoadingEvents = false;
    setStatus("Failed to load events.", "danger");
    render();
    return;
  }

  const sc = result.structuredContent ?? {};
  state.events = (sc.events ?? []) as ClusterEvent[];
  state.eventsDataSource = (sc.dataSource as DataSource) ?? "mock";
  state.isLoadingEvents = false;
  setStatus(`Loaded ${state.events.length} event(s).`, "success");
  render();
};

const onGetLogsUrl = async () => {
  const cluster = state.clusters.find((c) => c.id === state.selectedClusterId);
  if (!cluster) return;

  state.isLoadingLogsUrl = true;
  state.logsDownloadUrl = null;
  render();

  const result = await callTool("get_cluster_logs_url", { cluster_id: cluster.id, cluster_type: cluster.type });
  if (result.isError) {
    state.isLoadingLogsUrl = false;
    setStatus("Failed to get logs URL.", "danger");
    render();
    return;
  }

  state.logsDownloadUrl = String(result.structuredContent?.url ?? "");
  state.isLoadingLogsUrl = false;
  setStatus("Logs download link ready.", "success");
  render();
};

const render = () => {
  reactRoot.render(
    createElement(InventoryApp, {
      statusMessage: state.statusMessage,
      statusVariant: state.statusVariant,
      clusters: state.clusters,
      isLoading: state.isLoading,
      dataSource: state.dataSource,
      selectedClusterId: state.selectedClusterId,
      clusterDetail: state.clusterDetail,
      isLoadingDetail: state.isLoadingDetail,
      events: state.events,
      isLoadingEvents: state.isLoadingEvents,
      eventsDataSource: state.eventsDataSource,
      logsDownloadUrl: state.logsDownloadUrl,
      isLoadingLogsUrl: state.isLoadingLogsUrl,
      onLoadClusters,
      onSelectCluster,
      onSetupCluster,
      onSearchQueryChange,
      onLookupCluster,
      searchQuery: state.searchQuery,
      isLookingUp: state.isLookingUp,
      lookupError: state.lookupError,
      onBackToInventory,
      onLoadEvents,
      onGetLogsUrl,
    }),
  );
};

try {
  app.connect();
} catch {
  // connection may fail outside ChatGPT
}

render();
void onLoadClusters();
