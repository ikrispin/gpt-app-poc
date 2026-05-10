# OCP Admin GPT Configuration

This directory contains the configuration files for the **OCP Admin GPT** in the GPT Store.

## Directory Structure

```
gpt-config/
  instructions.md    # Paste into GPT Builder "Instructions" field
  knowledge/         # Upload all files as GPT "Knowledge" files
  README.md          # This file
```

## Setup Instructions

### 1. Create the Custom GPT

1. Go to [ChatGPT GPT Builder](https://chatgpt.com/gpts/editor)
2. Name: **Red Hat OCP Admin GPT**
3. Description: OpenShift cluster administration assistant for creating and managing clusters.

### 2. Configure Instructions

Copy the entire contents of `instructions.md` into the **Instructions** field in the GPT Builder.

### 3. Upload Knowledge Files

Upload all `.md` files from the `knowledge/` directory into the **Knowledge** section. These provide the GPT with contextual documentation for troubleshooting, networking, host requirements, and other OpenShift administration topics.

### 4. Configure Actions (MCP Connector)

Add an MCP Action pointing to your deployed MCP server endpoint:

- **Server URL**: Your MCP server URL (e.g., `https://your-domain.com/mcp`)
- **Authentication**: As configured on your MCP server

The GPT will discover available tools automatically via the MCP protocol.

### Available Actions (from MCP Server)

The MCP server exposes these tools that the GPT can call:

| Action | Description |
|--------|-------------|
| `check_ocp_prerequisites` | Check environment variables and MCP server connectivity |
| `list_ocp_clusters` | List all OpenShift clusters across deployment types |
| `get_cluster_info` | Get detailed information about a specific cluster |
| `get_cluster_events` | Get event history for self-managed clusters |
| `get_cluster_logs_url` | Get download URL for cluster logs |
| `create_ocp_cluster` | Create a new self-managed OpenShift cluster |
| `get_cluster_hosts` | Get registered hosts and discovery ISO URL |
| `set_host_role` | Assign master/worker role to a host |
| `set_cluster_vips` | Configure API and Ingress VIPs |
| `start_cluster_installation` | Trigger cluster installation |
| `get_installation_progress` | Get installation status and progress |

## Architecture

```
User
  |
  v
GPT Store: OCP Admin GPT
  |-- Instructions (this dir: instructions.md)
  |-- Knowledge (this dir: knowledge/*.md)
  |-- Actions (MCP connector)
        |
        v (MCP Protocol)
  MCP Server (gpt-app-poc)
        |
        +-- openshift-self-managed (Assisted Installer API)
        +-- openshift-ocm-managed (OCM API)
```

Skills and behavior logic live in the GPT definition (instructions + knowledge).
The MCP server is a pure tool/action layer with no skill logic.

## Updating

- **Skills changed?** Update `instructions.md` and re-paste into GPT Builder.
- **Docs changed?** Re-upload affected files from `knowledge/` to GPT Knowledge.
- **New tools?** They are auto-discovered via MCP protocol; update `instructions.md` to reference them.

## Source Files

The instructions were composed from:
- `agentic-collections/ocp-admin/CLAUDE.md` (intent routing, global rules)
- `agentic-collections/ocp-admin/skills/cluster-inventory/SKILL.md`
- `agentic-collections/ocp-admin/skills/cluster-creator/SKILL.md`

The knowledge files were copied from:
- `agentic-collections/ocp-admin/docs/`
