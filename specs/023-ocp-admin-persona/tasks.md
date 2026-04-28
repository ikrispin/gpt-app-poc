# Tasks: OCP Admin Persona — Minimal Skill Integration

**Input**: Design documents from `specs/023-ocp-admin-persona/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tasks are included as they follow the project's established testing patterns (contract, integration, regression).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create the OCP admin skill file adapted from the agentic-collections source

- [x] T001 Create `skills/ocp-admin/SKILL.md` combining the persona definition (intent routing table, global rules, MCP server prerequisites) with the cluster-inventory sub-skill documentation (prerequisites, workflow steps, filtering, output formatting, examples), adapted from the `agentic-collections/ocp-admin` CLAUDE.md and `skills/cluster-inventory/SKILL.md` sources

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add OCP admin skill constants and refactor `get_skill` to support multiple URIs

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add OCP admin skill constants in `server.ts` after existing engage skill constants (line ~769): `OCP_ADMIN_SKILL_RESOURCE_URI`, `OCP_ADMIN_SKILL_RESOURCE_SOURCE_PATH`, `OCP_ADMIN_SKILL_RESOURCE_FALLBACK`, and `loadOcpAdminSkillMarkdown()` wrapper — following the exact pattern of the engage skill constants
- [x] T003 Refactor `get_skill` tool in `server.ts` (line ~1086): replace the hardcoded `if (normalizedUri !== ENGAGE_SKILL_RESOURCE_URI)` check with a `SKILL_LOADERS: Record<string, () => Promise<string>>` registry lookup mapping URIs to loader functions; update the unsupported URI error message to list all supported URIs from `Object.keys(SKILL_LOADERS)`
- [x] T004 Register `skill://ocp-admin/SKILL.md` as an MCP resource in `server.ts` (after line ~1493) using `server.registerResource("ocp-admin-skill", OCP_ADMIN_SKILL_RESOURCE_URI, ...)` following the `engage-red-hat-support-skill` registration pattern

**Checkpoint**: The OCP admin skill file exists and the get_skill infrastructure supports multiple URIs. Engage skill behavior is unchanged.

---

## Phase 3: User Story 1 — Discover OCP admin via skill listing (Priority: P1)

**Goal**: `list_skills` returns both engage and OCP admin skill URIs; `get_skill` serves OCP admin content

**Independent Test**: Call `list_skills` and verify both URIs appear. Call `get_skill` with the OCP admin URI and verify markdown content is returned. Call `get_skill` with an unsupported URI and verify both supported URIs are listed in the error.

### Implementation for User Story 1

- [x] T005 [US1] Update `list_skills` tool output in `server.ts` (line ~1055) to include both `ENGAGE_SKILL_RESOURCE_URI` and `OCP_ADMIN_SKILL_RESOURCE_URI` in the response text
- [x] T006 [US1] Add contract test in `tests/contract/ocp-admin-skill-discovery.contract.test.ts` asserting: (1) `list_skills` response contains both skill URIs, (2) `get_skill` with OCP admin URI returns markdown containing "ocp-admin" and "cluster-inventory" with correct structuredContent shape, (3) `get_skill` with unsupported URI returns isError with both supported URIs listed, (4) `get_skill` with engage URI still returns engage content unchanged — per `contracts/ocp-admin-skill-discovery.contract.v1.json`

**Checkpoint**: OCP admin persona is discoverable alongside engage. Engage skill behavior verified unchanged.

---

## Phase 4: User Story 2 — Activate the OCP admin persona (Priority: P1)

**Goal**: `start_ocp_admin` tool returns persona identification, skill URI, available sub-skills, and prerequisite requirements

**Independent Test**: Call `start_ocp_admin` and verify the response includes `persona: "ocp-admin"`, `skill_uri`, `available_skills: ["cluster-inventory"]`, and `prerequisites` with env_vars and mcp_servers.

### Implementation for User Story 2

- [x] T007 [US2] Register `start_ocp_admin` read-only tool in `server.ts` with empty input schema, `readOnlyHint: true`, returning text content (skill URI and prerequisite summary) and structuredContent `{ persona: "ocp-admin", skill_uri, available_skills: ["cluster-inventory"], prerequisites: { env_vars: ["OFFLINE_TOKEN"], mcp_servers: ["openshift-self-managed", "openshift-ocm-managed"] } }`
- [x] T008 [US2] Add integration test in `tests/integration/ocp-admin-start-tool.test.ts` asserting `start_ocp_admin` response matches the contract shape in `contracts/ocp-admin-start-tool.contract.v1.json`: persona identifier, skill URI, available_skills array, prerequisites object with env_vars and mcp_servers

**Checkpoint**: OCP admin persona can be activated with full prerequisite information returned.

---

## Phase 5: User Story 3 — Access cluster-inventory skill content (Priority: P2)

**Goal**: The skill content served via `get_skill` includes cluster-inventory sub-skill documentation with workflow steps, filtering, output formatting, and examples

**Independent Test**: Call `get_skill` with the OCP admin URI and verify the returned markdown contains cluster-inventory workflow sections (prerequisites, filtering capabilities, output formatting, workflow steps, examples).

### Implementation for User Story 3

- [x] T009 [US3] Verify and refine `skills/ocp-admin/SKILL.md` cluster-inventory section to include: prerequisites check instructions (OFFLINE_TOKEN, MCP servers), filtering capabilities (cluster_type, status_filter, name_search), output formatting rules (summary header, single/multi-cluster formats, status icons), 3-step workflow (list → details → diagnostics), and usage examples
- [x] T010 [US3] Add unit test in `tests/unit/ocp-admin-skill-loader.test.ts` asserting: (1) `loadSkillMarkdown` with valid path returns file content, (2) `loadSkillMarkdown` with missing path returns fallback string, (3) returned content contains "cluster-inventory" section

**Checkpoint**: All user stories are independently functional. The OCP admin persona is discoverable, activatable, and serves complete cluster-inventory skill content.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and cleanup

- [x] T011 Extend existing regression test in `tests/regression/mcp-tool-surface-preservation.test.ts` to assert `start_ocp_admin` appears in `tools/list` response alongside all existing tools
- [x] T012 Run full test suite (`npm test`) and verify zero regressions across all existing tests
- [x] T013 Run quickstart.md acceptance checklist verification: build succeeds, all 7 acceptance items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — create skill file first
- **Foundational (Phase 2)**: Depends on Phase 1 (skill file must exist for loader)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (get_skill refactor must be in place)
- **User Story 2 (Phase 4)**: Depends on Phase 2 only (independent of US1)
- **User Story 3 (Phase 5)**: Depends on Phase 1 (skill content) and Phase 2 (get_skill works)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational — no cross-story dependencies
- **User Story 2 (P1)**: Depends on Foundational — no cross-story dependencies
- **User Story 3 (P2)**: Depends on Foundational — no cross-story dependencies

### Within Each Phase

- T002, T003, T004 in Phase 2 must be sequential (T003 depends on T002 constants, T004 depends on T002 constants)
- T005 and T006 in Phase 3: T005 before T006 (implement before test)
- T007 and T008 in Phase 4: T007 before T008 (implement before test)
- T009 and T010 in Phase 5: T009 before T010 (content before test)

### Parallel Opportunities

- **Phase 3 and Phase 4 can run in parallel** after Phase 2 completes (US1 and US2 touch different parts of server.ts)
- **Phase 5 can run in parallel** with Phase 3 and Phase 4 (skill content refinement is independent)

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Create skill file
2. Complete Phase 2: Add constants and refactor get_skill
3. Complete Phase 3: Skill discovery works (list_skills, get_skill)
4. Complete Phase 4: Activation works (start_ocp_admin)
5. **STOP and VALIDATE**: Test discovery and activation end-to-end
6. Deploy/demo if ready

### Full Delivery

1. Complete MVP above
2. Complete Phase 5: Verify cluster-inventory content quality
3. Complete Phase 6: Regression and polish
4. All acceptance criteria met

---

## Notes

- Total tasks: 13
- Tasks per story: US1=2, US2=2, US3=2, Setup=1, Foundational=3, Polish=3
- Parallel opportunities: Phases 3/4/5 can all run after Phase 2
- This is an additive-only change — ~60 lines in server.ts, 1 new SKILL.md, ~4 test files
- No existing files are deleted or renamed
