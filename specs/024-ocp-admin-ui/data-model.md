# Data Model: OCP Admin UI — Cluster Inventory View

**Feature**: `024-ocp-admin-ui`
**Date**: 2026-04-28

## Entities

### Workflow Identifier

A label embedded in the served UI HTML that determines which workflow the frontend renders.

**Values**:
- `"engage"` — existing support engineer workflow (default)
- `"ocp-admin"` — OpenShift cluster administration workflow

**Delivery**: Injected as `<meta name="gpt-app-workflow" content="${workflowId}">` in the HTML `<head>` at serve time.

**Validation**: Must be one of the known values. Unknown values fall back to `"engage"` for backward compatibility.

### OCP Admin Workflow Step

Discriminator for the current step in the OCP admin UI.

**Values**:
- `"prerequisites"` — persona overview, environment checks, available skills
- `"cluster_inventory"` — cluster list table with summary

**Navigation**: Steps are navigable in both directions. Hash routing maps `#step-1` to prerequisites, `#step-2` to cluster_inventory.

### OCP Admin Workflow State

Tracks the current state of the OCP admin UI.

**Fields**:
- **current_step** (OcpAdminWorkflowStep): The active step in the wizard.

### OCP Admin UI State

Dynamic UI state for rendering.

**Fields**:
- **statusMessage** (string): Current status message shown to the user.
- **statusVariant** ("info" | "success" | "warning" | "danger"): Visual style of the status message.
- **clusters** (ClusterRow[]): Array of cluster data rows to display in the table.

### Cluster Row

A data record representing one OpenShift cluster in the inventory table.

**Fields**:
- **name** (string): Human-readable cluster name.
- **id** (string): Unique cluster identifier (UUID or OCM ID).
- **status** (string): Current cluster status ("ready", "installing", "pending-for-input", "error").
- **type** (string): Cluster deployment type ("OCP", "SNO", "ROSA", "ARO", "OSD").
- **version** (string): OpenShift version (e.g., "4.21.0").
- **provider** (string): Infrastructure provider ("Baremetal", "vSphere", "AWS", "Azure", "Self-managed").
- **region** (string): Cloud region or "-" for on-premises.

**Validation**: All fields are required strings. Status should be one of the known values for correct icon rendering.

## Mock Data

5 representative clusters for the initial implementation:

| Name | ID | Status | Type | Version | Provider | Region |
|------|----|--------|------|---------|----------|--------|
| prod-ocp | 762df996-... | installing | OCP | 4.21.0 | Baremetal | - |
| dev-ocp | a1b2c3d4-... | ready | OCP | 4.20.5 | vSphere | - |
| rosa-prod | 2o2gevtk... | ready | ROSA | 4.21.0 | AWS | us-east-1 |
| aro-dev | 20ekbvg1... | ready | ARO | 4.20.0 | Azure | - |
| edge-01 | 8e5d3e45-... | pending-for-input | SNO | 4.21.0 | Self-managed | - |
