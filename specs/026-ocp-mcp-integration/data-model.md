# Data Model: OCP Admin — Real MCP Server Integration

**Feature**: `026-ocp-mcp-integration`
**Date**: 2026-04-30

## Entities

### External Server Config

Static configuration for an external MCP server container.

**Fields**:
- **name** (string): Server identifier ("openshift-self-managed" or "openshift-ocm-managed").
- **image** (string): Container image URI.
- **inventoryUrl** (string): API endpoint URL passed as INVENTORY_URL env var.
- **pullSecretUrl** (string): Pull secret endpoint URL.
- **ssoUrl** (string): SSO endpoint URL.

### External Server Connection

A cached connection to an external MCP server.

**Fields**:
- **name** (string): Server identifier.
- **client** (Client): MCP SDK Client instance.
- **transport** (StdioClientTransport): Transport managing the child process.
- **status** ("connected" | "disconnected" | "error"): Current connection state.
- **lastConnectedAt** (string | null): ISO timestamp of last successful connection.
- **lastError** (string | null): Last error message if status is "error".

### Cluster List Result

Return type from the MCP client's `listClusters()` function.

**Fields**:
- **ok** (boolean): Whether the operation succeeded.
- **clusters** (ClusterRow[]): Array of clusters (empty on failure).
- **dataSource** ("live" | "mock" | "partial"): Origin of the data.
- **errors** (string[]): Error messages for any failed servers.

### Connectivity Check Result

Return type from `checkConnectivity()`.

**Fields**:
- **podmanAvailable** (boolean): Whether podman is installed.
- **offlineTokenSet** (boolean): Whether OFFLINE_TOKEN env var is present.
- **servers** (array): Per-server status.
  - **name** (string): Server identifier.
  - **status** ("connected" | "not_connected" | "error"): Connection state.
  - **description** (string): Server description.
  - **error** (string | null): Error message if connection failed.

### Updated OcpAdminUiState

**New field**:
- **dataSource** ("live" | "mock" | null): Current data source indicator, shown in UI.

### Updated Structured Content (list_ocp_clusters response)

**New field**:
- **dataSource** ("live" | "mock"): Added to structuredContent alongside clusters and total.
