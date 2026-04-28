# Quickstart: OCP Admin Persona — Minimal Skill Integration

**Feature**: `023-ocp-admin-persona`
**Date**: 2026-04-26

## Goal

Register the OCP admin persona as a discoverable skill in the MCP server so that `list_skills`, `get_skill`, and `start_ocp_admin` return correct responses.

## Preconditions

- Node.js and npm installed
- Repository dependencies installed (`npm install`)
- On branch `023-ocp-admin-persona`
- Existing tests pass (`npm test`)

## Implementation Sequence

1. **Create skill file** — `skills/ocp-admin/SKILL.md`
   - Adapt from `agentic-collections/ocp-admin` CLAUDE.md and cluster-inventory SKILL.md
   - Combine persona definition and cluster-inventory sub-skill into single file

2. **Add constants** in `server.ts`
   - `OCP_ADMIN_SKILL_RESOURCE_URI`
   - `OCP_ADMIN_SKILL_RESOURCE_SOURCE_PATH`
   - `OCP_ADMIN_SKILL_RESOURCE_FALLBACK`
   - `loadOcpAdminSkillMarkdown()` wrapper

3. **Update `list_skills` tool** in `server.ts`
   - Add OCP admin URI to output text

4. **Refactor `get_skill` tool** in `server.ts`
   - Replace single-URI check with registry lookup
   - Update error messages to list all supported URIs

5. **Register `start_ocp_admin` tool** in `server.ts`
   - Read-only tool, no input parameters
   - Returns structured content with persona, skill_uri, available_skills, prerequisites

6. **Register skill resource** in `server.ts`
   - `server.registerResource("ocp-admin-skill", OCP_ADMIN_SKILL_RESOURCE_URI, ...)`

7. **Add tests**
   - Unit: skill loader and fallback
   - Contract: list_skills and get_skill responses
   - Integration: start_ocp_admin response shape
   - Regression: extend existing tool surface test

## Verification

```bash
# Build
npm run build

# Run all tests
npm test

# Start server and test manually
npm start
# Then use MCP inspector or client to call:
#   list_skills → should show both URIs
#   get_skill { uri: "skill://ocp-admin/SKILL.md" } → should return markdown
#   start_ocp_admin → should return structured content
```

## Acceptance Checklist

- [ ] `list_skills` returns both skill URIs
- [ ] `get_skill` with OCP admin URI returns persona markdown
- [ ] `get_skill` with engage URI still works identically
- [ ] `get_skill` with unsupported URI lists both supported URIs
- [ ] `start_ocp_admin` returns structured content with prerequisites
- [ ] Skill file fallback works when SKILL.md is missing
- [ ] All existing tests still pass (zero regression)
