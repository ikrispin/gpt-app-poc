import type { DataSource, HostInfo, StatusVariant } from "./ocp-state";
import { ClusterSetupContent } from "./ocp-step-content";

export type SetupAppProps = {
  statusMessage: string;
  statusVariant: StatusVariant;
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

export function SetupApp({
  statusMessage,
  statusVariant,
  setupClusterId,
  hosts,
  isLoadingHosts,
  discoveryIsoUrl,
  apiVip,
  ingressVip,
  hostsDataSource,
  onLoadHosts,
  onSetHostRole,
  onSetVips,
  onVipFieldChange,
  installationStatus,
  installationProgress,
  installationStatusInfo,
  isStartingInstallation,
  showInstallConfirm,
  onShowInstallConfirm,
  onCancelInstallConfirm,
  onStartInstallation,
  onPollProgress,
}: SetupAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">Cluster Setup</h1>
      </header>

      {statusMessage && (
        <div className={`rhds-status rhds-status--${statusVariant}`} style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>{statusMessage}</p>
        </div>
      )}

      <div className="rhds-step-panel">
        <ClusterSetupContent
          setupClusterId={setupClusterId}
          hosts={hosts}
          isLoadingHosts={isLoadingHosts}
          discoveryIsoUrl={discoveryIsoUrl}
          apiVip={apiVip}
          ingressVip={ingressVip}
          hostsDataSource={hostsDataSource}
          onLoadHosts={onLoadHosts}
          onSetHostRole={onSetHostRole}
          onSetVips={onSetVips}
          onVipFieldChange={onVipFieldChange}
          onBackToInventory={() => {}}
          installationStatus={installationStatus}
          installationProgress={installationProgress}
          installationStatusInfo={installationStatusInfo}
          isStartingInstallation={isStartingInstallation}
          showInstallConfirm={showInstallConfirm}
          onShowInstallConfirm={onShowInstallConfirm}
          onCancelInstallConfirm={onCancelInstallConfirm}
          onStartInstallation={onStartInstallation}
          onPollProgress={onPollProgress}
        />
      </div>
    </div>
  );
}
