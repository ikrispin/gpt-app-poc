# Tasks: OCP Admin — Real MCP Server Integration

**Input**: Design documents from `specs/026-ocp-mcp-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included following project testing patterns.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)

## Phase 1: Setup

**Purpose**: Create the MCP client module with connection management

- [ ] T001 Create `src/mcp-client/ocp-mcp-client.ts` with: server config constants (image `quay.io/ecosystem-appeng/assisted-service-mcp:ocm`, inventory URLs for self-managed and ocm-managed, SSO/pull-secret URLs), `OcpClusterRow` type, `ClusterListResult` type (`{ ok, clusters, dataSource, errors }`), `ConnectivityResult` type, `isPodmanAvailable()` function (uses `child_process.execSync("which podman")` with try/catch, cached result), and an in-memory connection cache `Map<string, { client, transport, status }>`
- [ ] T002 Add `ensureConnection(serverName)` to `src/mcp-client/ocp-mcp-client.ts`: creates `StdioClientTransport` with podman args from config, creates `Client` from `@modelcontextprotocol/sdk/client/index.js`, calls `client.connect(transport)`, caches the connection. On error, returns `{ ok: false, error }`. On success, caches and returns `{ ok: true, client }`
- [ ] T003 Add `listClusters()` to `src/mcp-client/ocp-mcp-client.ts`: calls `ensureConnection` for both servers, calls `client.callTool({ name: "list_clusters", arguments: {} })` on each in parallel with `Promise.allSettled`, parses response content text to extract cluster data, maps to `OcpClusterRow[]`, merges results from both servers. Returns `ClusterListResult` with `dataSource: "live"` on full success, `"partial"` if one server failed, includes error messages for failed servers
- [ ] T004 Add `checkConnectivity()` to `src/mcp-client/ocp-mcp-client.ts`: checks `isPodmanAvailable()`, checks `OFFLINE_TOKEN` presence, attempts `ensureConnection` for each server, returns `ConnectivityResult` with per-server status

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the MCP client into server.ts tool handlers

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Update `list_ocp_clusters` tool handler in `server.ts`: import `listClusters` from `src/mcp-client/ocp-mcp-client.ts`. Try `listClusters()` first — if `result.ok`, return `structuredContent: { clusters: result.clusters, total: result.clusters.length, dataSource: result.dataSource }`. If failed, return `OCP_MOCK_CLUSTERS` with `dataSource: "mock"` and include error info in text content
- [ ] T006 Update `check_ocp_prerequisites` tool handler in `server.ts`: import `checkConnectivity` and `isPodmanAvailable` from `src/mcp-client/ocp-mcp-client.ts`. Add `podman_available: boolean` to structured response. Replace hardcoded `"not_connected"` status with actual connectivity results from `checkConnectivity()`. Keep OFFLINE_TOKEN presence check (existing)

**Checkpoint**: Tools return live data when infra available, mock data when not. Verify via contract test or curl.

---

## Phase 3: User Story 1 — View real cluster data (Priority: P1)

**Goal**: With prerequisites met, `list_ocp_clusters` returns real cluster data with `dataSource: "live"`

**Independent Test**: Start server with OFFLINE_TOKEN + podman. Call `list_ocp_clusters`. Verify response has real clusters (not the 5 hardcoded mocks) and `dataSource: "live"`.

### Implementation for User Story 1

- [ ] T007 [US1] Implement cluster data parsing in `src/mcp-client/ocp-mcp-client.ts`: the `list_clusters` tool on external servers returns text content with cluster data. Parse the response `content[0].text` to extract cluster fields (name, id, status, type, version, provider, region). Handle both self-managed clusters (OCP/SNO — detect from platform field) and OCM-managed clusters (ROSA/ARO/OSD — detect from cloud_provider). Add `source` field to track which server returned each cluster
- [ ] T008 [US1] Update contract test in `tests/contract/ocp-admin-tools.contract.test.ts`: add assertion that `list_ocp_clusters` response includes `structuredContent.dataSource` field with value `"live"` or `"mock"`. Verify the field exists regardless of environment (in test environment without podman, it should be `"mock"`)

**Checkpoint**: Real clusters appear when infra is available.

---

## Phase 4: User Story 2 — Graceful mock fallback (Priority: P1)

**Goal**: Without prerequisites, `list_ocp_clusters` returns mock data with `dataSource: "mock"`

**Independent Test**: Start server without podman/OFFLINE_TOKEN. Call `list_ocp_clusters`. Verify response has the 5 mock clusters and `dataSource: "mock"`.

### Implementation for User Story 2

- [ ] T009 [US2] Add `dataSource: "live" | "mock" | null` to `OcpAdminUiState` in `src/mcp-app/ocp-admin/ocp-state.ts`
- [ ] T010 [US2] Update `ClusterInventoryContent` in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: add `dataSource: "live" | "mock" | null` prop. When clusters are populated, show a small badge below the summary header: green "Live data" or yellow "Mock data (demo)" based on `dataSource`
- [ ] T011 [US2] Update `OcpAdminApp` in `src/mcp-app/ocp-admin/OcpAdminApp.tsx`: add `dataSource` prop, pass through to `ClusterInventoryContent`
- [ ] T012 [US2] Wire `dataSource` in `src/mcp-app.ts` OCP admin branch: extract `structuredContent.dataSource` from `list_ocp_clusters` response into `ocpUiState.dataSource`, pass to `OcpAdminApp` props

**Checkpoint**: UI shows "Live data" or "Mock data" badge. Mock fallback works without infra.

---

## Phase 5: User Story 3 — Accurate prerequisites status (Priority: P2)

**Goal**: Prerequisites check reports real podman availability and server connectivity

**Independent Test**: Call `check_ocp_prerequisites`. Verify `podman_available` matches actual system state. Verify server status reflects real connectivity.

### Implementation for User Story 3

- [ ] T013 [US3] Update `PrerequisitesContent` in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: add podman availability indicator (pass/fail) alongside existing OFFLINE_TOKEN and MCP server indicators. Update the `PrerequisiteCheckResult` import to include `podman_available` field
- [ ] T014 [US3] Update `PrerequisiteCheckResult` type in `src/mcp-app/ocp-admin/ocp-state.ts`: add `podman_available: boolean` field
- [ ] T015 [US3] Update contract test in `tests/contract/ocp-admin-tools.contract.test.ts`: add assertion that `check_ocp_prerequisites` response includes `structuredContent.podman_available` as boolean

**Checkpoint**: Prerequisites step shows real podman and connectivity status.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and cleanup

- [ ] T016 Build widget bundle (`npm run build`) and verify it succeeds
- [ ] T017 Run full test suite (`npm run test:jira`) and verify zero regressions
- [ ] T018 Run quickstart.md acceptance checklist verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — create client module first
- **Foundational (Phase 2)**: Depends on Phase 1 (client module must exist)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (tool handlers must use client)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (dataSource field must exist in responses)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (connectivity check must be wired)
- **Polish (Phase 6)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational — no cross-story dependencies
- **US2 (P1)**: Depends on Foundational — independent of US1
- **US3 (P2)**: Depends on Foundational — independent of US1/US2

### Parallel Opportunities

- **Phase 1**: T001-T004 are sequential (each builds on the previous)
- **Phase 3, 4, 5**: Can run in parallel after Phase 2
- **T009, T010, T011, T012**: Sequential within US2 (state → component → app → wiring)

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Create MCP client module
2. Phase 2: Wire into server.ts
3. Phase 3: Parse real cluster data
4. **STOP and VALIDATE**: With podman + OFFLINE_TOKEN, see real clusters

### Full Delivery

1. MVP above
2. Phase 4: Mock fallback + UI indicator
3. Phase 5: Accurate prerequisites
4. Phase 6: Polish
5. All acceptance criteria met

---

## Notes

- Total tasks: 18
- Tasks per story: US1=2, US2=4, US3=3, Setup=4, Foundational=2, Polish=3
- Key new file: `src/mcp-client/ocp-mcp-client.ts` (~150 lines)
- Graceful degradation: mock data is always the fallback — no breaking change
- The external servers' `list_clusters` response format needs to be discovered at implementation time (T007) since we only have SKILL.md documentation, not the actual response schema
