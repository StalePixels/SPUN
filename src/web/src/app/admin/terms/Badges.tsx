import Badge from "react-bootstrap/Badge";
import type { TermsState } from "@/lib/rules";

const STATES: Record<TermsState, { label: string; bg: string; icon: string }> = {
  draft: { label: "Draft", bg: "light", icon: "bi-pencil" },
  scheduled: { label: "Scheduled", bg: "info", icon: "bi-clock" },
  current: { label: "Current", bg: "success", icon: "bi-broadcast" },
  past: { label: "Past", bg: "secondary", icon: "bi-clock-history" },
};

export function TermsStateBadge({ state }: { state: TermsState }) {
  const { label, bg, icon } = STATES[state];
  const light = bg === "light";
  return (
    <Badge
      bg={bg}
      text={light ? "dark" : undefined}
      className={light ? "border" : undefined}
      data-testid="terms-state"
      data-state={state}
    >
      <i className={`bi ${icon} me-1`} />
      {label}
    </Badge>
  );
}
