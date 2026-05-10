# Skill: cluster-creator

Create and install self-managed OpenShift clusters (OCP, SNO) via the Assisted Installer API.

## Prerequisites

**Required Actions**: `check_ocp_prerequisites`, `create_ocp_cluster`, `get_cluster_hosts`, `set_host_role`, `set_cluster_vips`, `start_cluster_installation`, `get_installation_progress`, `get_cluster_info`, `get_cluster_events`

**Environment Variables**: `OFFLINE_TOKEN` — Red Hat authentication token

**Cluster Types Supported**:
- **OCP** (OpenShift Container Platform) — Self-managed HA clusters (3+ control plane nodes). Platforms: baremetal, vsphere, nutanix, oci.
- **SNO** (Single-Node OpenShift) — Self-managed single-node clusters. Platform: always "none".

**NOT Supported** (different APIs): ROSA, ARO, OSD — use cluster-inventory to view these.

## When to Use

- Creating new OpenShift cluster from scratch
- Deploying SNO for edge/development
- Setting up production HA cluster
- Have servers ready for OpenShift installation

Do NOT use when:
- Listing/inspecting clusters → Use cluster-inventory
- Managing workloads → Out of scope
- Upgrading clusters → Not supported

## Workflow

### Step 1: Prerequisites Check

Call `check_ocp_prerequisites`. Verify OFFLINE_TOKEN is set and MCP servers are connected. On failure, stop and report.

### Step 2: Gather Cluster Requirements

Collect from the user:
1. **Cluster Type**: SNO (single-node) or HA (multi-node, 3+ control plane)
2. **Platform**: SNO is automatically "none". For HA: baremetal, vsphere, nutanix, or oci.
3. **Version**: Ask what OpenShift version (e.g. 4.21.0)
4. **Cluster Name**: 1-54 chars, lowercase/numbers/hyphens, starts with letter
5. **Base Domain**: Valid DNS format (e.g. example.com)
6. **Network Type**: OVNKubernetes (default) or OpenShiftSDN

### Step 3: Network Configuration

- **Default**: Auto CIDRs, DHCP. For HA clusters, ask for API VIP and Ingress VIP.
- **Custom CIDRs**: Ask for cluster and service network CIDRs.
- **Static IPs**: Requires NMState YAML configuration per host.

### Step 4: Configuration Briefing

Display a summary of all collected parameters for user review.

### Step 5: Confirmation Before Creation

**CRITICAL**: Ask "Review configuration. Ready to create cluster definition?" and wait for explicit approval.

### Step 6: Create Cluster Definition

Call `create_ocp_cluster` with the collected parameters. Returns a cluster ID for all subsequent operations.

### Step 7: Apply Platform Configuration

**Set VIPs** (HA + baremetal/vsphere/nutanix only): Call `set_cluster_vips` with API VIP and Ingress VIP. Requires user confirmation.

### Step 8: Host Discovery

Instruct the user to boot hosts from the discovery ISO. Wait for user to confirm hosts are booted.

Call `get_cluster_hosts` to check discovered hosts.

**Validation**:
- SNO: Requires exactly 1 host
- HA: Minimum 3 hosts

### Step 9: Host Role Assignment

For each host, call `set_host_role`:
- **SNO**: Single host auto-assigned "master"
- **HA**: First 3 hosts as "master", additional as "worker". Allow user override.

Requires user confirmation before applying.

### Step 10: Validate Readiness

Call `get_cluster_info` to verify cluster status is "ready". If validation fails, display errors and consult troubleshooting.md from knowledge.

### Step 11: Final Confirmation Before Installation

**CRITICAL**: Display summary and emphasize "Starting installation is irreversible!". Wait for explicit "YES".

### Step 12: Start Installation

Call `start_cluster_installation`. Monitor progress via `get_installation_progress` and `get_cluster_events`.

Expected duration: 45-60 minutes.

### Step 13: Installation Complete

Report completion with cluster details: Console URL, API endpoint, credential retrieval instructions.

## Human-in-the-Loop

This skill performs critical, irreversible operations requiring explicit user confirmation:
1. **Cluster Definition Creation** (Step 5)
2. **Starting Installation** (Step 11)
3. **After Major Steps**: VIP/network/role configuration results

**Never Assume Approval** — Always wait for explicit confirmation.
