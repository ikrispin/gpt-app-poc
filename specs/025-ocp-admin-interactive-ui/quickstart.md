# Quickstart: OCP Admin Interactive UI — Live Tool Calls

**Feature**: `025-ocp-admin-interactive-ui`
**Date**: 2026-04-29

## Goal

Make the OCP admin UI interactive by wiring it to MCP tool calls. Prerequisites auto-check on load. Cluster inventory loads dynamically via button click with loading state.

## Preconditions

- On branch `025-ocp-admin-interactive-ui`
- Specs 023 and 024 committed
- Dependencies installed (`npm install`)
- Existing tests pass (`npm run test:jira`)

## Implementation Sequence

1. **Move MOCK_CLUSTERS to server.ts** — cut from `ocp-state.ts`, paste into `server.ts` as server-side constant

2. **Add `check_ocp_prerequisites` tool** in `server.ts` — checks `process.env.OFFLINE_TOKEN`, returns structured prerequisite status

3. **Add `list_ocp_clusters` tool** in `server.ts` — returns MOCK_CLUSTERS in structuredContent

4. **Update `ocp-state.ts`** — add `isLoading`, `PrerequisiteResult`, `PrerequisiteCheckResult` types; remove MOCK_CLUSTERS export; change clusters initial value to empty array

5. **Update `OcpAdminApp.tsx`** — add new props: `isLoading`, `prerequisiteResults`, `onLoadClusters`, `onRefreshClusters`, `onCheckPrerequisites`

6. **Update `ocp-step-content.tsx`** — prerequisites: pass/fail indicators, re-check button; cluster inventory: empty state, load button, loading spinner, refresh button

7. **Wire tool calls in `mcp-app.ts`** — create `ocpCallTool`, `onCheckPrerequisites`, `onLoadClusters`; auto-check on init; pass callbacks to OcpAdminApp

8. **Add tests** — contract test for both tools; update regression test

## Verification

```bash
npm run build
npm run test:jira

# Manual: open OCP admin UI in browser
cp dist/mcp-app.html /tmp/ocp-admin-test.html
sed -i 's|</head>|<meta name="gpt-app-workflow" content="ocp-admin" /></head>|' /tmp/ocp-admin-test.html
xdg-open /tmp/ocp-admin-test.html
```

## Acceptance Checklist

- [ ] `check_ocp_prerequisites` tool returns structured prerequisite status
- [ ] `list_ocp_clusters` tool returns cluster array with 5 rows
- [ ] Prerequisites step auto-checks on load and shows indicators
- [ ] "Re-check" button refreshes prerequisite status
- [ ] Cluster inventory starts empty (no pre-loaded data)
- [ ] "Load Clusters" button triggers tool call with loading spinner
- [ ] Table populates from tool response
- [ ] "Refresh" button reloads clusters
- [ ] Error handling shows message and allows retry
- [ ] Engage workflow unchanged (zero regression)
