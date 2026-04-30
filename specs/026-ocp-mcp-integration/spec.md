# Feature Specification: OCP Admin — Real MCP Server Integration

**Feature Branch**: `026-ocp-mcp-integration`  
**Created**: 2026-04-30  
**Status**: Draft  
**Input**: User description: "Connect the OCP admin cluster inventory to real external MCP servers (openshift-self-managed, openshift-ocm-managed) so the UI shows actual cluster data from Red Hat APIs instead of mock data. Fall back to mock data gracefully when servers are unavailable."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View real cluster data from Red Hat APIs (Priority: P1)

As an LLM client user with the required credentials and infrastructure configured, I can load the cluster inventory and see my actual OpenShift clusters from Red Hat's Assisted Installer and OCM APIs, so I can manage my real cluster fleet through the OCP admin interface.

**Why this priority**: This is the core value of the integration — moving from demo mock data to real production data. Everything else (prerequisites, fallback) supports this.

**Independent Test**: Start the server with OFFLINE_TOKEN set and container infrastructure available. Call the cluster listing operation. Verify the response contains real cluster data from both self-managed and managed deployment APIs, not the hardcoded 5 mock clusters.

**Acceptance Scenarios**:

1. **Given** the required credentials are set and container infrastructure is available, **When** the cluster listing operation is invoked, **Then** the response contains real cluster data fetched from both the self-managed and managed deployment APIs.
2. **Given** real cluster data is returned, **When** the response is processed, **Then** each cluster record includes name, ID, status, type, version, provider, and region — matching the same format as the previous mock data.
3. **Given** real cluster data is returned, **When** the UI displays the results, **Then** the response indicates the data source is "live" so the user knows they are viewing real data.

---

### User Story 2 — Fall back to mock data when servers are unavailable (Priority: P1)

As an LLM client user without the required infrastructure configured, I can still use the OCP admin UI with mock data so the interface remains functional for demonstration and development purposes.

**Why this priority**: Graceful degradation ensures the app works in all environments — development, demos, and production. Without it, missing infrastructure would break the entire OCP admin experience.

**Independent Test**: Start the server without container infrastructure available. Call the cluster listing operation. Verify the response contains mock data with a clear indicator that the data source is "mock".

**Acceptance Scenarios**:

1. **Given** container infrastructure is not available, **When** the cluster listing operation is invoked, **Then** the response contains the standard mock cluster data and indicates the data source is "mock".
2. **Given** credentials are not set, **When** the cluster listing operation is invoked, **Then** the response falls back to mock data with a message indicating what is missing.
3. **Given** one external service is available but the other is not, **When** the cluster listing operation is invoked, **Then** the response includes real data from the available service and indicates partial connectivity.

---

### User Story 3 — See accurate prerequisites status (Priority: P2)

As an LLM client user, I can see the actual status of my environment prerequisites (credentials, container runtime, external services) so I know exactly what needs to be configured before I can view real cluster data.

**Why this priority**: Accurate prerequisite reporting helps users diagnose configuration issues without guessing.

**Independent Test**: Call the prerequisites check operation. Verify it reports the real status of each prerequisite (credential presence, container runtime availability, external service connectivity) rather than hardcoded values.

**Acceptance Scenarios**:

1. **Given** the prerequisites check is invoked, **When** the container runtime is installed, **Then** the result reports it as available.
2. **Given** the prerequisites check is invoked, **When** the container runtime is not installed, **Then** the result reports it as unavailable with guidance on how to install it.
3. **Given** the prerequisites check is invoked, **When** the credentials are set and the external services are reachable, **Then** the result reports both services as "connected".

---

### Edge Cases

- If the container runtime is available but the container image has not been pulled, the system should attempt to pull it or report a clear error.
- If credentials are set but invalid (expired or revoked), the external service connection will fail — the system should report a connection error, not a credentials-not-set error.
- If both external services fail simultaneously, the system falls back to mock data entirely rather than showing an empty table.
- Connection caching should handle the case where a service becomes unavailable after an initial successful connection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The cluster listing operation MUST attempt to connect to both external cluster management services and fetch real cluster data when infrastructure prerequisites are met.
- **FR-002**: The cluster listing operation MUST fall back to mock data when any infrastructure prerequisite is not met, returning the same response format with a data source indicator of "mock".
- **FR-003**: When real data is returned, the response MUST include a data source indicator of "live" so the UI can distinguish real from mock data.
- **FR-004**: When one external service is available but the other is not, the system MUST return real data from the available service combined with a note about the unavailable service, rather than falling back entirely to mock data.
- **FR-005**: The prerequisites check operation MUST report the actual status of: credential presence (OFFLINE_TOKEN), container runtime availability, and external service connectivity.
- **FR-006**: External service connections MUST be cached after the first successful connection to avoid re-establishing connections on every request.
- **FR-007**: If a cached connection fails, the system MUST attempt to reconnect once before falling back to mock data.
- **FR-008**: The system MUST NOT expose credential values in any response, log, or error message. Only presence/absence and connection success/failure are reported.
- **FR-009**: The UI MUST display an indicator showing whether the current cluster data is from live servers or mock data.
- **FR-010**: The existing support engineer workflow MUST remain fully functional and unchanged.
- **FR-011**: All cluster data MUST be returned in the same format (name, ID, status, type, version, provider, region) regardless of whether it comes from live servers or mock data.

### Key Entities

- **External Service Connection**: A cached connection to an external cluster management service, with status (connected/disconnected/error), service name, and last connection timestamp.
- **Data Source Indicator**: A label ("live" or "mock") attached to cluster inventory responses indicating the origin of the data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With prerequisites met, the cluster listing returns real cluster data within 10 seconds — verified by the presence of the "live" data source indicator and cluster data that differs from the 5 hardcoded mock clusters.
- **SC-002**: Without prerequisites, the cluster listing returns mock data within 2 seconds — verified by the "mock" data source indicator and the standard 5 mock clusters.
- **SC-003**: The prerequisites check accurately reports all 3 prerequisite categories (credentials, container runtime, service connectivity) — each matching the actual environment state.
- **SC-004**: Zero regression — the existing support engineer workflow and all prior OCP admin features operate identically.
- **SC-005**: No credential values appear in any tool response or status message — only boolean presence indicators.

## Dependencies & Assumptions

### Dependencies

- Specs 023-025 (OCP admin persona, UI, interactive tools) are complete and committed.
- The container runtime (podman) is available on the host for real data mode.
- Container images for the external MCP servers are accessible from a container registry.
- The OFFLINE_TOKEN credential is obtainable from cloud.redhat.com/openshift/token.

### Assumptions

- The external MCP servers communicate via stdio transport (spawned as container child processes).
- Connection caching is in-memory — connections do not persist across server restarts.
- The container image and command configuration are embedded in the application code, not read from external configuration files, to avoid filesystem path coupling.
- Only the cluster-inventory skill's tools (list_clusters, cluster_info) are proxied in this phase. Cluster events and log download are future work.

## Scope

### Out of Scope

- Cluster detail view (get_cluster_info proxying)
- Cluster events or log download proxying
- Writing or modifying clusters through the external services
- External configuration file (mcps.json) parsing
- Authentication token refresh or rotation
- Changes to the existing support engineer workflow
