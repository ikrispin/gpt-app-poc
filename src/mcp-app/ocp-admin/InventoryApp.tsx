import type { ClusterDetailInfo, ClusterEvent, ClusterRow, DataSource, StatusVariant } from "./ocp-state";
import { ClusterInventoryContent, ClusterDetailContent } from "./ocp-step-content";

export type InventoryAppProps = {
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
  onLoadClusters: () => void;
  onSelectCluster: (clusterId: string) => void;
  onSetupCluster: (clusterId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onLookupCluster: () => void;
  searchQuery: string;
  isLookingUp: boolean;
  lookupError: string | null;
  onBackToInventory: () => void;
  onLoadEvents: () => void;
  onGetLogsUrl: () => void;
};

export function InventoryApp({
  statusMessage,
  statusVariant,
  clusters,
  isLoading,
  dataSource,
  selectedClusterId,
  clusterDetail,
  isLoadingDetail,
  events,
  isLoadingEvents,
  eventsDataSource,
  logsDownloadUrl,
  isLoadingLogsUrl,
  onLoadClusters,
  onSelectCluster,
  onSetupCluster,
  onSearchQueryChange,
  onLookupCluster,
  searchQuery,
  isLookingUp,
  lookupError,
  onBackToInventory,
  onLoadEvents,
  onGetLogsUrl,
}: InventoryAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">Cluster Inventory</h1>
      </header>

      {statusMessage && (
        <div className={`rhds-status rhds-status--${statusVariant}`} style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>{statusMessage}</p>
        </div>
      )}

      <div className="rhds-step-panel">
        {selectedClusterId !== null ? (
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
        ) : (
          <ClusterInventoryContent
            clusters={clusters}
            isLoading={isLoading}
            dataSource={dataSource}
            onLoadClusters={onLoadClusters}
            onSelectCluster={onSelectCluster}
            onSetupCluster={onSetupCluster}
            onSearchQueryChange={onSearchQueryChange}
            onLookupCluster={onLookupCluster}
            searchQuery={searchQuery}
            isLookingUp={isLookingUp}
            lookupError={lookupError}
          />
        )}
      </div>
    </div>
  );
}
