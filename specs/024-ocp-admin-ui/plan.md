# Implementation Plan: OCP Admin UI — Cluster Inventory View

**Branch**: `024-ocp-admin-ui` | **Date**: 2026-04-28 | **Spec**: `specs/024-ocp-admin-ui/spec.md`
**Input**: Feature specification from `specs/024-ocp-admin-ui/spec.md`

## Summary

Add workflow-based UI routing to the MCP widget so the app can render different UIs for different personas. Register OCP admin UI resources (`ui://ocp-admin/*`), inject a workflow identifier meta tag when serving the HTML, and conditionally render an `OcpAdminApp` component with a 2-step wizard (prerequisites + cluster inventory table with mock data). The existing engage workflow remains the default and is unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), React 19.x, Node.js runtime
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `react`, `react-dom`, `express`, `zod`
**Storage**: N/A — mock data embedded in source; no persistent state
**Testing**: `tsx --test` suites (`test:unit`, `test:contract`, `test:integration`, `test:regression`)
**Target Platform**: Linux-hosted MCP server + MCP Apps-compatible widget hosts
**Project Type**: Single MCP server project with embedded React widget
**Performance Goals**: Widget renders within existing load-time bounds; no new computation
**Constraints**: Single HTML bundle output (no build changes); engage workflow must remain unchanged; same `rhds-*` CSS styling; text fallback for non-UI hosts already exists via `start_ocp_admin` tool response
**Scale/Scope**: ~200 lines of new React components, ~30 lines of server.ts changes, ~20 lines of mcp-app.ts routing logic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Diagnostics stay explicit and read-only: OCP admin UI displays mock cluster data only; no diagnostic collection or write operations. **PASS**
- MCP Apps compliance: Uses standard `ui://` resources served via `registerAppResource` with JSON-RPC bridge. **PASS**
- Text fallback for non-UI hosts: The `start_ocp_admin` tool already returns full text content. UI adds visual rendering on top. **PASS**
- Redaction and least-scope data: No credentials or sensitive data are displayed. Mock data contains no real cluster information. **PASS**
- Non-retroactive spec integrity: All new artifacts in `specs/024-ocp-admin-ui/` only. **PASS**

## Project Structure

### Documentation (this feature)

```text
specs/024-ocp-admin-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ocp-admin-ui-resource.contract.v1.json
└── tasks.md
```

### Source Code (repository root)

```text
server.ts                                          # Modify: refactor loadWidgetHtml, add OCP admin UI resources, update start_ocp_admin _meta

src/
├── mcp-app.ts                                     # Modify: add workflow detection and OCP admin render path
└── mcp-app/
    ├── App.tsx                                    # Unchanged (engage-specific)
    ├── state.ts                                   # Unchanged (engage-specific)
    ├── step-content.tsx                            # Unchanged (engage-specific)
    ├── ui/
    │   ├── action-button-adapter.tsx               # Reused by OCP admin
    │   └── status-display-adapter.tsx              # Reused by OCP admin
    └── ocp-admin/
        ├── OcpAdminApp.tsx                        # New: 2-step OCP admin wizard
        ├── ocp-state.ts                           # New: OCP admin types and mock data
        └── ocp-step-content.tsx                   # New: prerequisites + cluster inventory steps

tests/
├── contract/
│   └── ocp-admin-ui-resource.contract.test.ts     # New: UI resource registration and meta tag
└── regression/
    └── mcp-tool-surface-preservation.test.ts       # Modify: add OCP admin UI resource URIs
```

**Structure Decision**: Extend the existing single-project architecture. New OCP admin components go in `src/mcp-app/ocp-admin/` subdirectory to keep them isolated from engage components.

## Implementation Strategy

1. Refactor `loadEngageWidgetHtml()` in `server.ts` into a generic `loadWidgetHtml(workflowId)` that injects `<meta name="gpt-app-workflow" content="${workflowId}">`. The existing function becomes `loadWidgetHtml("engage")`.
2. Add OCP admin UI resource URI constants and register them using the same pattern as engage URIs.
3. Update `start_ocp_admin` tool's `_meta.ui.resourceUri` to point to the OCP admin resource URI.
4. Add workflow detection in `src/mcp-app.ts`: read the `gpt-app-workflow` meta tag, branch to OCP admin render path or existing engage path.
5. Create `OcpAdminApp` component with 2-step progress navigation, reusing `StatusDisplayAdapter` and `ActionButtonAdapter`.
6. Create step content components: `PrerequisitesContent` (persona info, env vars, MCP servers) and `ClusterInventoryContent` (summary header + table with 5 mock clusters).
7. Add contract test verifying OCP admin UI resource serves HTML with correct meta tag.
8. Extend regression test to include OCP admin UI resource URIs.

## Phase 0: Research Plan

- Confirm the meta tag injection approach works: `loadEngageWidgetHtml` already injects 2 meta tags into `</head>`. Adding a third (`gpt-app-workflow`) follows the identical pattern. No unknowns.
- Confirm the frontend can read the meta tag: `mcp-app.ts` already reads `gpt-app-api-base` and `gpt-app-build-id` via `document.querySelector('meta[name="..."]')`. Same pattern for workflow detection. No unknowns.
- Confirm `ProgressAffordanceAdapter` is engage-specific: it hardcodes 4 steps with engage labels. A separate 2-step nav for OCP admin avoids touching this component. Confirmed.

## Phase 1: Design & Contracts Plan

- Create `data-model.md` for workflow identifier, OCP admin step types, and cluster row entity.
- Create contract: `contracts/ocp-admin-ui-resource.contract.v1.json` — verifies OCP admin UI resource registration and meta tag injection.
- Create `quickstart.md` with implementation sequence and verification commands.
- Run `.specify/scripts/bash/update-agent-context.sh cursor-agent`.

## Post-Design Constitution Re-Check

- No diagnostic collection or write operations added. **PASS**
- UI resources use standard `ui://` pattern with `registerAppResource`. **PASS**
- Text fallback exists via `start_ocp_admin` tool. **PASS**
- No credentials or real cluster data exposed. **PASS**
- All new artifacts stay within `specs/024-ocp-admin-ui/`. **PASS**

## Complexity Tracking

No constitution violations identified; complexity justification table is not required.
