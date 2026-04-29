# Research: OCP Admin UI — Cluster Inventory View

**Feature**: `024-ocp-admin-ui`
**Date**: 2026-04-28

## R1: How to detect workflow type in the frontend?

**Decision**: Inject `<meta name="gpt-app-workflow" content="ocp-admin">` in the served HTML; read it with `document.querySelector` at boot.

**Rationale**: The project already injects `gpt-app-api-base` and `gpt-app-build-id` meta tags via `loadEngageWidgetHtml()`. Adding a third tag follows the identical pattern. The server knows which `ui://` URI is being served, so it can inject the correct workflow ID. The frontend reads it once at startup to decide which React tree to render.

**Alternatives considered**:
- **Query parameter in resource URI**: Would work but the URI is a resource identifier, not a configuration surface. Meta tag is cleaner separation.
- **Host context / toolInfo detection**: The `App.getHostContext()` could theoretically detect the tool name, but this depends on the LLM client passing context correctly. Less reliable than server-injected metadata.

## R2: Should we modify ProgressAffordanceAdapter to support variable step counts?

**Decision**: No. Create a separate inline 2-step nav in `OcpAdminApp.tsx`.

**Rationale**: The existing `ProgressAffordanceAdapter` has 4 hardcoded steps with engage-specific labels ("Select Product", "Troubleshooting", etc.) and 4 explicit navigation callbacks. Making it generic would require changing its props interface and all call sites — high regression risk for the engage workflow. A simple 2-button nav inline in `OcpAdminApp` is ~20 lines and completely isolated.

**Alternatives considered**:
- **Generic step adapter with array of steps**: Cleaner long-term but touches the engage code path. Rejected for this phase to minimize regression risk.
- **Copy ProgressAffordanceAdapter and modify**: Creates duplication. The inline approach is simpler since we only need 2 steps.

## R3: How to structure the OCP admin components within the project?

**Decision**: New subdirectory `src/mcp-app/ocp-admin/` with 3 files.

**Rationale**: Keeps OCP admin components isolated from engage components. The engage components stay in `src/mcp-app/` root (App.tsx, state.ts, step-content.tsx). OCP admin gets its own subdirectory to avoid confusion and enable easy cleanup if the approach changes.

**Alternatives considered**:
- **Separate top-level directory `src/mcp-app-ocp-admin/`**: Too disconnected from the shared utilities in `src/mcp-app/ui/`.
- **Mixed in with engage files**: Confusing — hard to tell which files belong to which workflow.

## R4: How to serve the same HTML bundle for both workflows?

**Decision**: Refactor `loadEngageWidgetHtml()` into `loadWidgetHtml(workflowId: string)` that injects the workflow meta tag. Both engage and OCP admin resource handlers call this function with their respective workflow ID.

**Rationale**: Both workflows use the same built `dist/mcp-app.html` file (single Vite output). The only difference is the injected meta tag that tells the frontend which workflow to render. This avoids any build system changes.

**Alternatives considered**:
- **Separate HTML entry points**: Would require Vite config changes and produce two bundles. Over-engineered for adding a meta tag.
- **Runtime detection via URL**: The widget doesn't have reliable access to its own resource URI at runtime.
