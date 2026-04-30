# Research: OCP Admin — Real MCP Server Integration

**Feature**: `026-ocp-mcp-integration`
**Date**: 2026-04-30

## R1: How to connect to external MCP servers from gpt-app-poc?

**Decision**: Use `Client` + `StdioClientTransport` from the MCP SDK to spawn podman containers as child processes.

**Rationale**: The external servers (openshift-self-managed, openshift-ocm-managed) communicate via stdio transport. The MCP SDK already provides `StdioClientTransport` which handles spawning a command, piping stdin/stdout, and running the MCP protocol. `Client` wraps this with `callTool()` for making tool calls. No new dependencies needed — `@modelcontextprotocol/sdk@^1.25.3` is already in package.json.

**Alternatives considered**:
- **HTTP transport**: The containers support `TRANSPORT=stdio` only (from mcps.json). HTTP is not configured.
- **Direct REST API calls**: Would bypass MCP entirely — loses tool schema validation, error handling, and protocol guarantees.

## R2: Should connections be persistent or on-demand?

**Decision**: Connect on first use, cache the connection, reconnect on failure.

**Rationale**: Podman containers take 2-5 seconds to start. Re-spawning on every `list_ocp_clusters` call would make every request slow. Caching the connection after first use means subsequent calls are fast (<500ms). If the connection drops, attempt one reconnect before falling back to mock data.

**Alternatives considered**:
- **Connect at server startup**: Would block startup if podman/OFFLINE_TOKEN aren't available, breaking the graceful degradation requirement.
- **Connect on every call**: Too slow — 2-5 second overhead on every cluster list request.

## R3: How to transform external server responses to ClusterRow format?

**Decision**: Parse the `list_clusters` response content, extract cluster fields, and map to `ClusterRow`.

**Rationale**: The `list_clusters` tool returns text content with cluster data. We need to parse this and extract: name, id, status, type (detected from source + cloud_provider), version, provider, region. Self-managed clusters come from the assisted-installer server; managed clusters (ROSA/ARO/OSD) come from the OCM server. The `source` field is implicit from which server returned the data.

**Alternatives considered**:
- **Pass through raw responses**: Would leak external server format into our UI — breaks the consistent ClusterRow contract.

## R4: Where to put the container configuration?

**Decision**: Embed as constants in `src/mcp-client/ocp-mcp-client.ts`. Do not read mcps.json at runtime.

**Rationale**: Reading mcps.json would create a filesystem path dependency on the `agentic-collections` repo. Embedding the config (image name, env vars, API URLs) keeps the module self-contained. The config values are stable — the image name and API URLs don't change frequently.

**Alternatives considered**:
- **Read mcps.json at runtime**: Fragile path dependency. The file is in a sibling repo that might not be present.
- **Environment variable for config path**: Over-engineered for 2 servers with stable config.

## R5: How to check podman availability?

**Decision**: Use `child_process.execSync("which podman")` wrapped in a try/catch. Cache the result.

**Rationale**: Simple, fast, and reliable. `which` returns 0 if podman is found, non-zero otherwise. Cache the result since podman availability doesn't change during a server session.

**Alternatives considered**:
- **`podman version`**: More thorough but slower. `which` is sufficient for availability check.
- **Check on every call**: Unnecessary — podman won't be installed/uninstalled during a server session.
