import type { ClusterDetailInfo, ClusterRow, DataSource, PrerequisiteCheckResult } from "./ocp-state";
import { ActionButtonAdapter } from "../ui/action-button-adapter";

type PrerequisitesContentProps = {
  onContinue: () => void;
  prerequisiteResults: PrerequisiteCheckResult | null;
  onCheckPrerequisites: () => void;
};

export function PrerequisitesContent({ onContinue, prerequisiteResults, onCheckPrerequisites }: PrerequisitesContentProps) {
  return (
    <div className="rhds-step-form">
      <h2 className="rhds-step-form__heading">OpenShift Cluster Administration</h2>
      <p>Manage multi-cluster fleets across self-managed (OCP, SNO) and managed service (ROSA, ARO, OSD) deployments.</p>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Environment Variables</h3>
        {prerequisiteResults === null ? (
          <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Checking prerequisites...</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "none" }}>
            <li>
              <span style={{ marginRight: "0.5rem" }}>{prerequisiteResults.offline_token_set ? "✅" : "❌"}</span>
              <strong>OFFLINE_TOKEN</strong> — {prerequisiteResults.offline_token_set ? "Set" : "Not set (required from cloud.redhat.com/openshift/token)"}
            </li>
            <li style={{ marginTop: "0.25rem" }}>
              <span style={{ marginRight: "0.5rem" }}>{prerequisiteResults.podman_available ? "✅" : "❌"}</span>
              <strong>Podman</strong> — {prerequisiteResults.podman_available ? "Available" : "Not available (required for MCP server containers)"}
            </li>
          </ul>
        )}
      </div>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>MCP Servers</h3>
        {prerequisiteResults === null ? (
          <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Checking...</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "none" }}>
            {prerequisiteResults.mcp_servers.map((server) => (
              <li key={server.name} style={{ marginBottom: "0.25rem" }}>
                <span style={{ marginRight: "0.5rem" }}>{server.status === "connected" ? "✅" : "⚠️"}</span>
                <strong>{server.name}</strong> — {server.description} ({server.status})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rhds-field-group" style={{ marginTop: "1rem" }}>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Available Skills</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
          <li><strong>cluster-inventory</strong> — List and inspect clusters across all types (read-only)</li>
          <li><em>cluster-creator</em> — Planned</li>
          <li><em>cluster-report</em> — Planned</li>
        </ul>
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
        <ActionButtonAdapter id="ocp-recheck" variant="secondary" onClick={onCheckPrerequisites}>
          Re-check
        </ActionButtonAdapter>
        <ActionButtonAdapter id="ocp-continue" variant="primary" onClick={onContinue}>
          Continue to Cluster Inventory
        </ActionButtonAdapter>
      </div>
    </div>
  );
}

type ClusterInventoryContentProps = {
  clusters: ClusterRow[];
  isLoading: boolean;
  dataSource: DataSource;
  onLoadClusters: () => void;
  onSelectCluster: (clusterId: string) => void;
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

function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  if (dataSource === null) return null;
  const isLive = dataSource === "live";
  const isPartial = dataSource === "partial";
  const label = isLive ? "Live data" : isPartial ? "Partial data" : "Mock data (demo)";
  const color = isLive ? "#3e8635" : isPartial ? "#f0ab00" : "#f0ab00";
  const bg = isLive ? "#e9f5e6" : isPartial ? "#fef6e0" : "#fef6e0";
  return (
    <span style={{
      display: "inline-block",
      fontSize: "0.75rem",
      fontWeight: 600,
      padding: "0.15rem 0.5rem",
      borderRadius: "0.75rem",
      color,
      backgroundColor: bg,
      marginBottom: "0.75rem",
    }}>
      {label}
    </span>
  );
}

export function ClusterInventoryContent({ clusters, isLoading, dataSource, onLoadClusters, onSelectCluster }: ClusterInventoryContentProps) {
  if (clusters.length === 0 && !isLoading) {
    return (
      <div className="rhds-step-form">
        <h2 className="rhds-step-form__heading">Cluster Inventory</h2>
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", marginBottom: "1rem" }}>No clusters loaded yet.</p>
        <ActionButtonAdapter id="ocp-load" variant="primary" onClick={onLoadClusters}>
          Load Clusters
        </ActionButtonAdapter>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rhds-step-form">
        <h2 className="rhds-step-form__heading">Cluster Inventory</h2>
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Loading clusters...</p>
      </div>
    );
  }

  return (
    <div className="rhds-step-form">
      <h2 className="rhds-step-form__heading">Cluster Inventory</h2>
      <DataSourceBadge dataSource={dataSource} />
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
                <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>
                  <button
                    type="button"
                    title="View cluster details"
                    onClick={() => onSelectCluster(cluster.id)}
                    style={{ background: "none", border: "none", padding: 0, color: "#06c", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                  >
                    {cluster.name}
                  </button>
                </td>
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

      <div style={{ marginTop: "1rem" }}>
        <ActionButtonAdapter id="ocp-refresh" variant="secondary" onClick={onLoadClusters}>
          Refresh
        </ActionButtonAdapter>
      </div>
    </div>
  );
}

// --- Cluster Detail View ---

type ClusterDetailContentProps = {
  detail: ClusterDetailInfo | null;
  isLoading: boolean;
  dataSource: DataSource;
  onBack: () => void;
};

const DETAIL_FIELDS: Array<{ key: keyof ClusterDetailInfo; label: string; isLink?: boolean }> = [
  { key: "id", label: "ID" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "version", label: "Version" },
  { key: "provider", label: "Provider" },
  { key: "region", label: "Region" },
  { key: "created_at", label: "Created" },
  { key: "host_count", label: "Hosts" },
  { key: "platform_type", label: "Platform" },
  { key: "api_vip", label: "API VIP" },
  { key: "api_url", label: "API URL" },
  { key: "ingress_vip", label: "Ingress VIP" },
  { key: "console_url", label: "Console", isLink: true },
  { key: "dns_domain", label: "DNS Domain" },
  { key: "network_type", label: "Network Type" },
  { key: "cluster_network_cidr", label: "Cluster CIDR" },
  { key: "service_network_cidr", label: "Service CIDR" },
  { key: "source", label: "Data Source" },
];

export function ClusterDetailContent({ detail, isLoading, dataSource, onBack }: ClusterDetailContentProps) {
  return (
    <div className="rhds-step-form">
      <div style={{ marginBottom: "1rem" }}>
        <ActionButtonAdapter id="ocp-back" variant="secondary" onClick={onBack}>
          Back to Cluster Inventory
        </ActionButtonAdapter>
      </div>

      {isLoading && (
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Loading cluster details...</p>
      )}

      {!isLoading && !detail && (
        <p style={{ color: "var(--rhds-text-muted, #4f5255)" }}>Cluster details not available.</p>
      )}

      {!isLoading && detail && (
        <>
          <h2 className="rhds-step-form__heading">{detail.name}</h2>
          <DataSourceBadge dataSource={dataSource} />

          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem", fontSize: "0.875rem", margin: 0 }}>
            {DETAIL_FIELDS.map(({ key, label, isLink }) => {
              const value = detail[key];
              if (value === undefined || value === null || value === "" || value === "-") return null;
              return (
                <div key={key} style={{ display: "contents" }}>
                  <dt style={{ fontWeight: 600, color: "var(--rhds-text-muted, #4f5255)" }}>{label}</dt>
                  <dd style={{ margin: 0 }}>
                    {isLink && typeof value === "string" ? (
                      <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "#06c" }}>{value}</a>
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </div>
  );
}
