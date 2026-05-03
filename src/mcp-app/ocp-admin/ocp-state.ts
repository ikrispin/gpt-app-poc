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

export type ClusterDetailInfo = {
  name: string;
  id: string;
  status: string;
  type: string;
  version: string;
  provider: string;
  region: string;
  created_at?: string;
  api_vip?: string;
  ingress_vip?: string;
  api_url?: string;
  console_url?: string;
  dns_domain?: string;
  host_count?: number;
  network_type?: string;
  cluster_network_cidr?: string;
  service_network_cidr?: string;
  platform_type?: string;
  source?: string;
  dataSource?: string;
};

export type ClusterEvent = {
  timestamp: string;
  severity: string;
  message: string;
  category?: string;
};

export type OcpAdminUiState = {
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
  isLoading: boolean;
  prerequisiteResults: PrerequisiteCheckResult | null;
  dataSource: DataSource;
  selectedClusterId: string | null;
  clusterDetail: ClusterDetailInfo | null;
  isLoadingDetail: boolean;
  events: ClusterEvent[];
  isLoadingEvents: boolean;
  logsDownloadUrl: string | null;
  isLoadingLogsUrl: boolean;
  eventsDataSource: DataSource;
};
