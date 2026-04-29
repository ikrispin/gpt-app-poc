# Tasks: OCP Admin Interactive UI — Live Tool Calls

**Input**: Design documents from `specs/025-ocp-admin-interactive-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included following project testing patterns.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Phase 1: Setup

**Purpose**: Update state types and move mock data to server side

- [x] T001 Update `src/mcp-app/ocp-admin/ocp-state.ts`: add `isLoading: boolean` to `OcpAdminUiState`, add `PrerequisiteResult` type (`{ name: string, status: string, description: string }`), add `PrerequisiteCheckResult` type (`{ offline_token_set: boolean, mcp_servers: PrerequisiteResult[] }`), add `prerequisiteResults: PrerequisiteCheckResult | null` to `OcpAdminUiState`, remove `MOCK_CLUSTERS` export (will be moved to server)
- [x] T002 Add `MOCK_CLUSTERS` constant to `server.ts` (copy the 5 cluster rows from the current `ocp-state.ts` before removing them) with the same `ClusterRow` shape defined as a server-side type

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Register the two new MCP tools in server.ts

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Register `check_ocp_prerequisites` tool in `server.ts`: read-only, empty input schema, returns `structuredContent: { offline_token_set: boolean, mcp_servers: [{ name: "openshift-self-managed", status: "not_connected", description: "Assisted Installer API for OCP/SNO" }, { name: "openshift-ocm-managed", status: "not_connected", description: "OCM API for ROSA/ARO/OSD" }] }` and text content summarizing the status. Check `process.env.OFFLINE_TOKEN` for presence (truthy check, never expose value). Follow `start_ocp_admin` registration pattern with `_meta.ui.resourceUri: ocpAdminResourceUri`
- [x] T004 Register `list_ocp_clusters` tool in `server.ts`: read-only, empty input schema, returns `structuredContent: { clusters: MOCK_CLUSTERS, total: MOCK_CLUSTERS.length }` and text content with formatted cluster list. Follow same registration pattern with `_meta.ui.resourceUri: ocpAdminResourceUri`

**Checkpoint**: Both tools return correct structured responses. Can be verified via contract test or curl.

---

## Phase 3: User Story 1 — Load cluster inventory on demand (Priority: P1)

**Goal**: Cluster table starts empty, populates on "Load Clusters" click with loading spinner

**Independent Test**: Open cluster inventory step → see empty state → click Load → spinner → table appears with 5 rows

### Implementation for User Story 1

- [x] T005 [US1] Update `ClusterInventoryContent` in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: add `isLoading: boolean` and `onLoadClusters: () => void` props. When `clusters` is empty and not loading, show "No clusters loaded yet" message with a "Load Clusters" `ActionButtonAdapter`. When loading, show a spinner element and disable the button. When clusters are populated, show the existing table plus a "Refresh" `ActionButtonAdapter` that calls `onLoadClusters`
- [x] T006 [US1] Update `OcpAdminApp` in `src/mcp-app/ocp-admin/OcpAdminApp.tsx`: add `isLoading: boolean` and `onLoadClusters: () => void` props, pass them through to `ClusterInventoryContent`
- [x] T007 [US1] Wire `onLoadClusters` in `src/mcp-app.ts` OCP admin branch: create `ocpCallTool` function (mirrors `callTool` but uses `ocpUiState` and `ocpRender`). Create `onLoadClusters` async handler that sets `isLoading=true`, calls `ocpCallTool("list_ocp_clusters", {})`, extracts `structuredContent.clusters` into `ocpUiState.clusters`, sets `isLoading=false`, handles errors. Initialize `ocpUiState.clusters` as empty array `[]` instead of `MOCK_CLUSTERS`. Pass `isLoading` and `onLoadClusters` to `OcpAdminApp` props
- [x] T008 [US1] Add contract test in `tests/contract/ocp-admin-tools.contract.test.ts`: verify (1) `list_ocp_clusters` returns `structuredContent` with `clusters` array of 5 items and `total: 5`, (2) each cluster has `name`, `status`, `type`, `version`, `provider`, `region` fields, (3) text content is present — per `contracts/ocp-admin-tools.contract.v1.json`

**Checkpoint**: Cluster table loads dynamically from tool call. Empty state → Load → Spinner → Table.

---

## Phase 4: User Story 2 — Auto-check prerequisites (Priority: P1)

**Goal**: Prerequisites step auto-checks on load and shows pass/fail indicators

**Independent Test**: Open OCP admin UI → prerequisites step shows check results with indicators automatically

### Implementation for User Story 2

- [x] T009 [US2] Update `PrerequisitesContent` in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: add `prerequisiteResults: PrerequisiteCheckResult | null` and `onCheckPrerequisites: () => void` props. When `prerequisiteResults` is null, show "Checking prerequisites..." text. When results are available, show OFFLINE_TOKEN with a pass/fail indicator based on `offline_token_set`, and each MCP server with its status. Add a "Re-check" `ActionButtonAdapter` that calls `onCheckPrerequisites`
- [x] T010 [US2] Update `OcpAdminApp` in `src/mcp-app/ocp-admin/OcpAdminApp.tsx`: add `prerequisiteResults` and `onCheckPrerequisites` props, pass them through to `PrerequisitesContent`
- [x] T011 [US2] Wire `onCheckPrerequisites` in `src/mcp-app.ts` OCP admin branch: create async handler that calls `ocpCallTool("check_ocp_prerequisites", {})`, extracts `structuredContent` into `ocpUiState.prerequisiteResults`, handles errors. Call `onCheckPrerequisites()` immediately after `ocpRender()` at initialization (auto-check on load). Pass `prerequisiteResults` and `onCheckPrerequisites` to `OcpAdminApp` props
- [x] T012 [US2] Add to existing contract test in `tests/contract/ocp-admin-tools.contract.test.ts`: verify `check_ocp_prerequisites` returns `structuredContent` with `offline_token_set` (boolean) and `mcp_servers` (array with name, status, description), and text content is present

**Checkpoint**: Prerequisites step auto-checks and shows indicators. Re-check button works.

---

## Phase 5: User Story 3 — Error handling (Priority: P2)

**Goal**: Tool call failures show clear messages and allow retry

**Independent Test**: When a tool call would fail, the UI shows an error and allows retry without hanging.

### Implementation for User Story 3

- [x] T013 [US3] Update `ocpCallTool` error handling in `src/mcp-app.ts`: on tool call failure, set `ocpUiState.statusMessage` with error text, set `statusVariant` to `"danger"`, ensure `isLoading` is set to `false`, call `ocpRender()`. On success, set status to brief success message with `"success"` variant
- [x] T014 [US3] Update `ClusterInventoryContent` in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: when `clusters` is empty and not loading and there's an error status, show the error message with a "Try Again" button that calls `onLoadClusters`

**Checkpoint**: Errors display clearly and the UI never hangs in loading state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and cleanup

- [x] T015 Update `tests/regression/mcp-tool-surface-preservation.test.ts`: add `"check_ocp_prerequisites"` and `"list_ocp_clusters"` to `REQUIRED_TOOLS` array
- [x] T016 Build widget bundle (`npm run build`) and verify it succeeds
- [x] T017 Run full test suite (`npm run test:jira`) and verify zero regressions
- [x] T018 Run quickstart.md acceptance checklist verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — update types first
- **Foundational (Phase 2)**: Depends on Phase 1 (server needs ClusterRow type)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (`list_ocp_clusters` tool must exist)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (`check_ocp_prerequisites` tool must exist)
- **User Story 3 (Phase 5)**: Depends on Phase 3 (error handling builds on `ocpCallTool`)
- **Polish (Phase 6)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational — independent of US2
- **US2 (P1)**: Depends on Foundational — independent of US1
- **US3 (P2)**: Depends on US1 (`ocpCallTool` and loading state must exist)

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 2**: T003 and T004 can run in parallel (independent tools in same file, different sections)
- **Phase 3 and Phase 4**: Can run in parallel after Phase 2

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Update types, move mock data
2. Phase 2: Register both tools
3. Phase 3: Wire cluster loading in UI
4. **STOP and VALIDATE**: Click "Load Clusters" → data appears

### Full Delivery

1. MVP above
2. Phase 4: Prerequisites auto-check
3. Phase 5: Error handling
4. Phase 6: Polish and regression
5. All acceptance criteria met

---

## Notes

- Total tasks: 18
- Tasks per story: US1=4, US2=4, US3=2, Setup=2, Foundational=2, Polish=4
- Parallel opportunities: Phase 1 tasks, Phase 2 tasks, Phase 3 and 4 after Phase 2
- Key change: MOCK_CLUSTERS moves from frontend to server — clusters now flow through tool calls
- `ocpCallTool` is the OCP-admin-specific wrapper for `app.callServerTool()`, parallel to the engage `callTool`
