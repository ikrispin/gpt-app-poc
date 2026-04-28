# Data Model: OCP Admin Persona — Minimal Skill Integration

**Feature**: `023-ocp-admin-persona`
**Date**: 2026-04-26

## Entities

### Skill Registration Entry

Represents a skill registered in the MCP server's skill registry.

**Fields**:
- **uri** (string): Canonical skill URI (e.g., `skill://ocp-admin/SKILL.md`). Globally unique identifier used by `list_skills` and `get_skill`.
- **sourcePath** (string): Filesystem path to the SKILL.md file, resolved relative to the server root.
- **fallback** (string): Human-readable text returned when the sourcePath is unreadable.
- **loader** (function): Async function that reads the source path and returns markdown content, or falls back to the fallback string.

**Validation**:
- URI must start with `skill://`.
- Source path must be a valid filesystem path (resolved at registration time, not validated at runtime — fallback handles missing files).

### Start Tool Response

Structured content returned by the `start_ocp_admin` tool.

**Fields**:
- **persona** (string): Persona identifier (`"ocp-admin"`).
- **skill_uri** (string): Canonical skill URI for loading full skill content.
- **available_skills** (string[]): List of sub-skill names currently available (e.g., `["cluster-inventory"]`).
- **prerequisites** (object):
  - **env_vars** (string[]): Required environment variable names (e.g., `["OFFLINE_TOKEN"]`).
  - **mcp_servers** (string[]): Required external MCP server names (e.g., `["openshift-self-managed", "openshift-ocm-managed"]`).

**Validation**:
- `persona` must be a non-empty string.
- `skill_uri` must start with `skill://`.
- `available_skills` must contain at least one entry.
- `prerequisites.env_vars` and `prerequisites.mcp_servers` must be arrays (may be empty).

## Relationships

- A **Skill Registration Entry** is referenced by the `list_skills` tool (returns all URIs) and the `get_skill` tool (returns content for a specific URI).
- The **Start Tool Response** includes the URI from the skill's **Skill Registration Entry** and describes prerequisites documented within the skill content.
