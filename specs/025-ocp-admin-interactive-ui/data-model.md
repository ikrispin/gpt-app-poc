# Data Model: OCP Admin Interactive UI — Live Tool Calls

**Feature**: `025-ocp-admin-interactive-ui`
**Date**: 2026-04-29

## Entities

### Prerequisite Check Result

Structured response from `check_ocp_prerequisites` tool.

**Fields**:
- **offline_token_set** (boolean): Whether OFFLINE_TOKEN env var is present.
- **mcp_servers** (array of objects): Expected MCP servers with availability status.
  - **name** (string): Server name (e.g., "openshift-self-managed").
  - **status** (string): "not_connected" for now — real connectivity is future work.
  - **description** (string): What the server provides.

### Cluster Inventory Response

Structured response from `list_ocp_clusters` tool.

**Fields**:
- **clusters** (ClusterRow[]): Array of cluster records.
- **total** (number): Total cluster count.

### ClusterRow (unchanged from spec 024)

**Fields**:
- **name** (string): Cluster name.
- **id** (string): Unique identifier.
- **status** (string): Current status.
- **type** (string): Deployment type.
- **version** (string): OpenShift version.
- **provider** (string): Infrastructure provider.
- **region** (string): Cloud region or "-".

### OCP Admin UI State (updated)

**New fields added to OcpAdminUiState**:
- **isLoading** (boolean): Whether a tool call is in progress.
- **prerequisiteResults** (PrerequisiteCheckResult | null): Cached result from the last prerequisites check. Null before first check.

**Changed behavior**:
- **clusters** (ClusterRow[]): Starts as empty array (not pre-populated from MOCK_CLUSTERS). Populated by `list_ocp_clusters` tool response.
