# Quickstart: OCP Admin UI — Cluster Inventory View

**Feature**: `024-ocp-admin-ui`
**Date**: 2026-04-28

## Goal

Add workflow-based UI routing so the OCP admin persona renders its own 2-step UI (prerequisites + cluster inventory table) instead of the support engineer UI.

## Preconditions

- On branch `024-ocp-admin-ui`
- Spec 023 (OCP admin persona text-only skill) is committed
- Dependencies installed (`npm install`)
- Existing tests pass (`npm run test:jira`)

## Implementation Sequence

1. **Refactor widget HTML loader** in `server.ts`
   - Rename `loadEngageWidgetHtml` to `loadWidgetHtml(workflowId: string)`
   - Add `<meta name="gpt-app-workflow" content="${workflowId}">` injection
   - Create `loadEngageWidgetHtml` and `loadOcpAdminWidgetHtml` wrappers

2. **Register OCP admin UI resources** in `server.ts`
   - Add `ocpAdminResourceUri` constant
   - Register `ui://ocp-admin/app.html` resource using `loadOcpAdminWidgetHtml`

3. **Update `start_ocp_admin` tool** in `server.ts`
   - Change `_meta.ui.resourceUri` from `engageResourceUri` to `ocpAdminResourceUri`

4. **Add workflow detection** in `src/mcp-app.ts`
   - Read `<meta name="gpt-app-workflow">` at boot
   - If `"ocp-admin"`: initialize OCP admin state, render `OcpAdminApp`
   - Default: existing engage render path (unchanged)

5. **Create OCP admin state types** in `src/mcp-app/ocp-admin/ocp-state.ts`
   - `OcpAdminStep`, `OcpAdminWorkflowState`, `OcpAdminUiState`, `ClusterRow`
   - `MOCK_CLUSTERS` constant with 5 sample rows

6. **Create step content components** in `src/mcp-app/ocp-admin/ocp-step-content.tsx`
   - `PrerequisitesContent` — persona info, env var list, MCP server list
   - `ClusterInventoryContent` — summary header + table

7. **Create OCP admin app component** in `src/mcp-app/ocp-admin/OcpAdminApp.tsx`
   - 2-step nav + content panel
   - Reuse `StatusDisplayAdapter` and `ActionButtonAdapter`

8. **Add tests**
   - Contract: OCP admin UI resource registered with correct meta tag
   - Regression: extend tool surface test with OCP admin UI resource URIs

## Verification

```bash
# Build the widget bundle
npm run build

# Run all tests
npm run test:jira

# Manual verification: start server and call start_ocp_admin
PORT=3001 CONSENT_TOKEN_SIGNING_KEY=test-key npm run serve
# In another terminal, run the manual test script or call tools via curl
```

## Acceptance Checklist

- [ ] `start_ocp_admin` tool references `ui://ocp-admin/app.html` (not engage URI)
- [ ] `ui://ocp-admin/app.html` resource serves HTML with `gpt-app-workflow=ocp-admin` meta tag
- [ ] `ui://engage-red-hat-support/app.html` serves HTML with `gpt-app-workflow=engage` meta tag
- [ ] OCP admin UI renders prerequisites step with persona info
- [ ] OCP admin UI renders cluster inventory table with 5 mock clusters
- [ ] Step navigation works between prerequisites and cluster inventory
- [ ] Engage workflow UI still works identically (zero regression)
- [ ] Single HTML bundle output (no build changes)
