# Implementation Plan: OCP Admin — Real MCP Server Integration

**Branch**: `026-ocp-mcp-integration` | **Date**: 2026-04-30 | **Spec**: `specs/026-ocp-mcp-integration/spec.md`
**Input**: Feature specification from `specs/026-ocp-mcp-integration/spec.md`

## Summary

Replace mock cluster data with real data from external MCP servers. Create an MCP client module that spawns podman containers (openshift-self-managed, openshift-ocm-managed) as child processes, connects via stdio transport, and proxies `list_clusters` calls. Fall back to mock data gracefully when prerequisites are missing. Add a `dataSource` indicator ("live" / "mock") to responses so the UI can show which mode is active.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js runtime
**Primary Dependencies**: `@modelcontextprotocol/sdk` (Client, StdioClientTransport), `express`, `zod`
**Storage**: In-memory connection cache (no persistence)
**Testing**: `tsx --test` suites
**Target Platform**: Linux-hosted MCP server with podman for container management
**Project Type**: Single MCP server project with embedded React widget
**Performance Goals**: Live cluster data within 10 seconds; mock fallback within 2 seconds
**Constraints**: No credential values in responses; graceful fallback; same ClusterRow format for live and mock data
**Scale/Scope**: ~150 lines new module, ~60 lines server.ts updates, ~10 lines UI indicator

## Constitution Check

- Diagnostics stay explicit and read-only: external MCP calls are read-only (`list_clusters`). No write operations. **PASS**
- MCP Apps compliance: no changes to UI resource registration. **PASS**
- Text fallback: tool responses include text content. **PASS**
- Redaction: OFFLINE_TOKEN is passed to containers via env var, never exposed in responses. **PASS**
- Non-retroactive spec integrity: all artifacts in `specs/026-ocp-mcp-integration/`. **PASS**

## Project Structure

### Source Code

```text
src/
└── mcp-client/
    └── ocp-mcp-client.ts              # New: MCP client manager for external servers

server.ts                               # Modify: update list_ocp_clusters and check_ocp_prerequisites handlers

src/mcp-app/ocp-admin/
├── ocp-state.ts                       # Modify: add dataSource to state types
└── ocp-step-content.tsx               # Modify: add live/mock indicator badge

tests/contract/
└── ocp-admin-tools.contract.test.ts    # Modify: add dataSource field assertions
```

## Implementation Strategy

1. Create `src/mcp-client/ocp-mcp-client.ts`:
   - Define podman container configs for both servers (image, env vars, API URLs) as constants
   - `ensureConnection(serverName)`: spawn container via `StdioClientTransport`, connect `Client`, cache
   - `listClusters()`: call `list_clusters` on both servers in parallel, merge results, transform to `ClusterRow[]`
   - `checkConnectivity()`: attempt connections, report status per server
   - `isPodmanAvailable()`: check `which podman`
   - Handle errors: connection failure → return `{ ok: false, error }`, caller decides fallback

2. Update `list_ocp_clusters` in `server.ts`:
   - Try `ocpMcpClient.listClusters()`
   - If successful: return clusters with `dataSource: "live"`
   - If failed: return `OCP_MOCK_CLUSTERS` with `dataSource: "mock"` and a status message

3. Update `check_ocp_prerequisites` in `server.ts`:
   - Check `podman` availability via `isPodmanAvailable()`
   - Check `OFFLINE_TOKEN` presence (existing)
   - Try `checkConnectivity()` for actual server status
   - Report all three categories in structured response

4. Update frontend:
   - Add `dataSource: "live" | "mock"` to `OcpAdminUiState`
   - Show a small badge in `ClusterInventoryContent`: "Live data" (green) or "Mock data" (yellow)

## External Server Configuration

Both servers use the same container image with different API URLs:

**openshift-self-managed**:
```
podman run --rm -i --network=host \
  -e OFFLINE_TOKEN=${OFFLINE_TOKEN} \
  -e TRANSPORT=stdio \
  -e INVENTORY_URL=https://api.openshift.com/api/assisted-install/v2 \
  -e PULL_SECRET_URL=https://api.openshift.com/api/accounts_mgmt/v1/access_token \
  -e SSO_URL=https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token \
  quay.io/ecosystem-appeng/assisted-service-mcp:ocm
```

**openshift-ocm-managed**:
```
podman run --rm -i --network=host \
  -e OFFLINE_TOKEN=${OFFLINE_TOKEN} \
  -e TRANSPORT=stdio \
  -e INVENTORY_URL=https://api.openshift.com/api/clusters_mgmt/v1 \
  -e PULL_SECRET_URL=https://api.openshift.com/api/accounts_mgmt/v1/access_token \
  -e SSO_URL=https://sso.redhat.com/auth/realms/redhat-external/protocol/openid-connect/token \
  quay.io/ecosystem-appeng/assisted-service-mcp:ocm
```

## Phase 0: Research

- `Client` from `@modelcontextprotocol/sdk/client/index.js` — available, no new deps
- `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` — spawns child process
- Container image: `quay.io/ecosystem-appeng/assisted-service-mcp:ocm` for both servers
- `list_clusters` tool exposed by both servers — takes no parameters, returns cluster array

## Phase 1: Design & Contracts

- Create data-model.md, contracts, quickstart
- Run agent context update

## Post-Design Constitution Re-Check

- All external calls are read-only. **PASS**
- OFFLINE_TOKEN never in responses. **PASS**
- Mock fallback ensures functionality when infra missing. **PASS**
- All artifacts in active spec package. **PASS**

## Complexity Tracking

No constitution violations identified.
