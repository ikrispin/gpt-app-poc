# Feature Specification: OCP Admin Interactive UI — Live Tool Calls

**Feature Branch**: `025-ocp-admin-interactive-ui`  
**Created**: 2026-04-29  
**Status**: Draft  
**Input**: User description: "Make the OCP admin UI interactive by wiring it to MCP tool calls. Prerequisites step should auto-check environment readiness. Cluster inventory step should load data dynamically via a tool call with loading state, instead of showing static mock data."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Load cluster inventory on demand (Priority: P1)

As an LLM client user, I can click a button to load cluster data into the inventory table so I see the data appear dynamically with a loading indicator, rather than seeing static pre-loaded data.

**Why this priority**: This is the core interactive behavior that turns the UI from a static page into a working tool. It demonstrates the full widget-to-server round-trip that makes the demo compelling.

**Independent Test**: Open the OCP admin UI cluster inventory step. Verify the table is initially empty. Click "Load Clusters". Verify a loading indicator appears, then the table populates with cluster data.

**Acceptance Scenarios**:

1. **Given** the cluster inventory step is displayed, **When** the step first loads, **Then** the table area shows an empty state message instead of pre-populated data.
2. **Given** the cluster inventory step shows the empty state, **When** the user clicks "Load Clusters", **Then** a loading indicator appears and the button becomes disabled.
3. **Given** a cluster load is in progress, **When** the server responds with cluster data, **Then** the loading indicator disappears, the summary header updates with cluster counts, and the table populates with cluster rows.
4. **Given** the cluster table is populated, **When** the user clicks "Refresh", **Then** the data reloads with a loading indicator and the table updates with the latest response.

---

### User Story 2 — Check prerequisites automatically (Priority: P1)

As an LLM client user, when I open the prerequisites step, the system automatically checks whether my environment is ready (required credentials and services) and shows the results with clear pass/fail indicators.

**Why this priority**: Prerequisite checking is essential for guiding users to set up their environment correctly. Without it, users would attempt to load clusters and get confusing errors.

**Independent Test**: Open the OCP admin UI prerequisites step. Verify that environment checks run automatically and each prerequisite shows a pass or fail indicator.

**Acceptance Scenarios**:

1. **Given** the OCP admin UI is opened, **When** the prerequisites step loads, **Then** the system automatically checks environment readiness and displays results within 2 seconds.
2. **Given** the prerequisites check has completed, **When** the user views the results, **Then** each prerequisite (credentials, services) shows a clear pass or fail indicator.
3. **Given** the prerequisites check has completed, **When** the user clicks "Re-check", **Then** the checks run again and the indicators update.

---

### User Story 3 — Handle loading errors gracefully (Priority: P2)

As an LLM client user, if a tool call fails when loading clusters or checking prerequisites, I see a clear error message explaining what went wrong so I can take corrective action.

**Why this priority**: Error handling is essential for a demo — if something fails, the UI should communicate clearly rather than showing a blank table or hanging spinner.

**Independent Test**: Trigger an error condition during cluster loading. Verify the loading indicator clears, an error message is displayed, and the user can retry.

**Acceptance Scenarios**:

1. **Given** a cluster load is in progress, **When** the server returns an error, **Then** the loading indicator clears, an error message is displayed, and the "Load Clusters" button is re-enabled for retry.
2. **Given** a prerequisite check fails to complete, **When** the error occurs, **Then** the prerequisites display shows a warning message and the user can click "Re-check" to try again.

---

### Edge Cases

- If the cluster load returns zero clusters, the table shows an informative "No clusters found" message instead of an empty table.
- If the prerequisites check completes while the user has already navigated to the cluster inventory step, the results are available when they return to prerequisites.
- If multiple rapid clicks on "Load Clusters" or "Refresh" occur, only one request is processed at a time (the button is disabled during loading).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an operation to check environment prerequisites that returns the status of required credentials and services.
- **FR-002**: The system MUST provide an operation to retrieve cluster inventory data that returns a list of clusters with their attributes.
- **FR-003**: The prerequisites step MUST automatically invoke the prerequisite check operation when it loads, without requiring user action.
- **FR-004**: The prerequisites step MUST display pass/fail indicators for each checked prerequisite.
- **FR-005**: The prerequisites step MUST provide a "Re-check" button that re-runs the prerequisite check.
- **FR-006**: The cluster inventory step MUST start with an empty state and a "Load Clusters" button, not pre-populated data.
- **FR-007**: The cluster inventory step MUST show a loading indicator and disable the load button while a cluster load is in progress.
- **FR-008**: The cluster inventory step MUST populate the summary header and table from the tool response data after a successful load.
- **FR-009**: The cluster inventory step MUST provide a "Refresh" button after initial load to re-fetch cluster data.
- **FR-010**: Both operations MUST be read-only with no side effects.
- **FR-011**: If a tool call fails, the UI MUST display an error message, clear the loading state, and allow the user to retry.
- **FR-012**: The existing support engineer workflow MUST remain fully functional and unchanged.

### Key Entities

- **Prerequisite Check Result**: Status of each prerequisite (credential name, set/not-set, service name, available/unavailable).
- **Cluster Inventory Response**: A list of cluster records with attributes (name, ID, status, type, version, provider, region) and a total count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking "Load Clusters" triggers a server operation and populates the table within 2 seconds — the full widget-to-server round-trip is visible.
- **SC-002**: The prerequisites check runs automatically on step load and displays results with pass/fail indicators within 2 seconds.
- **SC-003**: Error scenarios display a clear message and allow retry — the UI never hangs in a loading state permanently.
- **SC-004**: Zero regression — the existing support engineer workflow operates identically before and after the change.
- **SC-005**: The cluster inventory starts empty and only populates after explicit user action (no static pre-loaded data).

## Dependencies & Assumptions

### Dependencies

- Spec 024 (OCP admin UI with mock data and workflow routing) is complete and committed.
- The existing `callTool` pattern in the widget communicates with the MCP server correctly.

### Assumptions

- The cluster data returned by the new operations uses the same mock data as spec 024, but served through a tool call rather than hardcoded in the frontend. Real external MCP server integration is a follow-up feature.
- The prerequisite check reports on OFFLINE_TOKEN presence and expected MCP server names. Actual MCP server connectivity checks are a follow-up feature.

## Scope

### Out of Scope

- Real connectivity to external MCP servers (openshift-self-managed, openshift-ocm-managed)
- Cluster detail view (clicking a row)
- Filtering or search controls in the cluster table
- Any write operations (cluster creation, modification, deletion)
- Changes to the existing support engineer UI
