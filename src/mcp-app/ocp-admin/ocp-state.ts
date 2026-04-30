export type OcpAdminStep = "prerequisites" | "cluster_inventory";

export type OcpAdminWorkflowState = {
  current_step: OcpAdminStep;
};

export type StatusVariant = "info" | "success" | "warning" | "danger";

export type ClusterRow = {
  name: string;
  id: string;
  status: string;
  type: string;
  version: string;
  provider: string;
  region: string;
};

export type PrerequisiteResult = {
  name: string;
  status: string;
  description: string;
};

export type PrerequisiteCheckResult = {
  offline_token_set: boolean;
  podman_available: boolean;
  mcp_servers: PrerequisiteResult[];
};

export type DataSource = "live" | "partial" | "mock" | null;

export type OcpAdminUiState = {
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
  isLoading: boolean;
  prerequisiteResults: PrerequisiteCheckResult | null;
  dataSource: DataSource;
};
