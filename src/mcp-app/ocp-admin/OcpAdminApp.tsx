import type { ClusterCreationResult, ClusterCreatorFormState, ClusterDetailInfo, ClusterEvent, ClusterRow, DataSource, HostInfo, OcpAdminView, StatusVariant } from "./ocp-state";
import { StatusDisplayAdapter } from "../ui/status-display-adapter";
import { ClusterInventoryContent, ClusterDetailContent, ClusterCreatorContent, ClusterSetupContent } from "./ocp-step-content";

type OcpAdminAppProps = {
  view: OcpAdminView;
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
  isLoading: boolean;
  dataSource: DataSource;
  selectedClusterId: string | null;
  clusterDetail: ClusterDetailInfo | null;
  isLoadingDetail: boolean;
  events: ClusterEvent[];
  isLoadingEvents: boolean;
  eventsDataSource: DataSource;
  logsDownloadUrl: string | null;
  isLoadingLogsUrl: boolean;
  creatorForm: ClusterCreatorFormState;
  isCreating: boolean;
  creationResult: ClusterCreationResult | null;
  creationError: string | null;
  onNavigateInventory: () => void;
  onLoadClusters: () => void;
  onSelectCluster: (clusterId: string) => void;
  onBackToInventory: () => void;
  onLoadEvents: () => void;
  onGetLogsUrl: () => void;
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

export function OcpAdminApp(props: OcpAdminAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">OpenShift Cluster Administration</h1>
      </header>

      {props.statusMessage && (
        <StatusDisplayAdapter message={props.statusMessage} variant={props.statusVariant} />
      )}

      <section className="rhds-shell__wizard">
        <div className="rhds-step-panel">
          {props.view === "inventory" && (
            <ClusterInventoryContent
              clusters={props.clusters}
              isLoading={props.isLoading}
              dataSource={props.dataSource}
              onLoadClusters={props.onLoadClusters}
              onSelectCluster={props.onSelectCluster}
            />
          )}
          {props.view === "detail" && (
            <ClusterDetailContent
              detail={props.clusterDetail}
              isLoading={props.isLoadingDetail}
              dataSource={props.dataSource}
              onBack={props.onBackToInventory}
              events={props.events}
              isLoadingEvents={props.isLoadingEvents}
              eventsDataSource={props.eventsDataSource}
              logsDownloadUrl={props.logsDownloadUrl}
              isLoadingLogsUrl={props.isLoadingLogsUrl}
              onLoadEvents={props.onLoadEvents}
              onGetLogsUrl={props.onGetLogsUrl}
            />
          )}
          {props.view === "creator" && (
            <ClusterCreatorContent
              formState={props.creatorForm}
              isCreating={props.isCreating}
              creationResult={props.creationResult}
              creationError={props.creationError}
              onFieldChange={props.onCreatorFieldChange}
              onSubmit={props.onCreateCluster}
              onNavigateInventory={props.onNavigateInventory}
              onNavigateSetup={props.onNavigateSetup}
            />
          )}
          {props.view === "setup" && (
            <ClusterSetupContent
              setupClusterId={props.setupClusterId}
              hosts={props.hosts}
              isLoadingHosts={props.isLoadingHosts}
              discoveryIsoUrl={props.discoveryIsoUrl}
              apiVip={props.apiVip}
              ingressVip={props.ingressVip}
              hostsDataSource={props.hostsDataSource}
              onLoadHosts={props.onLoadHosts}
              onSetHostRole={props.onSetHostRole}
              onSetVips={props.onSetVips}
              onVipFieldChange={props.onVipFieldChange}
              onBackToInventory={() => { props.onBackToInventory(); props.onNavigateInventory(); }}
              installationStatus={props.installationStatus}
              installationProgress={props.installationProgress}
              installationStatusInfo={props.installationStatusInfo}
              isStartingInstallation={props.isStartingInstallation}
              showInstallConfirm={props.showInstallConfirm}
              onShowInstallConfirm={props.onShowInstallConfirm}
              onCancelInstallConfirm={props.onCancelInstallConfirm}
              onStartInstallation={props.onStartInstallation}
              onPollProgress={props.onPollProgress}
            />
          )}
        </div>
      </section>
    </div>
  );
}
