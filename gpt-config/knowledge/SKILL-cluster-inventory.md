# Skill: cluster-inventory

List and inspect OpenShift clusters across all types (OCP, SNO, ROSA, ARO, OSD). Read-only operations only.

## Prerequisites

**Required Actions**: `check_ocp_prerequisites`, `list_ocp_clusters`, `get_cluster_info`, `get_cluster_events`, `get_cluster_logs_url`

**Environment Variables**: `OFFLINE_TOKEN` — Red Hat authentication token

**Verification**: Call `check_ocp_prerequisites` first. If it reports missing tokens or disconnected servers, stop and report the issue with setup instructions.

## When to Use

- "List all clusters" / "Show my clusters" / "What clusters do I have?"
- User wants cluster status or installation progress
- User needs detailed cluster info (version, config, hosts)
- User wants to inspect cluster events for troubleshooting

## Filtering Capabilities

**Optional Filters** (apply when user requests):
- `cluster_type`: "all" (default), "self-managed", "managed", "rosa", "aro", "osd", "ocp", "sno"
- `status_filter`: "all" (default), "ready", "installed", "installing", "error", "pending-for-input"
- `name_search`: Partial match on cluster name (case-insensitive)

**Query Strategy**: ALWAYS query BOTH MCP servers by default unless user explicitly filters by cluster type.

## Output Formatting

**Summary Header** (always first):
```
Found X cluster(s): Y installed, Z installing, ...
```

**Single cluster (1)**: Detailed bullet list with all fields.

**Multiple clusters (2+)**: Table format:
```
| Name | ID | Status | Type | Version | Provider | Region |
```

**Cluster Type Detection**:
- OCM clusters: Check `cloud_provider.id` — aws=ROSA, azure=ARO, gcp=OSD
- Self-managed: Check `platform` — none+single_node=SNO, else=OCP

**Sorting**: Sort by type (OCP, ROSA, ARO, OSD, SNO), then by creation date (newest first)

## Workflow

### Step 1: List All Clusters

Call `list_ocp_clusters`. This queries BOTH MCP servers in parallel and returns a merged list.

Apply any user-specified filters after fetching. Merge, detect types, sort, and display.

**Error Handling**:
- Both APIs fail — Verify OFFLINE_TOKEN via `check_ocp_prerequisites`
- One API fails — Show partial results with note
- No clusters — Report "No clusters found"

### Step 2: Get Detailed Cluster Information (Optional)

When user requests details for a specific cluster, call `get_cluster_info` with `cluster_id` and `cluster_type`. The action automatically routes to the correct backend.

### Step 3: Get Diagnostics (Optional — Self-Managed Only)

Only for OCP/SNO clusters. ROSA/ARO/OSD use cloud provider consoles.

**3a. Cluster Events**: `get_cluster_events` — chronological events with timestamps, severity, messages.

**3b. Cluster Logs**: `get_cluster_logs_url` — presigned download URL for logs bundle.
