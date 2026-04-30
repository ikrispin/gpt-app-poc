# Quickstart: OCP Admin — Real MCP Server Integration

**Feature**: `026-ocp-mcp-integration`
**Date**: 2026-04-30

## Goal

Connect the OCP admin cluster inventory to real external MCP servers so it shows actual Red Hat cluster data, with graceful fallback to mock data.

## Preconditions

- On branch `026-ocp-mcp-integration`
- Specs 023-025 committed
- Dependencies installed (`npm install`)
- Existing tests pass

### For live data testing (optional)

- `podman` installed
- `OFFLINE_TOKEN` env var set (from cloud.redhat.com/openshift/token)
- Container image accessible: `quay.io/ecosystem-appeng/assisted-service-mcp:ocm`

## Implementation Sequence

1. **Create MCP client module** — `src/mcp-client/ocp-mcp-client.ts`
2. **Update `list_ocp_clusters`** in `server.ts` — try live, fall back to mock
3. **Update `check_ocp_prerequisites`** in `server.ts` — add podman and connectivity checks
4. **Update frontend state** — add `dataSource` to `ocp-state.ts`
5. **Update UI** — add live/mock badge to `ocp-step-content.tsx`
6. **Update contract test** — add `dataSource` assertions
7. **Update regression test** — verify tool surface

## Verification

```bash
# Without podman (mock fallback mode)
npm run build
npm run test:jira
PORT=3001 CONSENT_TOKEN_SIGNING_KEY=test-key npm run serve
# Call list_ocp_clusters → should return mock data with dataSource: "mock"

# With podman + OFFLINE_TOKEN (live mode)
OFFLINE_TOKEN=your-token PORT=3001 CONSENT_TOKEN_SIGNING_KEY=test-key npm run serve
# Call list_ocp_clusters → should return real clusters with dataSource: "live"
```

## Acceptance Checklist

- [ ] `list_ocp_clusters` returns `dataSource: "live"` when podman + OFFLINE_TOKEN available
- [ ] `list_ocp_clusters` returns `dataSource: "mock"` when prerequisites missing
- [ ] `check_ocp_prerequisites` reports podman availability
- [ ] `check_ocp_prerequisites` reports actual server connectivity
- [ ] Cluster data format (ClusterRow) is identical for live and mock data
- [ ] UI shows "Live data" or "Mock data" indicator
- [ ] OFFLINE_TOKEN value never appears in any response
- [ ] Engage workflow unchanged
- [ ] All existing tests pass
