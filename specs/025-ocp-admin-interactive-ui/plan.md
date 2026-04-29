# Implementation Plan: OCP Admin Interactive UI — Live Tool Calls

**Branch**: `025-ocp-admin-interactive-ui` | **Date**: 2026-04-29 | **Spec**: `specs/025-ocp-admin-interactive-ui/spec.md`
**Input**: Feature specification from `specs/025-ocp-admin-interactive-ui/spec.md`

## Summary

Add two new MCP tools (`check_ocp_prerequisites` and `list_ocp_clusters`) that return structured data. Wire the OCP admin UI to call these tools dynamically: prerequisites step auto-checks on load with pass/fail indicators, cluster inventory step loads data on button click with loading spinner. Remove hardcoded mock data from the frontend — serve it through tool calls instead.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), React 19.x, Node.js runtime
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `react`, `react-dom`, `express`, `zod`
**Storage**: N/A — mock data served from server-side constants
**Testing**: `tsx --test` suites (`test:unit`, `test:contract`, `test:integration`, `test:regression`)
**Target Platform**: Linux-hosted MCP server + MCP Apps-compatible widget hosts
**Project Type**: Single MCP server project with embedded React widget
**Performance Goals**: Tool responses within 500ms; UI updates within 2 seconds of user action
**Constraints**: Single HTML bundle; engage workflow unchanged; reuse existing `callTool` pattern from `mcp-app.ts`; mock data only (no external MCP server calls)
**Scale/Scope**: ~50 lines in server.ts (2 tools), ~60 lines in mcp-app.ts (tool wiring), ~40 lines in step-content updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Diagnostics stay explicit and read-only: both new tools are read-only, returning mock data or env var presence checks. No diagnostic collection. **PASS**
- MCP Apps compliance: widget calls tools via `app.callServerTool()` — standard MCP Apps pattern. **PASS**
- Text fallback for non-UI hosts: both tools return text content alongside structuredContent. The `start_ocp_admin` text fallback from spec 023 remains intact. **PASS**
- Redaction and least-scope data: `check_ocp_prerequisites` reports whether OFFLINE_TOKEN is set, never its value. **PASS**
- Non-retroactive spec integrity: all new artifacts in `specs/025-ocp-admin-interactive-ui/` only. **PASS**

## Project Structure

### Documentation (this feature)

```text
specs/025-ocp-admin-interactive-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ocp-admin-tools.contract.v1.json
└── tasks.md
```

### Source Code (repository root)

```text
server.ts                                          # Modify: add check_ocp_prerequisites and list_ocp_clusters tools

src/
├── mcp-app.ts                                     # Modify: wire callTool for OCP admin, add loading/error handling
└── mcp-app/
    └── ocp-admin/
        ├── OcpAdminApp.tsx                        # Modify: add new props (isLoading, onLoadClusters, onCheckPrereqs, prerequisiteResults)
        ├── ocp-state.ts                           # Modify: add isLoading, prerequisiteResults types; move MOCK_CLUSTERS to server-only
        └── ocp-step-content.tsx                   # Modify: add loading spinner, load/refresh buttons, empty state, pass/fail indicators

tests/
├── contract/
│   └── ocp-admin-tools.contract.test.ts           # New: contract test for both new tools
└── regression/
    └── mcp-tool-surface-preservation.test.ts       # Modify: add new tools to REQUIRED_TOOLS
```

**Structure Decision**: Extend existing files — no new files except the contract test.

## Implementation Strategy

1. Add `MOCK_CLUSTERS` constant to `server.ts` (move from frontend `ocp-state.ts` to server-side).
2. Register `check_ocp_prerequisites` tool: checks `process.env.OFFLINE_TOKEN`, returns structured prerequisite status.
3. Register `list_ocp_clusters` tool: returns `MOCK_CLUSTERS` array in structuredContent.
4. Update `ocp-state.ts`: add `isLoading`, `prerequisiteResults` type, remove `MOCK_CLUSTERS` import from frontend state initialization.
5. Update `OcpAdminApp.tsx`: add props for loading state, prerequisite results, and tool call callbacks.
6. Update `ocp-step-content.tsx`: prerequisites step shows pass/fail indicators and re-check button; cluster inventory step shows empty state, load button, loading spinner, and refresh button.
7. Wire tool calls in `mcp-app.ts`: prerequisites auto-check on step enter, cluster load on button click, error handling for both.
8. Add contract test for both tools. Update regression test.

## Phase 0: Research Plan

- Confirm `callTool` is accessible within the OCP admin branch of `mcp-app.ts`: yes, it's defined at the top level of the file and available to both workflow branches. No changes needed.
- Confirm `app.callServerTool` works from the OCP admin render path: yes, `app` is instantiated before the workflow branch. No issues.
- Confirm `setStatus` pattern works in OCP admin branch: need to create a local `setOcpStatus` function since the existing `setStatus` updates `uiState` (engage-specific). OCP admin needs its own status setter updating `ocpUiState`.

## Phase 1: Design & Contracts Plan

- Create `data-model.md` for prerequisite check result and cluster inventory response.
- Create contract: `contracts/ocp-admin-tools.contract.v1.json` — response shapes for both tools.
- Create `quickstart.md` with implementation sequence and verification.
- Run `.specify/scripts/bash/update-agent-context.sh cursor-agent`.

## Post-Design Constitution Re-Check

- Both tools are read-only, no side effects. **PASS**
- Widget uses standard `app.callServerTool()`. **PASS**
- Tools include text fallback content. **PASS**
- OFFLINE_TOKEN value is never exposed — only presence is reported. **PASS**
- All artifacts in active spec package. **PASS**

## Complexity Tracking

No constitution violations identified; complexity justification table is not required.
