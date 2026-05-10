# GPT App PoC

Proof-of-concept MCP app with a minimal server and UI bundle. This repo is used
to validate MCP Apps patterns and workflows, with an emphasis on repeatable,
incremental delivery.

## Development Methodology

This project follows an iterative, incremental, specification-driven workflow:

- Each feature is introduced through a spec package under `specs/`.
- A spec includes `spec.md`, `plan.md`, and `tasks.md`, plus supporting docs
  such as `research.md`, `data-model.md`, `quickstart.md`, and contracts.
- Changes are delivered in small, independently testable increments.
- The constitution defines project-wide constraints and quality gates.

See:
- `specs/001-mcp-apps-hello-world/` for an example spec package.
- `.specify/memory/constitution.md` for governing principles and quality gates.
- `.specify/templates/` for the spec, plan, and tasks templates.

## Project Structure

- `src/` MCP server implementation and app logic
- `mcp-app.html` single-file UI entry for the MCP app
- `server.ts` local server entry (pure tool/action layer)
- `gpt-config/` GPT Store configuration (instructions + knowledge files)
- `specs/` feature specifications (one folder per spec)

## Quick Start

- Install dependencies: `npm install`
- Run the server: `npm run serve`
- Build the UI bundle: `npm run build`

## Testing

- MCP smoke tests (after build): `npm run test:mcp`
- Jira feature tests:
  - `npm run test:unit`
  - `npm run test:contract`
  - `npm run test:integration`
  - `npm run test:regression`
  - `npm run test:jira`

## OCP Admin Actions (MCP Tools)

The MCP server exposes these tools that the GPT calls via its MCP Action connector:

| Tool | Description |
|------|-------------|
| `check_ocp_prerequisites` | Verify environment and MCP server connectivity |
| `list_ocp_clusters` | List all clusters across OCP, SNO, ROSA, ARO, OSD |
| `get_cluster_info` | Get detailed cluster information by ID |
| `get_cluster_events` | Get event history (self-managed only) |
| `get_cluster_logs_url` | Get logs download URL (self-managed only) |
| `create_ocp_cluster` | Create a new self-managed cluster definition |
| `get_cluster_hosts` | Get registered hosts and discovery ISO URL |
| `set_host_role` | Assign master/worker role to a host |
| `set_cluster_vips` | Configure API and Ingress VIPs |
| `start_cluster_installation` | Trigger cluster installation (irreversible) |
| `get_installation_progress` | Get installation status and progress |

Skill logic (intent routing, workflows, confirmations) lives in the GPT
instructions, not in the MCP server. See `gpt-config/instructions.md`.

## Local Sosreport Tools (Phase 1)

- New MCP tools:
  - `generate_sosreport`
  - `fetch_sosreport`
- Local prerequisites:
  - `sos` package installed and available in PATH
  - `/etc/sudoers.d/mcp-sos` configured with `NOPASSWD` entries for required `sos report` execution commands
- Privilege model:
  - generation uses `sudo -n` (non-interactive)
  - interactive password prompting is intentionally unsupported
- Output behavior:
  - `generate_sosreport` requires a valid one-time `consent_token` and returns archive metadata and `fetch_reference`
  - `fetch_sosreport` copies archive to `/tmp` and returns `archive_path`, `size_bytes`, and `sha256`
  - tool responses always include text fallback content for non-UI hosts
- Scope boundaries:
  - local execution only in this increment
  - no SSH host parameter, no SSH credential lifecycle

### Deferred Phase 2 (Not Implemented)

- SSH execution support
- Remote connection lifecycle management
- Host trust and secret management
- Multi-tenant hardening and rate limits

## ChatGPT Apps Technical Readiness

Technical readiness details live under `specs/003-chatgpt-app-technical-readiness/`.

- MCP endpoint: `http://localhost:3001/mcp` (dev), `https://leisured-carina-unpromotable.ngrok-free.dev/mcp` (prod)
- Privacy policy: `http://localhost:3001/privacy` (dev), `https://leisured-carina-unpromotable.ngrok-free.dev/privacy` (prod)
- Support contact: `http://localhost:3001/support` (dev), `https://leisured-carina-unpromotable.ngrok-free.dev/support` (prod)

## Jira Attachment Security Behavior

- PATs are accepted only by backend connection endpoint (`POST /api/jira/connections`).
- Using `POST /api/jira/connection` (singular) is unsupported and returns guidance to use the plural endpoint.
- PATs are encrypted at rest in backend token vault storage.
- MCP tools never accept or return PATs; they use opaque `connection_id` references.
- Tool and API flows always provide text fallbacks for non-UI MCP clients.
- Revoke and TTL-expiry block all protected Jira operations until reconnect.
- Jira API redirects to SSO/login are treated as invalid credentials/configuration for this flow; no additional HTTP header bypasses SAML in this app.

## Engage Red Hat Support Workflow (Option A)

- New skill resource: `skill://engage-red-hat-support/SKILL.md`
- Compatibility UI entry resource: `ui://engage-red-hat-support/app.html`
- Step UI resources:
  - `ui://engage-red-hat-support/steps/select-product.html`
  - `ui://engage-red-hat-support/steps/sos-report.html`
  - `ui://engage-red-hat-support/steps/jira-attach.html`
- Orchestration model:
  - UI/skill orchestrates existing tools and endpoints
  - no new MCP orchestration tool is introduced
- Required 3-step conversational workflow:
  1. start workflow + select product (linux only) (`start_engage_red_hat_support` -> `select_engage_product`)
  2. explicit consent mint + generate + fetch sos report (`POST /api/engage/consent-tokens` for web UI OR `mint_engage_consent_token` for headless -> `generate_sosreport(consent_token)` -> `fetch_sosreport`)
  3. connect Jira via secure intake, verify connection, verify issue read access (`jira_list_attachments`), then attach (`jira_attach_artifact`)
- Step 2 safeguards:
  - `generate_sosreport` is denied unless consent token is valid, unexpired, user/session-bound, scope-bound, step-bound, and single-use.
  - replayed consent tokens are denied.
  - UI does not auto-collect diagnostics on page load or step navigation.
- Linux-only product scope is enforced in the Engage UI flow.
- PAT secret boundary:
  - PAT is only used in secure backend intake
  - PAT must never appear in MCP tool args/results/prompts/logs
  - downstream calls use opaque `connection_id` only

### Headless MCP Step-2 snippet

Use this sequence for text/headless clients. Ask for explicit user approval before minting.
This compatibility guidance is additive hardening and does not change web UI consent behavior.

```ts
// 1) Ask user: "sosreport collects invasive diagnostics. Proceed?"
// 2) Only if user says yes, mint consent.
const mint = await callTool("mint_engage_consent_token", {
  permission_granted: true,
  workflow_session_id, // optional
});

// Prefer structured content.
let consentToken = String(mint.structuredContent?.consent_token ?? "").trim();

// Fallback for clients that only expose text content.
if (!consentToken) {
  const text = String(mint.content?.find((c) => c.type === "text")?.text ?? "");
  const match = text.match(/^consent_token:\s*(.+)$/m);
  consentToken = match?.[1]?.trim() ?? "";
}

if (!consentToken) throw new Error("Missing consent token from mint response");

const generated = await callTool("generate_sosreport", {
  consent_token: consentToken,
  workflow_session_id, // optional
});
```
