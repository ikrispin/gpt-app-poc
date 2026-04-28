# Implementation Plan: OCP Admin Persona — Minimal Skill Integration

**Branch**: `023-ocp-admin-persona` | **Date**: 2026-04-26 | **Spec**: `specs/023-ocp-admin-persona/spec.md`
**Input**: Feature specification from `specs/023-ocp-admin-persona/spec.md`

## Summary

Register the OCP admin persona as a second discoverable skill in the MCP server alongside the existing engage-red-hat-support skill. Add a top-level SKILL.md with intent routing and a cluster-inventory sub-skill SKILL.md adapted from the `agentic-collections/ocp-admin` repository. Extend `list_skills` and `get_skill` to support both skill URIs, add a read-only `start_ocp_admin` tool, and register the skill as an MCP resource. No UI, no state management, no HTTP routes.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js runtime
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `express`, `zod`
**Storage**: N/A — no persistent or in-memory state for this feature
**Testing**: `tsx --test` suites (`test:unit`, `test:contract`, `test:integration`, `test:regression`)
**Target Platform**: Linux-hosted MCP server + MCP-compatible LLM clients
**Project Type**: Single MCP server project with embedded React widget (widget not modified by this feature)
**Performance Goals**: Skill content served within existing response time bounds; no new computation
**Constraints**: Keep existing engage skill behavior identical; no host-specific APIs; text-only persona (no UI resources)
**Scale/Scope**: Additive-only change — ~60 lines in server.ts, 2 new SKILL.md files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Diagnostics stay explicit and read-only: OCP admin persona provides skill documentation only; no diagnostic collection or write operations are introduced. **PASS**
- MCP Apps compliance: No new ui:// resources are registered; the persona operates through text-based skill content and standard MCP tool responses. **PASS**
- Text fallback for non-UI hosts: The persona is entirely text-based; no UI flows are introduced, so text fallback is inherent. **PASS**
- Redaction and least-scope data handling: The skill content instructs the LLM to never expose credential values; the gpt-app-poc server itself does not handle any OCP-related credentials. **PASS**
- Non-retroactive spec integrity: All new artifacts are in `specs/023-ocp-admin-persona/` only. **PASS**

## Project Structure

### Documentation (this feature)

```text
specs/023-ocp-admin-persona/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ocp-admin-skill-discovery.contract.v1.json
│   └── ocp-admin-start-tool.contract.v1.json
└── tasks.md
```

### Source Code (repository root)

```text
server.ts                                          # Extend: skill constants, list_skills, get_skill, start_ocp_admin tool, resource registration

skills/
├── engage-red-hat-support/
│   └── SKILL.md                                   # Existing — unchanged
└── ocp-admin/
    └── SKILL.md                                   # New — persona definition with embedded cluster-inventory sub-skill

tests/
├── unit/
│   └── ocp-admin-skill-loader.test.ts             # New — skill file loading and fallback
├── contract/
│   └── ocp-admin-skill-discovery.contract.test.ts  # New — list_skills and get_skill contract assertions
├── integration/
│   └── ocp-admin-start-tool.test.ts               # New — start_ocp_admin structured content
└── regression/
    └── mcp-tool-surface-preservation.test.ts       # Existing — extend to cover OCP admin tools
```

**Structure Decision**: Keep the existing single-project architecture. Add skill files under `skills/ocp-admin/` following the established `skills/<name>/SKILL.md` pattern. Extend `server.ts` inline following existing registration patterns.

## Implementation Strategy

1. Create `skills/ocp-admin/SKILL.md` adapted from the `agentic-collections/ocp-admin` CLAUDE.md and cluster-inventory SKILL.md sources, combining the persona definition and the cluster-inventory sub-skill into a single file.
2. Add OCP admin skill constants in `server.ts`: URI, source path, fallback string, and loader function — mirroring the existing engage skill constants.
3. Refactor `get_skill` tool from single-URI validation to a registry lookup (`Record<string, () => Promise<string>>`) supporting both engage and OCP admin URIs.
4. Update `list_skills` tool output to include both skill URIs.
5. Register `start_ocp_admin` read-only tool that returns persona identification, skill URI, available sub-skills, and prerequisite requirements in structured content.
6. Register `skill://ocp-admin/SKILL.md` as an MCP resource following the `engage-red-hat-support-skill` pattern.
7. Update error messages in `get_skill` to list all supported URIs dynamically.
8. Add unit, contract, integration, and regression tests.

## Phase 0: Research Plan

- Confirm the `loadSkillMarkdown()` utility in `server.ts` works for additional skill files without modification (it accepts any source path and fallback string — no changes needed).
- Confirm the `get_skill` refactor from single-URI to registry lookup preserves the existing engage skill behavior identically.
- Confirm the best approach for combining the ocp-admin persona definition and cluster-inventory sub-skill into a single SKILL.md (avoids multi-file complexity for the minimal integration).

## Phase 1: Design & Contracts Plan

- Create `data-model.md` for skill registration entities and tool response shapes.
- Create contracts:
  - `contracts/ocp-admin-skill-discovery.contract.v1.json` — list_skills and get_skill response shapes with OCP admin URI
  - `contracts/ocp-admin-start-tool.contract.v1.json` — start_ocp_admin structured content shape
- Create `quickstart.md` with implementation sequence and verification commands.
- Run `.specify/scripts/bash/update-agent-context.sh cursor-agent`.

## Post-Design Constitution Re-Check

- No diagnostic collection or write operations are added. **PASS**
- No new ui:// resources; persona is text-only. **PASS**
- Text fallback is inherent — no UI flows exist. **PASS**
- No credential handling at the gpt-app-poc level. **PASS**
- All new artifacts stay within `specs/023-ocp-admin-persona/`. **PASS**

## Complexity Tracking

No constitution violations identified; complexity justification table is not required.
