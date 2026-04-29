import type { ClusterRow, OcpAdminStep, StatusVariant } from "./ocp-state";
import { StatusDisplayAdapter } from "../ui/status-display-adapter";
import { PrerequisitesContent, ClusterInventoryContent } from "./ocp-step-content";

type OcpAdminAppProps = {
  currentStep: OcpAdminStep;
  statusMessage: string;
  statusVariant: StatusVariant;
  clusters: ClusterRow[];
  onNavigatePrerequisites: () => void;
  onNavigateInventory: () => void;
};

export function OcpAdminApp({
  currentStep,
  statusMessage,
  statusVariant,
  clusters,
  onNavigatePrerequisites,
  onNavigateInventory,
}: OcpAdminAppProps) {
  return (
    <div className="rhds-shell">
      <header className="rhds-shell__header">
        <h1 className="rhds-shell__title">OpenShift Cluster Administration</h1>
      </header>

      {statusMessage && (
        <StatusDisplayAdapter message={statusMessage} variant={statusVariant} />
      )}

      <section className="rhds-shell__wizard" aria-label="Workflow steps">
        <nav className="rhds-step-nav" aria-label="Workflow step navigation">
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "prerequisites" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "prerequisites" ? "step" : undefined}
            onClick={onNavigatePrerequisites}
          >
            Step 1: Prerequisites
          </button>
          <button
            type="button"
            className={`rhds-step-nav__item ${currentStep === "cluster_inventory" ? "rhds-step-nav__item--active" : ""}`}
            aria-current={currentStep === "cluster_inventory" ? "step" : undefined}
            onClick={onNavigateInventory}
          >
            Step 2: Cluster Inventory
          </button>
        </nav>
        <div className="rhds-step-panel">
          {currentStep === "prerequisites" && (
            <PrerequisitesContent onContinue={onNavigateInventory} />
          )}
          {currentStep === "cluster_inventory" && (
            <ClusterInventoryContent clusters={clusters} />
          )}
        </div>
      </section>
    </div>
  );
}
