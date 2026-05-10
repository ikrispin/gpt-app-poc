import { App } from "@modelcontextprotocol/ext-apps";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./mcp-app/rhds-step0.css";
import { OcpAdminApp } from "./mcp-app/ocp-admin/OcpAdminApp";
import type { OcpAdminView, OcpAdminUiState, PrerequisiteCheckResult, ClusterRow, ClusterEvent, ClusterCreatorFormState, ClusterCreationResult, HostInfo, DataSource, ClusterDetailInfo } from "./mcp-app/ocp-admin/ocp-state";

type ToolTextContent = { type: string; text?: string };
type ToolResult = {
  isError?: boolean;
  content?: ToolTextContent[];
  structuredContent?: Record<string, unknown>;
};

const appRoot = document.getElementById("app-root");
if (!appRoot) throw new Error("Missing app root element.");
const reactRoot = createRoot(appRoot);

const app = new App({ name: "OCP Admin", version: "1.0.0" });

const detectedView = (document
  .querySelector('meta[name="gpt-app-view"]')
  ?.getAttribute("content") ?? "inventory") as OcpAdminView;

const ocpUiState: OcpAdminUiState = {
  statusMessage: "",
  statusVariant: "info",
  clusters: [],
  isLoading: false,
  prerequisiteResults: null,
  dataSource: null,
  selectedClusterId: null,
  clusterDetail: null,
  isLoadingDetail: false,
  events: [],
  isLoadingEvents: false,
  logsDownloadUrl: null,
  isLoadingLogsUrl: false,
  eventsDataSource: null,
  creatorForm: {
    clusterName: "",
    openshiftVersion: "4.21",
    baseDnsDomain: "",
    highAvailabilityMode: "Full" as const,
    networkType: "OVNKubernetes" as const,
  },
  isCreating: false,
  creationResult: null,
  creationError: null,
  setupClusterId: null,
  hosts: [],
  isLoadingHosts: false,
  discoveryIsoUrl: null,
  apiVip: "",
  ingressVip: "",
  hostsDataSource: null,
  installationStatus: null,
  installationProgress: 0,
  installationStatusInfo: null,
  isStartingInstallation: false,
  showInstallConfirm: false,
};

const setOcpStatus = (message: string, variant: OcpAdminUiState["statusVariant"]) => {
  ocpUiState.statusMessage = message;
  ocpUiState.statusVariant = variant;
};

const ocpCallTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> => {
  try {
    const result = (await app.callServerTool({ name, arguments: args })) as ToolResult;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setOcpStatus(`Operation failed: ${message}`, "danger");
    ocpRender();
    return { isError: true, content: [{ type: "text", text: message }] };
  }
};

const onCheckPrerequisites = async () => {
  const result = await ocpCallTool("check_ocp_prerequisites", {});
  if (!result.isError && result.structuredContent) {
    ocpUiState.prerequisiteResults = result.structuredContent as PrerequisiteCheckResult;
    setOcpStatus("Prerequisites checked.", "info");
  }
  ocpRender();
};

const onLoadClusters = async () => {
  ocpUiState.isLoading = true;
  setOcpStatus("", "info");
  ocpRender();

  const result = await ocpCallTool("list_ocp_clusters", {});

  if (result.isError) {
    ocpUiState.isLoading = false;
    setOcpStatus("Failed to load clusters. Click Load Clusters to retry.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.clusters = (structured.clusters ?? []) as ClusterRow[];
  ocpUiState.dataSource = (structured.dataSource as DataSource) ?? "mock";
  ocpUiState.isLoading = false;
  const sourceLabel = ocpUiState.dataSource === "live" ? " (live)" : ocpUiState.dataSource === "partial" ? " (partial)" : " (mock)";
  setOcpStatus(`Loaded ${ocpUiState.clusters.length} cluster(s)${sourceLabel}.`, "success");
  ocpRender();
};

const onSelectCluster = async (clusterId: string) => {
  const cluster = ocpUiState.clusters.find((c) => c.id === clusterId);
  if (!cluster) {
    setOcpStatus("Cluster not found in inventory.", "warning");
    ocpRender();
    return;
  }

  ocpUiState.selectedClusterId = clusterId;
  ocpUiState.clusterDetail = null;
  ocpUiState.isLoadingDetail = true;
  setOcpStatus("", "info");
  ocpRender();

  const result = await ocpCallTool("get_cluster_info", {
    cluster_id: clusterId,
    cluster_type: cluster.type,
  });

  if (result.isError) {
    ocpUiState.isLoadingDetail = false;
    setOcpStatus("Failed to load cluster details.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.clusterDetail = structured as ClusterDetailInfo;
  ocpUiState.dataSource = (structured.dataSource as DataSource) ?? "mock";
  ocpUiState.isLoadingDetail = false;
  setOcpStatus(`Loaded details for ${cluster.name}.`, "success");
  ocpRender();
};

const onBackToInventory = () => {
  ocpUiState.selectedClusterId = null;
  ocpUiState.clusterDetail = null;
  ocpUiState.isLoadingDetail = false;
  ocpUiState.events = [];
  ocpUiState.isLoadingEvents = false;
  ocpUiState.logsDownloadUrl = null;
  ocpUiState.isLoadingLogsUrl = false;
  ocpUiState.eventsDataSource = null;
  setOcpStatus("", "info");
  ocpRender();
};

const onLoadEvents = async () => {
  const cluster = ocpUiState.clusters.find((c) => c.id === ocpUiState.selectedClusterId);
  if (!cluster) return;

  ocpUiState.isLoadingEvents = true;
  ocpUiState.events = [];
  ocpRender();

  const result = await ocpCallTool("get_cluster_events", {
    cluster_id: cluster.id,
    cluster_type: cluster.type,
  });

  if (result.isError) {
    ocpUiState.isLoadingEvents = false;
    setOcpStatus("Failed to load cluster events.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.events = (structured.events ?? []) as ClusterEvent[];
  ocpUiState.eventsDataSource = (structured.dataSource as DataSource) ?? "mock";
  ocpUiState.isLoadingEvents = false;
  setOcpStatus(`Loaded ${ocpUiState.events.length} event(s).`, "success");
  ocpRender();
};

const onGetLogsUrl = async () => {
  const cluster = ocpUiState.clusters.find((c) => c.id === ocpUiState.selectedClusterId);
  if (!cluster) return;

  ocpUiState.isLoadingLogsUrl = true;
  ocpUiState.logsDownloadUrl = null;
  ocpRender();

  const result = await ocpCallTool("get_cluster_logs_url", {
    cluster_id: cluster.id,
    cluster_type: cluster.type,
  });

  if (result.isError) {
    ocpUiState.isLoadingLogsUrl = false;
    setOcpStatus("Failed to get logs download URL.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.logsDownloadUrl = String(structured.url ?? "");
  ocpUiState.isLoadingLogsUrl = false;
  setOcpStatus("Logs download link ready.", "success");
  ocpRender();
};

const onCreatorFieldChange = (field: string, value: string) => {
  (ocpUiState.creatorForm as Record<string, string>)[field] = value;
  ocpRender();
};

const onCreateCluster = async () => {
  ocpUiState.isCreating = true;
  ocpUiState.creationResult = null;
  ocpUiState.creationError = null;
  setOcpStatus("", "info");
  ocpRender();

  const form = ocpUiState.creatorForm;
  const result = await ocpCallTool("create_ocp_cluster", {
    cluster_name: form.clusterName,
    openshift_version: form.openshiftVersion,
    base_dns_domain: form.baseDnsDomain,
    high_availability_mode: form.highAvailabilityMode,
    network_type: form.networkType,
  });

  ocpUiState.isCreating = false;

  if (result.isError) {
    const errorText = result.content?.find((c: ToolTextContent) => c.type === "text")?.text ?? "Failed to create cluster.";
    ocpUiState.creationError = errorText;
    setOcpStatus("Cluster creation failed.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.creationResult = {
    clusterId: String(structured.cluster_id ?? ""),
    clusterName: String(structured.name ?? form.clusterName),
    status: String(structured.status ?? "pending-for-input"),
    dataSource: (structured.dataSource as DataSource) ?? "mock",
  };
  setOcpStatus(`Cluster '${ocpUiState.creationResult.clusterName}' created successfully.`, "success");
  ocpRender();
};

const onNavigateSetup = (clusterId: string) => {
  if (clusterId) {
    ocpUiState.setupClusterId = clusterId;
  }
  if (ocpUiState.hosts.length === 0 && ocpUiState.setupClusterId) {
    void onLoadHosts();
  }
  ocpRender();
};

const onLoadHosts = async () => {
  if (!ocpUiState.setupClusterId) return;

  ocpUiState.isLoadingHosts = true;
  ocpUiState.hosts = [];
  ocpRender();

  const result = await ocpCallTool("get_cluster_hosts", {
    cluster_id: ocpUiState.setupClusterId,
  });

  ocpUiState.isLoadingHosts = false;

  if (result.isError) {
    setOcpStatus("Failed to load hosts.", "danger");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.hosts = (structured.hosts ?? []) as HostInfo[];
  ocpUiState.discoveryIsoUrl = structured.discoveryIsoUrl ? String(structured.discoveryIsoUrl) : null;
  ocpUiState.hostsDataSource = (structured.dataSource as DataSource) ?? "mock";
  setOcpStatus(`Loaded ${ocpUiState.hosts.length} host(s).`, "success");
  ocpRender();
};

const onSetHostRole = async (hostId: string, role: string) => {
  if (!ocpUiState.setupClusterId) return;

  setOcpStatus(`Setting role for host...`, "info");
  ocpRender();

  const result = await ocpCallTool("set_host_role", {
    cluster_id: ocpUiState.setupClusterId,
    host_id: hostId,
    role,
  });

  if (result.isError) {
    setOcpStatus("Failed to set host role.", "danger");
    ocpRender();
    return;
  }

  ocpUiState.hosts = ocpUiState.hosts.map((h) =>
    h.id === hostId ? { ...h, role } : h,
  );
  setOcpStatus(`Host role set to ${role}.`, "success");
  ocpRender();
};

const onVipFieldChange = (field: string, value: string) => {
  if (field === "apiVip") ocpUiState.apiVip = value;
  else if (field === "ingressVip") ocpUiState.ingressVip = value;
  ocpRender();
};

const onSetVips = async () => {
  if (!ocpUiState.setupClusterId) return;

  setOcpStatus("Setting VIPs...", "info");
  ocpRender();

  const result = await ocpCallTool("set_cluster_vips", {
    cluster_id: ocpUiState.setupClusterId,
    api_vip: ocpUiState.apiVip,
    ingress_vip: ocpUiState.ingressVip,
  });

  if (result.isError) {
    setOcpStatus("Failed to set VIPs.", "danger");
    ocpRender();
    return;
  }

  setOcpStatus(`VIPs configured. API: ${ocpUiState.apiVip}, Ingress: ${ocpUiState.ingressVip}.`, "success");
  ocpRender();
};

const onShowInstallConfirm = () => {
  ocpUiState.showInstallConfirm = true;
  ocpRender();
};

const onCancelInstallConfirm = () => {
  ocpUiState.showInstallConfirm = false;
  ocpRender();
};

const onStartInstallation = async () => {
  if (!ocpUiState.setupClusterId) return;

  ocpUiState.showInstallConfirm = false;
  ocpUiState.isStartingInstallation = true;
  setOcpStatus("Starting installation...", "info");
  ocpRender();

  const result = await ocpCallTool("start_cluster_installation", {
    cluster_id: ocpUiState.setupClusterId,
  });

  ocpUiState.isStartingInstallation = false;

  if (result.isError) {
    setOcpStatus("Failed to start installation.", "danger");
    ocpRender();
    return;
  }

  ocpUiState.installationStatus = "installing";
  ocpUiState.installationProgress = 0;
  setOcpStatus("Installation started.", "success");
  ocpRender();
  void onPollProgress();
};

const onPollProgress = async () => {
  if (!ocpUiState.setupClusterId) return;

  const result = await ocpCallTool("get_installation_progress", {
    cluster_id: ocpUiState.setupClusterId,
  });

  if (result.isError) {
    setOcpStatus("Failed to get installation progress.", "warning");
    ocpRender();
    return;
  }

  const structured = result.structuredContent ?? {};
  ocpUiState.installationStatus = String(structured.status ?? "unknown");
  ocpUiState.installationProgress = typeof structured.progress === "number" ? structured.progress : 0;
  ocpUiState.installationStatusInfo = structured.statusInfo ? String(structured.statusInfo) : null;

  if (ocpUiState.installationStatus === "installed") {
    setOcpStatus("Installation complete!", "success");
  } else if (ocpUiState.installationStatus === "error") {
    setOcpStatus("Installation failed.", "danger");
  } else {
    setOcpStatus(`Installing... ${ocpUiState.installationProgress}%`, "info");
  }
  ocpRender();
};

const ocpRender = () => {
  reactRoot.render(
    createElement(OcpAdminApp, {
      view: detectedView,
      statusMessage: ocpUiState.statusMessage,
      statusVariant: ocpUiState.statusVariant,
      clusters: ocpUiState.clusters,
      isLoading: ocpUiState.isLoading,
      dataSource: ocpUiState.dataSource,
      selectedClusterId: ocpUiState.selectedClusterId,
      clusterDetail: ocpUiState.clusterDetail,
      isLoadingDetail: ocpUiState.isLoadingDetail,
      events: ocpUiState.events,
      isLoadingEvents: ocpUiState.isLoadingEvents,
      eventsDataSource: ocpUiState.eventsDataSource,
      logsDownloadUrl: ocpUiState.logsDownloadUrl,
      isLoadingLogsUrl: ocpUiState.isLoadingLogsUrl,
      creatorForm: ocpUiState.creatorForm,
      isCreating: ocpUiState.isCreating,
      creationResult: ocpUiState.creationResult,
      creationError: ocpUiState.creationError,
      onNavigateInventory: () => ocpRender(),
      onLoadClusters,
      onSelectCluster,
      onBackToInventory,
      onLoadEvents,
      onGetLogsUrl,
      onCreatorFieldChange,
      onCreateCluster,
      onNavigateSetup,
      setupClusterId: ocpUiState.setupClusterId,
      hosts: ocpUiState.hosts,
      isLoadingHosts: ocpUiState.isLoadingHosts,
      discoveryIsoUrl: ocpUiState.discoveryIsoUrl,
      apiVip: ocpUiState.apiVip,
      ingressVip: ocpUiState.ingressVip,
      hostsDataSource: ocpUiState.hostsDataSource,
      onLoadHosts,
      onSetHostRole,
      onSetVips,
      onVipFieldChange,
      installationStatus: ocpUiState.installationStatus,
      installationProgress: ocpUiState.installationProgress,
      installationStatusInfo: ocpUiState.installationStatusInfo,
      isStartingInstallation: ocpUiState.isStartingInstallation,
      showInstallConfirm: ocpUiState.showInstallConfirm,
      onShowInstallConfirm,
      onCancelInstallConfirm,
      onStartInstallation,
      onPollProgress,
    }),
  );
};

ocpRender();
void onCheckPrerequisites();
