import type { ClusterCreationResult, ClusterCreatorFormState, ClusterDetailInfo, ClusterEvent, ClusterRow, DataSource, HostInfo, OcpAdminStep, PrerequisiteCheckResult, StatusVariant } from "./ocp-state";
import { StatusDisplayAdapter } from "../ui/status-display-adapter";
import { PrerequisitesContent, ClusterInventoryContent, ClusterDetailContent, ClusterCreatorContent, ClusterSetupContent } from "./ocp-step-content";

type OcpAdminAppProps = {
  currentStep: OcpAdminStep;
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
  isLoading: boolean;
  prerequisiteResults: PrerequisiteCheckResult | null;
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
  onNavigatePrerequisites: () => void;
  onNavigateInventory: () => void;
  onNavigateCreator: () => void;
  onLoadClusters: () => void;
  onCheckPrerequisites: () => void;
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
};

export function OcpAdminApp({
  currentStep,
  statusMessage,
  statusVariant,
  clusters,
  isLoading,
  prerequisiteResults,
  dataSource,
  selectedClusterId,
  clusterDetail,
  isLoadingDetail,
  events,
  isLoadingEvents,
  eventsDataSource,
  logsDownloadUrl,
  isLoadingLogsUrl,
  creatorForm,
  isCreating,
  creationResult,
  creationError,
  onNavigatePrerequisites,
  onNavigateInventory,
  onNavigateCreator,
  onLoadClusters,
  onCheckPrerequisites,
  onSelectCluster,
  onBackToInventory,
  onLoadEvents,
  onGetLogsUrl,
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
}: OcpAdminAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">OpenShift Cluster Administration</h1>
      </header>

      {statusMessage && (
        <StatusDisplayAdapter message={statusMessage} variant={statusVariant} />
      )}

      <section className="rhds-shell__wizard" aria-label="Administration sections">
        <nav className="rhds-step-nav" aria-label="Section navigation">
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "prerequisites" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "prerequisites" ? "page" : undefined}
            onClick={onNavigatePrerequisites}
          >
            Prerequisites
          </button>
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "cluster_inventory" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "cluster_inventory" ? "page" : undefined}
            onClick={onNavigateInventory}
          >
            Cluster Inventory
          </button>
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "cluster_creator" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "cluster_creator" ? "page" : undefined}
            onClick={onNavigateCreator}
          >
            Create Cluster
          </button>
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "cluster_setup" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "cluster_setup" ? "page" : undefined}
            onClick={() => onNavigateSetup(setupClusterId ?? "")}
          >
            Cluster Setup
          </button>
        </nav>
        <div className="rhds-step-panel">
          {currentStep === "prerequisites" && (
            <PrerequisitesContent
              onContinue={onNavigateInventory}
              prerequisiteResults={prerequisiteResults}
              onCheckPrerequisites={onCheckPrerequisites}
            />
          )}
          {currentStep === "cluster_inventory" && selectedClusterId !== null && (
            <ClusterDetailContent
              detail={clusterDetail}
              isLoading={isLoadingDetail}
              dataSource={dataSource}
              onBack={onBackToInventory}
              events={events}
              isLoadingEvents={isLoadingEvents}
              eventsDataSource={eventsDataSource}
              logsDownloadUrl={logsDownloadUrl}
              isLoadingLogsUrl={isLoadingLogsUrl}
              onLoadEvents={onLoadEvents}
              onGetLogsUrl={onGetLogsUrl}
            />
          )}
          {currentStep === "cluster_inventory" && selectedClusterId === null && (
            <ClusterInventoryContent
              clusters={clusters}
              isLoading={isLoading}
              dataSource={dataSource}
              onLoadClusters={onLoadClusters}
              onSelectCluster={onSelectCluster}
            />
          )}
          {currentStep === "cluster_setup" && (
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
              onBackToInventory={() => { onBackToInventory(); onNavigateInventory(); }}
            />
          )}
          {currentStep === "cluster_creator" && (
            <ClusterCreatorContent
              formState={creatorForm}
              isCreating={isCreating}
              creationResult={creationResult}
              creationError={creationError}
              onFieldChange={onCreatorFieldChange}
              onSubmit={onCreateCluster}
              onBackToInventory={() => { onBackToInventory(); onNavigateInventory(); }}
              onNavigateSetup={onNavigateSetup}
            />
          )}
        </div>
      </section>
    </div>
  );
}
