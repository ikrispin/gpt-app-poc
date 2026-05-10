import type { ClusterCreationResult, ClusterCreatorFormState, ClusterDetailInfo, ClusterEvent, ClusterRow, DataSource, HostInfo, OcpAdminStep, OcpAdminView, StatusVariant } from "./ocp-state";
import { StatusDisplayAdapter } from "../ui/status-display-adapter";
import { ClusterInventoryContent, ClusterDetailContent, ClusterCreatorContent, ClusterSetupContent } from "./ocp-step-content";

type OcpAdminAppProps = {
  view: OcpAdminView;
  currentStep: OcpAdminStep;
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
  onNavigateCreator: () => void;
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
  const { view, statusMessage, statusVariant } = props;

  const content = renderViewContent(props);

  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">OpenShift Cluster Administration</h1>
      </header>

      {statusMessage && (
        <StatusDisplayAdapter message={statusMessage} variant={statusVariant} />
      )}

      {view === "full" ? renderFullLayout(props) : (
        <section className="rhds-shell__wizard">
          <div className="rhds-step-panel">{content}</div>
        </section>
      )}
    </div>
  );
}

function renderViewContent(props: OcpAdminAppProps) {
  const { view } = props;

  if (view === "inventory") {
    return (
      <ClusterInventoryContent
        clusters={props.clusters}
        isLoading={props.isLoading}
        dataSource={props.dataSource}
        onLoadClusters={props.onLoadClusters}
        onSelectCluster={props.onSelectCluster}
      />
    );
  }

  if (view === "detail") {
    return (
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
    );
  }

  if (view === "creator") {
    return (
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
    );
  }

  if (view === "setup") {
    return (
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
    );
  }

  return null;
}

function renderFullLayout(props: OcpAdminAppProps) {
  return (
    <section className="rhds-shell__wizard" aria-label="Administration sections">
      <nav className="rhds-step-nav" aria-label="Section navigation">
        <button type="button" className={`rhds-step-nav__item ${props.currentStep === "cluster_inventory" ? "rhds-step-nav__item--active" : ""}`} aria-current={props.currentStep === "cluster_inventory" ? "page" : undefined} onClick={props.onNavigateInventory}>
          Cluster Inventory
        </button>
        <button type="button" className={`rhds-step-nav__item ${props.currentStep === "cluster_creator" ? "rhds-step-nav__item--active" : ""}`} aria-current={props.currentStep === "cluster_creator" ? "page" : undefined} onClick={props.onNavigateCreator}>
          Create Cluster
        </button>
        <button type="button" className={`rhds-step-nav__item ${props.currentStep === "cluster_setup" ? "rhds-step-nav__item--active" : ""}`} aria-current={props.currentStep === "cluster_setup" ? "page" : undefined} onClick={() => props.onNavigateSetup(props.setupClusterId ?? "")}>
          Cluster Setup
        </button>
      </nav>
      <div className="rhds-step-panel">
        {props.currentStep === "cluster_inventory" && props.selectedClusterId !== null && renderViewContent({ ...props, view: "detail" })}
        {props.currentStep === "cluster_inventory" && props.selectedClusterId === null && renderViewContent({ ...props, view: "inventory" })}
        {props.currentStep === "cluster_creator" && renderViewContent({ ...props, view: "creator" })}
        {props.currentStep === "cluster_setup" && renderViewContent({ ...props, view: "setup" })}
      </div>
    </section>
  );
}
