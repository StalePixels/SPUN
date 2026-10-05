export function AppState({ appPublic }: { appPublic: boolean }) {
  return appPublic ? (
    <span className="badge text-bg-success" data-testid="app-state" data-state="public">
      <i className="bi bi-check-circle me-1" />
      Public
    </span>
  ) : (
    <span className="badge text-bg-warning" data-testid="app-state" data-state="noRelease">
      <i className="bi bi-exclamation-triangle me-1" />
      No live release
    </span>
  );
}

export type FeatureState = "scheduled" | "live" | "past" | "unpublished" | "hidden";

export function featureState(
  feature: { id: number; published: boolean; publishAt: Date | null; appPublic: boolean },
  liveId: number | null,
  now: Date,
): FeatureState {
  if (!feature.published) return "unpublished";
  if (!feature.appPublic) return "hidden";
  if (feature.publishAt && feature.publishAt > now) return "scheduled";
  return feature.id === liveId ? "live" : "past";
}

const STATES: Record<FeatureState, { label: string; className: string; icon: string }> = {
  scheduled: { label: "Scheduled", className: "text-bg-info", icon: "bi-clock" },
  live: { label: "Live", className: "text-bg-success", icon: "bi-broadcast" },
  past: { label: "Past", className: "text-bg-secondary", icon: "bi-clock-history" },
  unpublished: { label: "Unpublished", className: "text-bg-light border", icon: "bi-eye-slash" },
  hidden: { label: "Hidden: the app is not public", className: "text-bg-warning", icon: "bi-exclamation-triangle" },
};

export function FeatureStateBadge({ state }: { state: FeatureState }) {
  const { label, className, icon } = STATES[state];
  return (
    <span className={`badge ${className}`} data-testid="feature-state" data-state={state}>
      <i className={`bi ${icon} me-1`} />
      {label}
    </span>
  );
}
