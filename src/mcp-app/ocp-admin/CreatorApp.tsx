import type { ClusterCreationResult, ClusterCreatorFormState, DataSource, StatusVariant } from "./ocp-state";
import { ClusterCreatorContent } from "./ocp-step-content";

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
}: CreatorAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">Create Cluster</h1>
      </header>

      {statusMessage && (
        <div className={`rhds-status rhds-status--${statusVariant}`} style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>{statusMessage}</p>
        </div>
      )}

      <div className="rhds-step-panel">
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
      </div>
    </div>
  );
}
