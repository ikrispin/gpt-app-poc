import { App } from "@modelcontextprotocol/ext-apps";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./mcp-app/rhds-step0.css";
import { SetupApp } from "./mcp-app/ocp-admin/SetupApp";
import type { HostInfo, DataSource, StatusVariant } from "./mcp-app/ocp-admin/ocp-state";

type ToolTextContent = { type: string; text?: string };
type ToolResult = {
  isError?: boolean;
  content?: ToolTextContent[];
  structuredContent?: Record<string, unknown>;
};

const appRoot = document.getElementById("app-root");
if (!appRoot) throw new Error("Missing app root element.");
const reactRoot = createRoot(appRoot);

const app = new App({ name: "OCP Admin Setup", version: "1.0.0" });

const state = {
  statusMessage: "",
  statusVariant: "info" as StatusVariant,
  setupClusterId: null as string | null,
  hosts: [] as HostInfo[],
  isLoadingHosts: false,
  discoveryIsoUrl: null as string | null,
  apiVip: "",
  ingressVip: "",
  hostsDataSource: null as DataSource,
  installationStatus: null as string | null,
  installationProgress: 0,
  installationStatusInfo: null as string | null,
  isStartingInstallation: false,
  showInstallConfirm: false,
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

const onLoadHosts = async () => {
  if (!state.setupClusterId) return;

  state.isLoadingHosts = true;
  state.hosts = [];
  render();

  const result = await callTool("get_cluster_hosts", { cluster_id: state.setupClusterId });
  state.isLoadingHosts = false;

  if (result.isError) {
    setStatus("Failed to load hosts.", "danger");
    render();
    return;
  }

  const sc = result.structuredContent ?? {};
  state.hosts = (sc.hosts ?? []) as HostInfo[];
  state.discoveryIsoUrl = sc.discoveryIsoUrl ? String(sc.discoveryIsoUrl) : null;
  state.hostsDataSource = (sc.dataSource as DataSource) ?? "mock";
  setStatus(`Loaded ${state.hosts.length} host(s).`, "success");
  render();
};

const onSetHostRole = async (hostId: string, role: string) => {
  if (!state.setupClusterId) return;

  setStatus("Setting role for host...", "info");
  render();

  const result = await callTool("set_host_role", { cluster_id: state.setupClusterId, host_id: hostId, role });
  if (result.isError) {
    setStatus("Failed to set host role.", "danger");
    render();
    return;
  }

  state.hosts = state.hosts.map((h) => h.id === hostId ? { ...h, role } : h);
  setStatus(`Host role set to ${role}.`, "success");
  render();
};

const onVipFieldChange = (field: string, value: string) => {
  if (field === "apiVip") state.apiVip = value;
  else if (field === "ingressVip") state.ingressVip = value;
  render();
};

const onSetVips = async () => {
  if (!state.setupClusterId) return;

  setStatus("Setting VIPs...", "info");
  render();

  const result = await callTool("set_cluster_vips", {
    cluster_id: state.setupClusterId,
    api_vip: state.apiVip,
    ingress_vip: state.ingressVip,
  });

  if (result.isError) {
    setStatus("Failed to set VIPs.", "danger");
    render();
    return;
  }

  setStatus(`VIPs configured. API: ${state.apiVip}, Ingress: ${state.ingressVip}.`, "success");
  render();
};

const onShowInstallConfirm = () => { state.showInstallConfirm = true; render(); };
const onCancelInstallConfirm = () => { state.showInstallConfirm = false; render(); };

const onStartInstallation = async () => {
  if (!state.setupClusterId) return;

  state.showInstallConfirm = false;
  state.isStartingInstallation = true;
  setStatus("Starting installation...", "info");
  render();

  const result = await callTool("start_cluster_installation", { cluster_id: state.setupClusterId });
  state.isStartingInstallation = false;

  if (result.isError) {
    setStatus("Failed to start installation.", "danger");
    render();
    return;
  }

  state.installationStatus = "installing";
  state.installationProgress = 0;
  setStatus("Installation started.", "success");
  render();
  void onPollProgress();
};

const onPollProgress = async () => {
  if (!state.setupClusterId) return;

  const result = await callTool("get_installation_progress", { cluster_id: state.setupClusterId });
  if (result.isError) {
    setStatus("Failed to get progress.", "warning");
    render();
    return;
  }

  const sc = result.structuredContent ?? {};
  state.installationStatus = String(sc.status ?? "unknown");
  state.installationProgress = typeof sc.progress === "number" ? sc.progress : 0;
  state.installationStatusInfo = sc.statusInfo ? String(sc.statusInfo) : null;

  if (state.installationStatus === "installed") setStatus("Installation complete!", "success");
  else if (state.installationStatus === "error") setStatus("Installation failed.", "danger");
  else setStatus(`Installing... ${state.installationProgress}%`, "info");
  render();
};

const render = () => {
  reactRoot.render(
    createElement(SetupApp, {
      statusMessage: state.statusMessage,
      statusVariant: state.statusVariant,
      setupClusterId: state.setupClusterId,
      hosts: state.hosts,
      isLoadingHosts: state.isLoadingHosts,
      discoveryIsoUrl: state.discoveryIsoUrl,
      apiVip: state.apiVip,
      ingressVip: state.ingressVip,
      hostsDataSource: state.hostsDataSource,
      onLoadHosts,
      onSetHostRole,
      onSetVips,
      onVipFieldChange,
      installationStatus: state.installationStatus,
      installationProgress: state.installationProgress,
      installationStatusInfo: state.installationStatusInfo,
      isStartingInstallation: state.isStartingInstallation,
      showInstallConfirm: state.showInstallConfirm,
      onShowInstallConfirm,
      onCancelInstallConfirm,
      onStartInstallation,
      onPollProgress,
    }),
  );
};

try {
  app.connect();
} catch {
  // connection may fail outside ChatGPT
}

app.ontoolinput = (params) => {
  const args = params.arguments as Record<string, unknown> | undefined;
  if (args?.cluster_id && typeof args.cluster_id === "string") {
    state.setupClusterId = args.cluster_id;
    render();
    void onLoadHosts();
  }
};

app.ontoolresult = (params) => {
  const sc = (params as Record<string, unknown>).structuredContent as Record<string, unknown> | undefined;
  if (sc?.cluster_id && typeof sc.cluster_id === "string" && !state.setupClusterId) {
    state.setupClusterId = sc.cluster_id;
    render();
    void onLoadHosts();
  }
};

render();
