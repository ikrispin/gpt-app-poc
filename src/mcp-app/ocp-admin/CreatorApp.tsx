import type { ClusterCreationResult, ClusterCreatorFormState, DataSource, HostInfo, StatusVariant } from "./ocp-state";
import { ClusterCreatorContent, ClusterSetupContent } from "./ocp-step-content";

export type CreatorAppProps = {
  statusMessage: string;
  statusVariant: StatusVariant;
  creatorForm: ClusterCreatorFormState;
  isCreating: boolean;
  creationResult: ClusterCreationResult | null;
  creationError: string | null;
  onCreatorFieldChange: (field: string, value: string) => void;
  onCreateCluster: () => void;
  onNavigateSetup: (clusterId: string) => void;
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

export function CreatorApp({
  statusMessage,
  statusVariant,
  creatorForm,
  isCreating,
  creationResult,
  creationError,
  onCreatorFieldChange,
  onCreateCluster,
  onNavigateSetup,
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
}: CreatorAppProps) {
  const showSetup = setupClusterId !== null;

  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">{showSetup ? "Cluster Setup" : "Create Cluster"}</h1>
      </header>

      {statusMessage && (
        <div className={`rhds-status rhds-status--${statusVariant}`} style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>{statusMessage}</p>
        </div>
      )}

      <div className="rhds-step-panel">
        {showSetup ? (
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
        ) : (
          <ClusterCreatorContent
            formState={creatorForm}
            isCreating={isCreating}
            creationResult={creationResult}
            creationError={creationError}
            onFieldChange={onCreatorFieldChange}
            onSubmit={onCreateCluster}
            onNavigateInventory={() => {}}
            onNavigateSetup={onNavigateSetup}
          />
        )}
      </div>
    </div>
  );
}
