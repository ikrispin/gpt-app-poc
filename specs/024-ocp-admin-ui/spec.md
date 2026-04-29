# Feature Specification: OCP Admin UI — Cluster Inventory View

**Feature Branch**: `024-ocp-admin-ui`  
**Created**: 2026-04-28  
**Status**: Draft  
**Input**: User description: "Add a visual UI for the OCP admin persona, starting with a cluster inventory table view using mock data. Enable workflow-based routing so the app can render different UIs for different personas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View the OCP admin UI when activating the persona (Priority: P1)

As an LLM client user, when I activate the OCP admin persona, I see a dedicated visual interface (separate from the existing support workflow) so I can interact with OpenShift administration tasks visually.

**Why this priority**: Without workflow-based UI routing, the OCP admin persona has no visual presence — it would show the support engineer's interface instead. This is the foundational change that enables any OCP admin UI to exist.

**Independent Test**: Activate the OCP admin persona and verify that a distinct UI appears with OCP admin branding and content, not the support engineer workflow steps.

**Acceptance Scenarios**:

1. **Given** the OCP admin persona is activated, **When** the UI loads, **Then** it displays a dedicated OCP admin interface with its own title and step navigation, distinct from the support engineer workflow.
2. **Given** the support engineer persona is activated, **When** the UI loads, **Then** it continues to display the existing 4-step support workflow unchanged.
3. **Given** neither persona is explicitly activated, **When** the UI loads, **Then** it defaults to the existing support engineer workflow for backward compatibility.

---

### User Story 2 — Review prerequisites before accessing cluster data (Priority: P1)

As an LLM client user, I can see a prerequisites overview as the first step of the OCP admin UI so I know what environment setup is required before attempting to list clusters.

**Why this priority**: Without prerequisites visibility, users would attempt cluster operations and get confusing errors. Showing prerequisites first guides users to set up their environment correctly.

**Independent Test**: Open the OCP admin UI and verify the first step displays the persona description, required environment variables, required external services, and available sub-skills.

**Acceptance Scenarios**:

1. **Given** the OCP admin UI is displayed, **When** the user views the first step, **Then** they see the persona description, a list of required environment variables with their purpose, a list of required external services, and available sub-skills.
2. **Given** the prerequisites step is displayed, **When** the user clicks "Continue", **Then** the UI navigates to the cluster inventory step.

---

### User Story 3 — View cluster inventory in a table (Priority: P2)

As an LLM client user, I can see a table of OpenShift clusters with their key attributes so I can quickly assess the state of my cluster fleet at a glance.

**Why this priority**: The cluster inventory table is the primary data visualization for the OCP admin persona. It demonstrates that the UI can display structured cluster data in the format defined by the cluster-inventory skill.

**Independent Test**: Navigate to the cluster inventory step and verify a table with cluster data is displayed, including a summary header with cluster counts and a table with columns for name, status, type, version, provider, and region.

**Acceptance Scenarios**:

1. **Given** the user is on the cluster inventory step, **When** the step loads, **Then** a summary header shows the total cluster count and status breakdown (e.g., "Found 5 cluster(s): 3 ready, 1 installing, 1 pending").
2. **Given** the cluster inventory step is displayed, **When** the user views the table, **Then** each cluster row shows name, status, type (OCP/ROSA/ARO/OSD/SNO), version, provider, and region.
3. **Given** the cluster inventory step is displayed, **When** the user views the table, **Then** clusters are sorted by type then by creation date (newest first), matching the skill specification.

---

### Edge Cases

- If the UI bundle file is missing or fails to load, the system returns a text-based fallback with instructions for completing the workflow without a visual interface.
- If the workflow type indicator is missing from the loaded UI, the system defaults to the existing support engineer workflow to maintain backward compatibility.
- Step navigation between prerequisites and cluster inventory respects the same hash-based URL pattern used by the existing workflow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST serve a distinct UI when the OCP admin persona is activated, separate from the existing support engineer workflow UI.
- **FR-002**: The system MUST identify which workflow to display based on metadata embedded in the served UI content at load time.
- **FR-003**: The system MUST default to the existing support engineer workflow when no workflow identifier is present, ensuring backward compatibility.
- **FR-004**: The OCP admin UI MUST display a prerequisites step showing: persona description, required environment variables (OFFLINE_TOKEN), required external services (openshift-self-managed, openshift-ocm-managed), and available sub-skills (cluster-inventory).
- **FR-005**: The OCP admin UI MUST display a cluster inventory step with a summary header and a data table showing columns: Name, Status, Type, Version, Provider, Region.
- **FR-006**: The cluster inventory table MUST display representative sample data matching the format defined in the cluster-inventory skill specification (5 clusters across OCP, ROSA, ARO, OSD, and SNO types).
- **FR-007**: The OCP admin UI MUST provide step navigation between prerequisites and cluster inventory using the same URL hash pattern as the existing workflow.
- **FR-008**: The OCP admin activation operation MUST reference the OCP admin UI resource instead of the support engineer UI resource so that the correct interface loads.
- **FR-009**: The existing support engineer UI MUST remain fully functional and visually unchanged after adding the OCP admin UI.
- **FR-010**: The system MUST produce a single bundled UI output that contains both workflow UIs, with no changes to the existing build process.

### Key Entities

- **Workflow Identifier**: A label embedded in the served UI content that determines which workflow the frontend renders (e.g., "engage" or "ocp-admin").
- **Cluster Row**: A data record representing one OpenShift cluster with attributes: name, ID, status, type, version, provider, region.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Activating the OCP admin persona displays the OCP admin UI, not the support engineer UI — verified by the presence of OCP-specific content (prerequisites, cluster table) and absence of support-specific content (product selection, sosreport).
- **SC-002**: Activating the support engineer persona continues to display the support engineer UI identically to before — zero visual or behavioral regression.
- **SC-003**: The cluster inventory table renders 5 cluster rows with correct columns and data, matching the skill specification's example output format.
- **SC-004**: Step navigation works in both directions — users can move between prerequisites and cluster inventory and back.
- **SC-005**: The built UI bundle remains a single file containing both workflows, with no changes required to the build configuration.

## Dependencies & Assumptions

### Dependencies

- Spec 023 (OCP admin persona — text-only skill integration) is complete and committed.
- The existing UI build pipeline (single HTML bundle via Vite) is functional.
- The existing support engineer workflow UI and step navigation are stable.

### Assumptions

- The cluster inventory table uses representative sample data for this phase. Real cluster data from external services is a follow-up feature.
- The OCP admin UI reuses the existing visual styling (Red Hat Design System CSS classes) for consistency.
- Two steps are sufficient for the initial OCP admin UI (prerequisites + cluster inventory). Additional steps are future work.

## Scope

### Out of Scope

- Real cluster data from external MCP servers (openshift-self-managed, openshift-ocm-managed)
- Cluster detail view (clicking a row to see full cluster info)
- Cluster filtering or search UI controls
- Any write operations (cluster creation, modification, deletion)
- Separate build output or build configuration changes
- Changes to the existing support engineer UI components
