# Research: OCP Admin Persona — Minimal Skill Integration

**Feature**: `023-ocp-admin-persona`
**Date**: 2026-04-26

## R1: Can loadSkillMarkdown() be reused without modification?

**Decision**: Yes — reuse as-is.

**Rationale**: The function signature is `loadSkillMarkdown(sourcePath: string, fallback: string): Promise<string>`. It accepts any file path and any fallback string. The engage skill uses it through a wrapper (`loadEngageSkillMarkdown`), and we follow the same pattern with `loadOcpAdminSkillMarkdown`. No changes to the utility itself.

**Alternatives considered**: None needed — the utility is already generic.

## R2: How to refactor get_skill from single-URI to multi-URI?

**Decision**: Replace the hardcoded `if (normalizedUri !== ENGAGE_SKILL_RESOURCE_URI)` check with a `Record<string, () => Promise<string>>` registry lookup.

**Rationale**: A registry lookup is the smallest change that supports multiple URIs. It keeps the existing behavior for the engage URI identical (same loader function, same response shape) while allowing new URIs to be added by inserting a key-value pair. The error message for unsupported URIs dynamically lists all supported URIs from the registry keys.

**Alternatives considered**:
- **Chained if/else**: Simpler but doesn't scale and requires touching the function for each new skill. Rejected for poor extensibility.
- **External config file**: Over-engineered for 2 skills. Rejected as unnecessary complexity.

## R3: Single SKILL.md vs. separate persona and sub-skill files?

**Decision**: Single `skills/ocp-admin/SKILL.md` file combining the persona definition and cluster-inventory sub-skill content.

**Rationale**: The minimal integration serves exactly one sub-skill. Splitting into `skills/ocp-admin/SKILL.md` (persona) + `skills/ocp-admin/cluster-inventory/SKILL.md` (sub-skill) would require either serving two files via two URIs (complicating discovery) or stitching them together at load time (unnecessary complexity). A single file keeps the integration as simple as the engage skill pattern (one URI → one file).

**Alternatives considered**:
- **Two separate files with two URIs**: More faithful to the source structure but adds complexity (two registrations, two loaders, sub-skill discovery mechanism). Better suited for a future iteration when multiple sub-skills are available.
- **Two files stitched at load time**: Runtime concatenation adds failure modes and makes the served content harder to reason about. Rejected.

## R4: What structured content shape should start_ocp_admin return?

**Decision**: Return `{ persona, skill_uri, available_skills, prerequisites }` matching the contract in `ocp-admin-start-tool.contract.v1.json`.

**Rationale**: This shape gives the LLM client everything it needs to proceed: which persona is active, where to read the skill, what sub-skills exist, and what prerequisites must be met. It follows the pattern of `start_engage_red_hat_support` (which returns `workflow`, `workflow_session_id`, `current_step`, `compatibility_entry_uri`) adapted for a stateless persona.

**Alternatives considered**:
- **Include full skill markdown in the response**: Duplicates what `get_skill` provides. Rejected to avoid redundancy.
- **Return only the skill URI**: Too minimal — the LLM wouldn't know about prerequisites without reading the full skill first. Including prerequisites in the structured content enables faster prerequisite validation.
