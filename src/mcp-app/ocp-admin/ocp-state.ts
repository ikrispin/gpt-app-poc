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

export type OcpAdminUiState = {
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
};

export const MOCK_CLUSTERS: ClusterRow[] = [
  { name: "prod-ocp", id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", status: "installing", type: "OCP", version: "4.21.0", provider: "Baremetal", region: "-" },
  { name: "dev-ocp", id: "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7", status: "ready", type: "OCP", version: "4.20.5", provider: "vSphere", region: "-" },
  { name: "rosa-prod", id: "2o2gevtk4bohdu41ff4jps0dl8rrshb6", status: "ready", type: "ROSA", version: "4.21.0", provider: "AWS", region: "us-east-1" },
  { name: "aro-dev", id: "20ekbvg1jkaqssc47mmc0irlvhf59c0p", status: "ready", type: "ARO", version: "4.20.0", provider: "Azure", region: "-" },
  { name: "edge-01", id: "8e5d3e45-77c6-440b-9cfa-9f88187535c6", status: "pending-for-input", type: "SNO", version: "4.21.0", provider: "Self-managed", region: "-" },
];
