# Research: OCP Admin Interactive UI — Live Tool Calls

**Feature**: `025-ocp-admin-interactive-ui`
**Date**: 2026-04-29

## R1: Can callTool be used from the OCP admin workflow branch?

**Decision**: Yes — `callTool` and `app` are both defined at the top level of `mcp-app.ts`, before the `if (detectedWorkflow === "ocp-admin")` branch. They're accessible from both code paths.

**Rationale**: The `callTool` function (line ~390) wraps `app.callServerTool()` with error handling and status updates. However, it calls `setStatus()` and `render()` which are engage-specific. The OCP admin branch needs its own `setOcpStatus()` and `ocpRender()`. Rather than modifying `callTool`, create a parallel `ocpCallTool` that uses the OCP admin state and render function.

**Alternatives considered**:
- **Reuse `callTool` directly**: Would update engage UI state and call engage render. Wrong workflow.
- **Make `callTool` generic**: Would require refactoring the engage code path. Too risky.

## R2: Where should MOCK_CLUSTERS live?

**Decision**: Move to `server.ts` — the server returns it via `list_ocp_clusters` tool. Remove from `ocp-state.ts` frontend initialization.

**Rationale**: In spec 024, `MOCK_CLUSTERS` was in `ocp-state.ts` because the UI was static. Now the data flows through tool calls, so the server owns the data. The frontend receives clusters dynamically from `structuredContent.clusters`.

**Alternatives considered**:
- **Keep in both places**: Duplication — frontend mock and server mock could drift.
- **Keep only in frontend**: Defeats the purpose of making the UI interactive via tool calls.

## R3: How to handle the prerequisites auto-check timing?

**Decision**: Call `check_ocp_prerequisites` immediately when the OCP admin branch initializes (not on step navigation). Cache the result in `ocpUiState.prerequisiteResults`. The "Re-check" button re-invokes the tool.

**Rationale**: Auto-checking on init means results are ready by the time the user sees the prerequisites step. There's no delay when navigating to step 1. The re-check button handles the case where the user sets up env vars while the UI is open.

**Alternatives considered**:
- **Check on step navigation**: Adds a visible delay each time the user navigates to step 1. Worse UX.
- **Don't auto-check, button only**: User has to manually click — less polished for a demo.
