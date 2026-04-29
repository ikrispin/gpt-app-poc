# Tasks: OCP Admin UI — Cluster Inventory View

**Input**: Design documents from `specs/024-ocp-admin-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included as they follow the project's established testing patterns.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create OCP admin component directory and state types

- [x] T001 [P] Create `src/mcp-app/ocp-admin/ocp-state.ts` with types: `OcpAdminStep` (`"prerequisites" | "cluster_inventory"`), `OcpAdminWorkflowState` (current_step field), `OcpAdminUiState` (statusMessage, statusVariant, clusters fields), `ClusterRow` (name, id, status, type, version, provider, region), and `MOCK_CLUSTERS` constant with 5 sample rows from data-model.md
- [x] T002 [P] Create `src/mcp-app/ocp-admin/ocp-step-content.tsx` with placeholder components: `PrerequisitesContent` and `ClusterInventoryContent` that render minimal placeholder text (will be filled in US2 and US3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side workflow routing — refactor HTML loader, register OCP admin UI resources, update start_ocp_admin tool

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Refactor `loadEngageWidgetHtml()` in `server.ts` into `loadWidgetHtml(workflowId: string)` that injects `<meta name="gpt-app-workflow" content="${workflowId}">` alongside existing `gpt-app-api-base` and `gpt-app-build-id` meta tags. Create wrapper functions: `loadEngageWidgetHtml()` calling `loadWidgetHtml("engage")` and `loadOcpAdminWidgetHtml()` calling `loadWidgetHtml("ocp-admin")`
- [x] T004 Add OCP admin UI resource URI constants in `server.ts`: `ocpAdminResourceUri` (`ui://ocp-admin/app.html`), and register it using `registerAppResource` with `loadOcpAdminWidgetHtml`, following the existing `registerEngageUiResource` pattern
- [x] T005 Update `start_ocp_admin` tool registration in `server.ts`: change `_meta.ui.resourceUri` from `engageResourceUri` to `ocpAdminResourceUri`, and update `"openai/outputTemplate"` to `ocpAdminResourceUri`

**Checkpoint**: OCP admin UI resource is registered and served with workflow meta tag. Engage resources still serve with engage workflow meta tag.

---

## Phase 3: User Story 1 — Workflow-based UI routing (Priority: P1)

**Goal**: When OCP admin persona is activated, the UI renders a distinct OCP admin interface instead of the engage workflow

**Independent Test**: Activate OCP admin → see OCP admin UI with its own title. Activate engage → see existing 4-step engage UI unchanged.

### Implementation for User Story 1

- [x] T006 [US1] Add workflow detection in `src/mcp-app.ts`: at boot, read `document.querySelector('meta[name="gpt-app-workflow"]')?.getAttribute("content")`. If value is `"ocp-admin"`, initialize OCP admin state (`OcpAdminWorkflowState`, `OcpAdminUiState` with `MOCK_CLUSTERS`) and render `OcpAdminApp` via `createElement`. Default to existing engage render path for any other value or missing meta tag
- [x] T007 [US1] Create `src/mcp-app/ocp-admin/OcpAdminApp.tsx` component: a 2-step wizard with inline step navigation (two buttons: "Prerequisites" and "Cluster Inventory"), a content panel rendering the current step's component, and a `StatusDisplayAdapter` for status messages. Accept props: `currentStep`, `uiState`, `onNavigatePrerequisites`, `onNavigateInventory`. Reuse `ActionButtonAdapter` and `StatusDisplayAdapter` from `src/mcp-app/ui/`
- [x] T008 [US1] Add OCP admin hash routing in `src/mcp-app.ts`: map `#step-1` to `"prerequisites"` and `#step-2` to `"cluster_inventory"`. Add `setOcpAdminStep()` and `navigateOcpAdminStep()` functions following the existing `setCurrentStep`/`navigateToStep` pattern. Wire `onNavigatePrerequisites` and `onNavigateInventory` callbacks to these functions
- [x] T009 [US1] Add contract test in `tests/contract/ocp-admin-ui-resource.contract.test.ts`: verify (1) `ui://ocp-admin/app.html` appears in `resources/list`, (2) reading it returns HTML with `gpt-app-workflow` meta tag containing `ocp-admin`, (3) `ui://engage-red-hat-support/app.html` still contains `gpt-app-workflow` meta tag with `engage`, (4) `start_ocp_admin` tool's `_meta.ui.resourceUri` contains `ocp-admin` — per `contracts/ocp-admin-ui-resource.contract.v1.json`

**Checkpoint**: OCP admin UI renders with its own title and 2-step nav. Engage UI unchanged.

---

## Phase 4: User Story 2 — Prerequisites step (Priority: P1)

**Goal**: First step of OCP admin UI shows persona description, required env vars, MCP servers, and available skills

**Independent Test**: Open OCP admin UI, view step 1, verify prerequisites info is displayed.

### Implementation for User Story 2

- [x] T010 [US2] Implement `PrerequisitesContent` component in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: render persona description ("OpenShift cluster administration assistant"), environment variables section listing `OFFLINE_TOKEN` with purpose, MCP servers section listing `openshift-self-managed` and `openshift-ocm-managed` with descriptions, available skills section listing `cluster-inventory` with status. Include a "Continue to Cluster Inventory" button using `ActionButtonAdapter` that calls `onContinue` callback
- [x] T011 [US2] Wire `PrerequisitesContent` into the OCP admin render path in `src/mcp-app.ts`: pass `onContinue` callback that navigates to `"cluster_inventory"` step

**Checkpoint**: Prerequisites step displays all required information with navigation to step 2.

---

## Phase 5: User Story 3 — Cluster inventory table (Priority: P2)

**Goal**: Second step shows summary header and table with 5 mock clusters

**Independent Test**: Navigate to step 2, verify summary header shows cluster counts and table displays 5 rows with correct columns.

### Implementation for User Story 3

- [x] T012 [US3] Implement `ClusterInventoryContent` component in `src/mcp-app/ocp-admin/ocp-step-content.tsx`: render summary header ("Found 5 cluster(s): 3 ready, 1 installing, 1 pending") computed from the clusters array, and an HTML table with columns Name, Status, Type, Version, Provider, Region. Use `rhds-*` CSS classes for styling consistency. Accept `clusters: ClusterRow[]` prop
- [x] T013 [US3] Wire `ClusterInventoryContent` into the OCP admin render path in `src/mcp-app.ts`: pass `uiState.clusters` (initialized from `MOCK_CLUSTERS`) as the `clusters` prop

**Checkpoint**: Cluster inventory displays summary header and 5-row table with correct data.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and cleanup

- [x] T014 Extend `tests/regression/mcp-tool-surface-preservation.test.ts`: add `ui://ocp-admin/app.html` to `REQUIRED_RESOURCES` array
- [x] T015 Build the widget bundle (`npm run build`) and verify it succeeds with both workflows included
- [x] T016 Run full test suite (`npm run test:jira`) and verify zero regressions
- [x] T017 Run quickstart.md acceptance checklist verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — create types and placeholder components first
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist for imports)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (UI resources must be registered, HTML loader refactored)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (OcpAdminApp and routing must exist)
- **User Story 3 (Phase 5)**: Depends on Phase 3 (OcpAdminApp and routing must exist)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational — no cross-story dependencies
- **User Story 2 (P1)**: Depends on US1 (needs OcpAdminApp component and routing)
- **User Story 3 (P2)**: Depends on US1 (needs OcpAdminApp component and routing). Independent of US2.

### Within Each Phase

- T001 and T002 in Phase 1 can run in parallel (different files)
- T003 must complete before T004 (T004 uses the refactored loader)
- T004 must complete before T005 (T005 uses the new URI constant)
- T006, T007, T008 in Phase 3 are sequential (T007 creates the component T006 renders, T008 adds routing T006 needs)
- T010 and T011 in Phase 4 are sequential (T010 creates component, T011 wires it)
- T012 and T013 in Phase 5 are sequential (T012 creates component, T013 wires it)

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 4 and Phase 5**: Can run in parallel after Phase 3 (US2 and US3 touch the same files but different sections)

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1: Types and placeholders
2. Complete Phase 2: Server-side routing
3. Complete Phase 3: Frontend routing + OcpAdminApp
4. **STOP and VALIDATE**: OCP admin UI appears with placeholder content, engage UI unchanged
5. Deploy/demo if ready

### Full Delivery

1. Complete MVP above
2. Complete Phase 4: Prerequisites content
3. Complete Phase 5: Cluster inventory table
4. Complete Phase 6: Regression and polish
5. All acceptance criteria met

---

## Notes

- Total tasks: 17
- Tasks per story: US1=4, US2=2, US3=2, Setup=2, Foundational=3, Polish=4
- Parallel opportunities: Phase 1 tasks, Phase 4 and 5 after Phase 3
- Key files modified: `server.ts`, `src/mcp-app.ts`
- Key files created: `src/mcp-app/ocp-admin/ocp-state.ts`, `src/mcp-app/ocp-admin/ocp-step-content.tsx`, `src/mcp-app/ocp-admin/OcpAdminApp.tsx`, `tests/contract/ocp-admin-ui-resource.contract.test.ts`
- No existing engage files are modified (except `mcp-app.ts` which gets an if/else at boot)
