import type { ClusterRow } from "./ocp-state";
import { ActionButtonAdapter } from "../ui/action-button-adapter";

type PrerequisitesContentProps = {
  onContinue: () => void;
};

export function PrerequisitesContent({ onContinue }: PrerequisitesContentProps) {
  return (
    <div className="rhds-step-form">
      <h2 className="rhds-step-form__heading">OpenShift Cluster Administration</h2>
      <p>Manage multi-cluster fleets across self-managed (OCP, SNO) and managed service (ROSA, ARO, OSD) deployments.</p>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Required Environment Variables</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li><strong>OFFLINE_TOKEN</strong> — Red Hat authentication token from cloud.redhat.com/openshift/token</li>
        </ul>
      </div>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Required MCP Servers</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li><strong>openshift-self-managed</strong> — Assisted Installer API for OCP/SNO cluster lifecycle</li>
          <li><strong>openshift-ocm-managed</strong> — OCM API for managed service clusters (ROSA, ARO, OSD)</li>
        </ul>
      </div>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Available Skills</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li><strong>cluster-inventory</strong> — List and inspect clusters across all types (read-only)</li>
          <li><em>cluster-creator</em> — Planned</li>
          <li><em>cluster-report</em> — Planned</li>
        </ul>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <ActionButtonAdapter id="ocp-continue" variant="primary" onClick={onContinue}>
          Continue to Cluster Inventory
        </ActionButtonAdapter>
      </div>
    </div>
  );
}

type ClusterInventoryContentProps = {
  clusters: ClusterRow[];
};

const STATUS_DISPLAY: Record<string, string> = {
  ready: "ready",
  installed: "ready",
  installing: "installing",
  error: "error",
  "pending-for-input": "pending",
};

function buildSummary(clusters: ClusterRow[]): string {
  const counts: Record<string, number> = {};
  for (const c of clusters) {
    const label = STATUS_DISPLAY[c.status] ?? c.status;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([label, count]) => `${count} ${label}`);
  return `Found ${clusters.length} cluster(s): ${parts.join(", ")}`;
}

export function ClusterInventoryContent({ clusters }: ClusterInventoryContentProps) {
  return (
    <div className="rhds-step-form">
      <h2 className="rhds-step-form__heading">Cluster Inventory</h2>
      <p style={{ fontWeight: 600, marginBottom: "1rem" }}>{buildSummary(clusters)}</p>

      <div style={{ overflowX: "auto" }}>
        <table className="rhds-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Name</th>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Type</th>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Version</th>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Provider</th>
              <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Region</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((cluster) => (
              <tr key={cluster.id}>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.name}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.status}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.type}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.version}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.provider}</td>
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{cluster.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
