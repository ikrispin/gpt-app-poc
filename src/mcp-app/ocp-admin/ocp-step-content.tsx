import type { ClusterCreationResult, ClusterCreatorFormState, ClusterDetailInfo, ClusterEvent, ClusterRow, DataSource, HostInfo, PrerequisiteCheckResult } from "./ocp-state";
import { ActionButtonAdapter } from "../ui/action-button-adapter";
import { TextInputAdapter } from "../ui/text-input-adapter";
import { SelectAdapter } from "../ui/select-adapter";

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
          <li><strong>cluster-creator</strong> — Create and install self-managed OpenShift clusters (OCP, SNO)</li>
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
  events: ClusterEvent[];
  isLoadingEvents: boolean;
  eventsDataSource: DataSource;
  logsDownloadUrl: string | null;
  isLoadingLogsUrl: boolean;
  onLoadEvents: () => void;
  onGetLogsUrl: () => void;
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

const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  info: { color: "#06c", bg: "#e7f1fa" },
  warning: { color: "#795600", bg: "#fef6e0" },
  error: { color: "#c9190b", bg: "#fce9e8" },
  critical: { color: "#7d1007", bg: "#fce9e8" },
};

const SELF_MANAGED_TYPES = new Set(["OCP", "SNO"]);
const MAX_DISPLAYED_EVENTS = 50;

export function ClusterDetailContent({
  detail, isLoading, dataSource, onBack,
  events, isLoadingEvents, eventsDataSource, logsDownloadUrl, isLoadingLogsUrl,
  onLoadEvents, onGetLogsUrl,
}: ClusterDetailContentProps) {
  const isSelfManaged = detail ? SELF_MANAGED_TYPES.has(detail.type) : false;

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

          {isSelfManaged && (
            <>
              <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid var(--rhds-border-subtle, #d2d2d2)" }} />

              <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>Cluster Events</h3>

              {events.length === 0 && !isLoadingEvents && (
                <div style={{ marginBottom: "1rem" }}>
                  <ActionButtonAdapter id="ocp-load-events" variant="secondary" onClick={onLoadEvents}>
                    Load Events
                  </ActionButtonAdapter>
                </div>
              )}

              {isLoadingEvents && (
                <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic", marginBottom: "1rem" }}>Loading events...</p>
              )}

              {events.length > 0 && (
                <>
                  <DataSourceBadge dataSource={eventsDataSource} />
                  <p style={{ fontSize: "0.8rem", color: "var(--rhds-text-muted, #4f5255)", margin: "0 0 0.5rem" }}>
                    Showing {Math.min(events.length, MAX_DISPLAYED_EVENTS)} of {events.length} event(s)
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.8rem" }}>
                    {events.slice(0, MAX_DISPLAYED_EVENTS).map((event, idx) => {
                      const sev = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.info;
                      return (
                        <li key={idx} style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)", display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                          <span style={{ fontFamily: "monospace", color: "var(--rhds-text-muted, #4f5255)", whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                            {event.timestamp}
                          </span>
                          <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "0.5rem", color: sev.color, backgroundColor: sev.bg, whiteSpace: "nowrap" }}>
                            {event.severity.toUpperCase()}
                          </span>
                          <span>{event.message}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div style={{ marginTop: "0.75rem" }}>
                    <ActionButtonAdapter id="ocp-reload-events" variant="secondary" onClick={onLoadEvents}>
                      Refresh Events
                    </ActionButtonAdapter>
                  </div>
                </>
              )}

              <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid var(--rhds-border-subtle, #d2d2d2)" }} />

              <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>Cluster Logs</h3>

              {!logsDownloadUrl && !isLoadingLogsUrl && (
                <ActionButtonAdapter id="ocp-get-logs" variant="secondary" onClick={onGetLogsUrl}>
                  Get Download Link
                </ActionButtonAdapter>
              )}

              {isLoadingLogsUrl && (
                <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Generating download link...</p>
              )}

              {logsDownloadUrl && (
                <div>
                  <p style={{ margin: "0 0 0.5rem" }}>
                    <a href={logsDownloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#06c" }}>
                      Download cluster logs
                    </a>
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--rhds-text-muted, #4f5255)", margin: 0 }}>
                    This link may expire. Click "Get Download Link" again to generate a new one.
                  </p>
                  <div style={{ marginTop: "0.5rem" }}>
                    <ActionButtonAdapter id="ocp-refresh-logs" variant="secondary" onClick={onGetLogsUrl}>
                      Get New Link
                    </ActionButtonAdapter>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// --- Cluster Creator ---

type ClusterCreatorContentProps = {
  formState: ClusterCreatorFormState;
  isCreating: boolean;
  creationResult: ClusterCreationResult | null;
  creationError: string | null;
  onFieldChange: (field: string, value: string) => void;
  onSubmit: () => void;
  onBackToInventory: () => void;
  onNavigateSetup: (clusterId: string) => void;
};

const VERSION_OPTIONS = [
  { value: "4.21", label: "4.21 (latest)" },
  { value: "4.20", label: "4.20" },
  { value: "4.19", label: "4.19" },
];

const HA_MODE_OPTIONS = [
  { value: "Full", label: "Full HA (3+ control planes)" },
  { value: "None", label: "Single Node (SNO)" },
];

const NETWORK_TYPE_OPTIONS = [
  { value: "OVNKubernetes", label: "OVN-Kubernetes" },
  { value: "OpenShiftSDN", label: "OpenShift SDN" },
];

export function ClusterCreatorContent({
  formState, isCreating, creationResult, creationError,
  onFieldChange, onSubmit, onBackToInventory, onNavigateSetup,
}: ClusterCreatorContentProps) {
  if (creationResult) {
    return (
      <div className="rhds-step-form">
        <h2 className="rhds-step-form__heading">Cluster Created</h2>
        <DataSourceBadge dataSource={creationResult.dataSource} />

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1rem", fontSize: "0.875rem", margin: "1rem 0" }}>
          <div style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600, color: "var(--rhds-text-muted, #4f5255)" }}>Cluster Name</dt>
            <dd style={{ margin: 0 }}>{creationResult.clusterName}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600, color: "var(--rhds-text-muted, #4f5255)" }}>Cluster ID</dt>
            <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8rem" }}>{creationResult.clusterId}</dd>
          </div>
          <div style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600, color: "var(--rhds-text-muted, #4f5255)" }}>Status</dt>
            <dd style={{ margin: 0 }}>{creationResult.status}</dd>
          </div>
        </dl>

        <p style={{ fontSize: "0.85rem", color: "var(--rhds-text-muted, #4f5255)", marginBottom: "1rem" }}>
          The cluster has been created and is waiting for host registration. Continue to setup to register hosts and configure networking.
        </p>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <ActionButtonAdapter id="ocp-creator-to-setup" variant="primary" onClick={() => onNavigateSetup(creationResult.clusterId)}>
            Continue to Setup
          </ActionButtonAdapter>
          <ActionButtonAdapter id="ocp-creator-to-inventory" variant="secondary" onClick={onBackToInventory}>
            View in Inventory
          </ActionButtonAdapter>
        </div>
      </div>
    );
  }

  const canSubmit = formState.clusterName.trim().length > 0
    && formState.baseDnsDomain.trim().length > 0
    && !isCreating;

  return (
    <div className="rhds-step-form">
      <h2 className="rhds-step-form__heading">Create Cluster</h2>
      <p style={{ marginBottom: "1rem" }}>Define the configuration for a new self-managed OpenShift cluster.</p>

      {creationError && (
        <div style={{ padding: "0.75rem", marginBottom: "1rem", backgroundColor: "#fce9e8", border: "1px solid #c9190b", borderRadius: "4px", color: "#c9190b", fontSize: "0.85rem" }}>
          {creationError}
        </div>
      )}

      {isCreating && (
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic", marginBottom: "1rem" }}>Creating cluster...</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <TextInputAdapter
          id="cluster-name"
          label="Cluster Name"
          value={formState.clusterName}
          placeholder="e.g. my-production-cluster"
          onChange={(v) => onFieldChange("clusterName", v)}
        />

        <SelectAdapter
          id="ocp-version"
          label="OpenShift Version"
          value={formState.openshiftVersion}
          options={VERSION_OPTIONS}
          onChange={(v) => onFieldChange("openshiftVersion", v)}
        />

        <TextInputAdapter
          id="dns-domain"
          label="Base DNS Domain"
          value={formState.baseDnsDomain}
          placeholder="e.g. example.com"
          onChange={(v) => onFieldChange("baseDnsDomain", v)}
        />

        <SelectAdapter
          id="ha-mode"
          label="High Availability Mode"
          value={formState.highAvailabilityMode}
          options={HA_MODE_OPTIONS}
          onChange={(v) => onFieldChange("highAvailabilityMode", v)}
        />

        <SelectAdapter
          id="network-type"
          label="Network Type"
          value={formState.networkType}
          options={NETWORK_TYPE_OPTIONS}
          onChange={(v) => onFieldChange("networkType", v)}
        />
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
        <ActionButtonAdapter id="ocp-create-submit" variant="primary" isDisabled={!canSubmit} onClick={onSubmit}>
          Create Cluster
        </ActionButtonAdapter>
        <ActionButtonAdapter id="ocp-create-back" variant="secondary" onClick={onBackToInventory}>
          Back
        </ActionButtonAdapter>
      </div>
    </div>
  );
}

// --- Cluster Setup (Host Registration & VIPs) ---

type ClusterSetupContentProps = {
  setupClusterId: string | null;
  hosts: HostInfo[];
  isLoadingHosts: boolean;
  discoveryIsoUrl: string | null;
  apiVip: string;
  ingressVip: string;
  hostsDataSource: DataSource;
  onLoadHosts: () => void;
  onSetHostRole: (hostId: string, role: string) => void;
  onSetVips: () => void;
  onVipFieldChange: (field: string, value: string) => void;
  onBackToInventory: () => void;
  installationStatus: string | null;
  installationProgress: number;
  installationStatusInfo: string | null;
  isStartingInstallation: boolean;
  showInstallConfirm: boolean;
  onShowInstallConfirm: () => void;
  onCancelInstallConfirm: () => void;
  onStartInstallation: () => void;
  onPollProgress: () => void;
};

const ROLE_OPTIONS = [
  { value: "auto-assign", label: "Auto-assign" },
  { value: "master", label: "Control Plane (master)" },
  { value: "worker", label: "Worker" },
];

export function ClusterSetupContent({
  setupClusterId, hosts, isLoadingHosts, discoveryIsoUrl, apiVip, ingressVip, hostsDataSource,
  onLoadHosts, onSetHostRole, onSetVips, onVipFieldChange, onBackToInventory,
  installationStatus, installationProgress, installationStatusInfo, isStartingInstallation, showInstallConfirm,
  onShowInstallConfirm, onCancelInstallConfirm, onStartInstallation, onPollProgress,
}: ClusterSetupContentProps) {
  if (!setupClusterId) {
    return (
      <div className="rhds-step-form">
        <h2 className="rhds-step-form__heading">Cluster Setup</h2>
        <p style={{ color: "var(--rhds-text-muted, #4f5255)" }}>No cluster selected for setup. Create a cluster first or select one from the inventory.</p>
        <ActionButtonAdapter id="ocp-setup-back" variant="secondary" onClick={onBackToInventory}>
          Back to Inventory
        </ActionButtonAdapter>
      </div>
    );
  }

  const rolesAssigned = hosts.filter((h) => h.role !== "auto-assign").length;
  const vipsConfigured = apiVip.trim().length > 0 && ingressVip.trim().length > 0;

  return (
    <div className="rhds-step-form">
      <div style={{ marginBottom: "1rem" }}>
        <ActionButtonAdapter id="ocp-setup-back" variant="secondary" onClick={onBackToInventory}>
          Back to Inventory
        </ActionButtonAdapter>
      </div>

      <h2 className="rhds-step-form__heading">Cluster Setup</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--rhds-text-muted, #4f5255)", marginBottom: "0.5rem" }}>
        Cluster ID: <code style={{ fontSize: "0.8rem" }}>{setupClusterId}</code>
      </p>
      <DataSourceBadge dataSource={hostsDataSource} />

      <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
        Status: {hosts.length} host(s) registered, {rolesAssigned} role(s) assigned, VIPs: {vipsConfigured ? "configured" : "not configured"}
      </p>

      {discoveryIsoUrl && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem" }}>Discovery ISO</h3>
          <p style={{ fontSize: "0.85rem" }}>
            Boot hosts from this ISO to register them with the cluster:{" "}
            <a href={discoveryIsoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#06c" }}>Download ISO</a>
          </p>
        </div>
      )}

      <hr style={{ margin: "1rem 0", border: "none", borderTop: "1px solid var(--rhds-border-subtle, #d2d2d2)" }} />

      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>Registered Hosts</h3>

      {hosts.length === 0 && !isLoadingHosts && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ color: "var(--rhds-text-muted, #4f5255)", marginBottom: "0.5rem" }}>No hosts registered yet. Boot hosts from the discovery ISO, then refresh.</p>
          <ActionButtonAdapter id="ocp-load-hosts" variant="secondary" onClick={onLoadHosts}>
            Load Hosts
          </ActionButtonAdapter>
        </div>
      )}

      {isLoadingHosts && (
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic", marginBottom: "1rem" }}>Loading hosts...</p>
      )}

      {hosts.length > 0 && (
        <>
          <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
            <table className="rhds-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Hostname</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "2px solid var(--rhds-border-subtle, #d2d2d2)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((host) => (
                  <tr key={host.id}>
                    <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{host.hostname}</td>
                    <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>{host.status}</td>
                    <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>
                      <select
                        className="rhds-input"
                        value={host.role}
                        onChange={(e) => onSetHostRole(host.id, e.target.value)}
                        style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--rhds-border-subtle, #d2d2d2)" }}>
                      <span style={{ fontSize: "0.75rem", color: host.role !== "auto-assign" ? "#3e8635" : "var(--rhds-text-muted, #4f5255)" }}>
                        {host.role !== "auto-assign" ? "Assigned" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionButtonAdapter id="ocp-refresh-hosts" variant="secondary" onClick={onLoadHosts}>
            Refresh Hosts
          </ActionButtonAdapter>
        </>
      )}

      <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid var(--rhds-border-subtle, #d2d2d2)" }} />

      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>Virtual IPs</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
        <TextInputAdapter
          id="api-vip"
          label="API VIP"
          value={apiVip}
          placeholder="e.g. 192.168.1.100"
          onChange={(v) => onVipFieldChange("apiVip", v)}
        />
        <TextInputAdapter
          id="ingress-vip"
          label="Ingress VIP"
          value={ingressVip}
          placeholder="e.g. 192.168.1.101"
          onChange={(v) => onVipFieldChange("ingressVip", v)}
        />
      </div>

      <ActionButtonAdapter
        id="ocp-set-vips"
        variant="primary"
        isDisabled={!apiVip.trim() || !ingressVip.trim()}
        onClick={onSetVips}
      >
        Set VIPs
      </ActionButtonAdapter>

      <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid var(--rhds-border-subtle, #d2d2d2)" }} />

      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>Installation</h3>

      <p style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
        Readiness: {rolesAssigned} of {hosts.length} host(s) with roles assigned.
        VIPs: {vipsConfigured ? "configured" : "not configured"}.
        {rolesAssigned > 0 && vipsConfigured ? " Ready to install." : " Complete host and network setup first."}
      </p>

      {installationStatus === "installed" && (
        <div style={{ padding: "0.75rem", backgroundColor: "#e9f5e6", border: "1px solid #3e8635", borderRadius: "4px", marginBottom: "1rem" }}>
          <p style={{ margin: 0, color: "#3e8635", fontWeight: 600 }}>Installation complete!</p>
          {installationStatusInfo && <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>{installationStatusInfo}</p>}
          <div style={{ marginTop: "0.75rem" }}>
            <ActionButtonAdapter id="ocp-install-to-inventory" variant="primary" onClick={onBackToInventory}>
              View in Inventory
            </ActionButtonAdapter>
          </div>
        </div>
      )}

      {installationStatus === "error" && (
        <div style={{ padding: "0.75rem", backgroundColor: "#fce9e8", border: "1px solid #c9190b", borderRadius: "4px", marginBottom: "1rem" }}>
          <p style={{ margin: 0, color: "#c9190b", fontWeight: 600 }}>Installation failed</p>
          {installationStatusInfo && <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>{installationStatusInfo}</p>}
        </div>
      )}

      {installationStatus === "installing" && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
            <span>Installing...</span>
            <span>{installationProgress}%</span>
          </div>
          <div style={{ height: "8px", backgroundColor: "var(--rhds-border-subtle, #d2d2d2)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${installationProgress}%`, backgroundColor: "#06c", borderRadius: "4px", transition: "width 0.3s" }} />
          </div>
          {installationStatusInfo && (
            <p style={{ fontSize: "0.8rem", color: "var(--rhds-text-muted, #4f5255)", margin: "0.5rem 0 0" }}>{installationStatusInfo}</p>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <ActionButtonAdapter id="ocp-poll-progress" variant="secondary" onClick={onPollProgress}>
              Refresh Progress
            </ActionButtonAdapter>
          </div>
        </div>
      )}

      {isStartingInstallation && (
        <p style={{ color: "var(--rhds-text-muted, #4f5255)", fontStyle: "italic" }}>Starting installation...</p>
      )}

      {!installationStatus && !isStartingInstallation && !showInstallConfirm && (
        <ActionButtonAdapter
          id="ocp-start-install"
          variant="primary"
          isDisabled={rolesAssigned === 0 || !vipsConfigured}
          onClick={onShowInstallConfirm}
        >
          Start Installation
        </ActionButtonAdapter>
      )}

      {showInstallConfirm && (
        <div style={{ padding: "0.75rem", backgroundColor: "#fef6e0", border: "1px solid #f0ab00", borderRadius: "4px" }}>
          <p style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>This will begin installing OpenShift. This cannot be undone.</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <ActionButtonAdapter id="ocp-confirm-install" variant="primary" onClick={onStartInstallation}>
              Confirm
            </ActionButtonAdapter>
            <ActionButtonAdapter id="ocp-cancel-install" variant="secondary" onClick={onCancelInstallConfirm}>
              Cancel
            </ActionButtonAdapter>
          </div>
        </div>
      )}
    </div>
  );
}
