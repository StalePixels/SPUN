import Alert from "react-bootstrap/Alert";
import { problemMessage } from "@/lib/messages";
import type { Problem } from "@/lib/problems";

export function FormError({ problem }: { problem?: Problem }) {
  if (!problem) {
    return null;
  }
  return (
    <Alert variant="danger" data-testid="form-error" data-error={problem.code}>
      {problemMessage(problem)}
    </Alert>
  );
}
