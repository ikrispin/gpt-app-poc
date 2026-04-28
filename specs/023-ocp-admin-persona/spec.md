# Feature Specification: OCP Admin Persona — Minimal Skill Integration

**Feature Branch**: `023-ocp-admin-persona`  
**Created**: 2026-04-26  
**Status**: Draft  
**Input**: User description: "Add OCP admin persona as a discoverable skill in the MCP app, starting with cluster-inventory sub-skill for read-only cluster listing across self-managed and managed OpenShift deployments"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover the OCP admin persona via skill listing (Priority: P1)

As an LLM client user, I can discover the OCP admin persona alongside existing skills so I know that OpenShift cluster administration capabilities are available.

**Why this priority**: Without discovery, no other OCP admin functionality is accessible. This is the foundational integration point that proves the persona exists in the app.

**Independent Test**: Call the skill listing operation and verify the OCP admin skill URI appears in the results alongside the existing engage-red-hat-support skill.

**Acceptance Scenarios**:

1. **Given** the MCP server is running, **When** the skill listing is requested, **Then** the response includes a URI for the OCP admin skill in addition to the existing engage-red-hat-support skill.
2. **Given** the skill listing includes the OCP admin URI, **When** the skill content is requested using that URI, **Then** the response contains the OCP admin persona description, intent routing table, and prerequisite information.
3. **Given** the skill content is requested with an unsupported URI, **When** the request is processed, **Then** the response lists all supported skill URIs including both the engage and OCP admin skills.

---

### User Story 2 — Activate the OCP admin persona (Priority: P1)

As an LLM client user, I can activate the OCP admin persona so the LLM receives routing guidance and prerequisite information for OpenShift administration tasks.

**Why this priority**: Activation is the entry point for all OCP admin workflows. Without it, the skill content cannot guide the LLM to the correct sub-skills.

**Independent Test**: Call the OCP admin activation operation and verify it returns persona identification, the skill URI, available sub-skills, and prerequisite information (required environment variables and MCP servers).

**Acceptance Scenarios**:

1. **Given** the MCP server is running, **When** the OCP admin activation is requested, **Then** the response includes the persona identifier, the skill URI, a list of available sub-skills, and prerequisite requirements.
2. **Given** the OCP admin is activated, **When** the LLM reads the skill content, **Then** it receives intent routing guidance that directs cluster inventory requests to the cluster-inventory sub-skill.

---

### User Story 3 — Access cluster-inventory skill content (Priority: P2)

As an LLM client user, I can access the cluster-inventory sub-skill documentation so the LLM can guide me through listing and inspecting OpenShift clusters across self-managed and managed deployments.

**Why this priority**: The cluster-inventory skill is the first concrete capability delivered. It validates that the persona's sub-skill content is properly served and usable for real OpenShift administration tasks.

**Independent Test**: Read the OCP admin skill content and verify it references the cluster-inventory sub-skill with workflow steps, filtering capabilities, output formatting rules, and prerequisite checks.

**Acceptance Scenarios**:

1. **Given** the OCP admin skill content is loaded, **When** the LLM processes the content, **Then** it finds instructions for listing clusters across both self-managed (OCP, SNO) and managed (ROSA, ARO, OSD) deployments.
2. **Given** the skill content is loaded, **When** the LLM checks prerequisites, **Then** it can determine which environment variables and MCP servers are required before attempting cluster operations.

---

### Edge Cases

- If the OCP admin SKILL.md file is missing or unreadable, the system returns a fallback message indicating temporary unavailability rather than failing silently.
- If the skill content references sub-skills that are not yet available (cluster-creator, cluster-report), the content clearly indicates they are planned but not integrated.
- The existing engage-red-hat-support skill discovery and activation must remain fully functional after the OCP admin persona is added.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The skill listing operation MUST return URIs for both the existing engage-red-hat-support skill and the new OCP admin skill.
- **FR-002**: The skill content retrieval operation MUST serve the OCP admin persona markdown when requested with the OCP admin skill URI.
- **FR-003**: The system MUST provide a dedicated OCP admin activation operation that returns persona identification, the skill URI, available sub-skills, and prerequisite requirements.
- **FR-004**: The OCP admin skill content MUST include an intent routing table mapping user intents to sub-skills (cluster-inventory available now; cluster-creator and cluster-report listed as planned).
- **FR-005**: The OCP admin skill content MUST include the cluster-inventory sub-skill documentation with prerequisites, workflow steps, filtering capabilities, output formatting, and examples.
- **FR-006**: The system MUST return a human-readable fallback message if the OCP admin SKILL.md file cannot be loaded.
- **FR-007**: The existing engage-red-hat-support skill listing, content retrieval, and activation MUST remain unchanged.
- **FR-008**: The OCP admin skill content MUST document prerequisite environment variables (OFFLINE_TOKEN) and required external MCP servers (openshift-self-managed, openshift-ocm-managed) without exposing credential values.
- **FR-009**: The OCP admin activation operation MUST be read-only with no side effects, state changes, or destructive actions.

### Key Entities

- **OCP Admin Skill**: The top-level persona definition containing intent routing, global rules, MCP server prerequisites, and references to sub-skills.
- **Cluster-Inventory Sub-Skill**: Documentation for the read-only cluster listing capability, including workflow steps, filtering, output formatting, and error handling guidance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The OCP admin skill is discoverable — skill listing returns both skill URIs in a single response.
- **SC-002**: The OCP admin skill content is retrievable — requesting the OCP admin URI returns persona documentation containing intent routing for 3 sub-skills.
- **SC-003**: The OCP admin activation returns structured prerequisite information — environment variables and MCP server names are included in the response.
- **SC-004**: Zero regression — the existing engage-red-hat-support skill listing, content retrieval, and activation produce identical results before and after the change.
- **SC-005**: Graceful degradation — if the skill file is missing, the system returns a fallback message rather than an error.

## Dependencies & Assumptions

### Dependencies

- The OCP admin persona source content from the `agentic-collections/ocp-admin` repository is available for adaptation.
- The existing `loadSkillMarkdown()` utility in `server.ts` supports loading additional skill files without modification.

### Assumptions

- The OCP admin persona does not require a UI widget — it operates through text-based skill content that guides LLM behavior.
- The external MCP servers (openshift-self-managed, openshift-ocm-managed) are configured separately by the user in their LLM client, not proxied through gpt-app-poc.
- Only the cluster-inventory sub-skill is included in this initial integration. Cluster-creator and cluster-report are documented as planned in the skill content but not implemented.
- No backend workflow state management is needed — the OCP admin persona is stateless at the gpt-app-poc level.

## Scope

### Out of Scope

- UI widget or visual components for the OCP admin persona
- Backend workflow state management or session tracking
- HTTP API routes for OCP admin operations
- Security infrastructure (consent tokens, credential vaults) — cluster-inventory is read-only
- MCP server proxying — external MCP servers are user-configured
- Cluster-creator sub-skill integration
- Cluster-report sub-skill integration
- Deprecation of the existing engage-red-hat-support persona
