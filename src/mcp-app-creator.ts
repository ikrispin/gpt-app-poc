import { App } from "@modelcontextprotocol/ext-apps";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./mcp-app/rhds-step0.css";
import { CreatorApp } from "./mcp-app/ocp-admin/CreatorApp";
import type { ClusterCreatorFormState, ClusterCreationResult, DataSource, StatusVariant } from "./mcp-app/ocp-admin/ocp-state";

type ToolTextContent = { type: string; text?: string };
type ToolResult = {
  isError?: boolean;
  content?: ToolTextContent[];
  structuredContent?: Record<string, unknown>;
};

const appRoot = document.getElementById("app-root");
if (!appRoot) throw new Error("Missing app root element.");
const reactRoot = createRoot(appRoot);

const app = new App({ name: "OCP Admin Creator", version: "1.0.0" });

const state = {
  statusMessage: "",
  statusVariant: "info" as StatusVariant,
  creatorForm: {
    clusterName: "",
    openshiftVersion: "4.21",
    baseDnsDomain: "",
    highAvailabilityMode: "Full" as const,
    networkType: "OVNKubernetes" as const,
  } as ClusterCreatorFormState,
  isCreating: false,
  creationResult: null as ClusterCreationResult | null,
  creationError: null as string | null,
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

const onCreatorFieldChange = (field: string, value: string) => {
  (state.creatorForm as Record<string, string>)[field] = value;
  render();
};

const onCreateCluster = async () => {
  state.isCreating = true;
  state.creationResult = null;
  state.creationError = null;
  setStatus("", "info");
  render();

  const form = state.creatorForm;
  const result = await callTool("create_ocp_cluster", {
    cluster_name: form.clusterName,
    openshift_version: form.openshiftVersion,
    base_dns_domain: form.baseDnsDomain,
    high_availability_mode: form.highAvailabilityMode,
    network_type: form.networkType,
  });

  state.isCreating = false;

  if (result.isError) {
    state.creationError = result.content?.find((c: ToolTextContent) => c.type === "text")?.text ?? "Failed to create cluster.";
    setStatus("Cluster creation failed.", "danger");
    render();
    return;
  }

  const sc = result.structuredContent ?? {};
  state.creationResult = {
    clusterId: String(sc.cluster_id ?? ""),
    clusterName: String(sc.name ?? form.clusterName),
    status: String(sc.status ?? "pending-for-input"),
    dataSource: (sc.dataSource as DataSource) ?? "mock",
  };
  setStatus(`Cluster '${state.creationResult.clusterName}' created successfully.`, "success");
  render();
};

const onNavigateSetup = async (clusterId: string) => {
  try {
    await app.sendMessage({
      role: "user",
      content: [{ type: "text", text: `Set up cluster (ID: ${clusterId})` }],
    });
  } catch {
    setStatus("Could not send setup request to chat. Please type it manually.", "warning");
    render();
  }
};

const render = () => {
  reactRoot.render(
    createElement(CreatorApp, {
      statusMessage: state.statusMessage,
      statusVariant: state.statusVariant,
      creatorForm: state.creatorForm,
      isCreating: state.isCreating,
      creationResult: state.creationResult,
      creationError: state.creationError,
      onCreatorFieldChange,
      onCreateCluster,
      onNavigateSetup,
    }),
  );
};

try {
  app.connect();
} catch {
  // connection may fail outside ChatGPT
}

render();
