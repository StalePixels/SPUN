"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import { problemMessage } from "@/lib/messages";
import { FormError } from "../../../FormError";
import { revalidateAdminApp, type RevalidateState } from "../../actions";

export function Revalidate({ appId }: { appId: string }) {
  const [state, formAction, pending] = useActionState<RevalidateState>(
    () => revalidateAdminApp(appId),
    {},
  );
  const result = state.result;
  const passed = result && !result.app && result.releases.every((release) => !release.error);
  return (
    <>
      <p>Runs the checks of an app edit and a release upload again, on the app and on the stored zip of each release that is not deleted. It changes nothing.</p>
      <form action={formAction}>
        <Button data-testid="revalidate-submit" type="submit" variant="outline-primary" disabled={pending}>
          <i className="bi bi-check2-all me-1" />
          Revalidate
        </Button>
      </form>
      <FormError problem={state.error} />
      {result && (
        <div className="mt-3" data-testid="revalidate-result" data-ok={passed ? "true" : "false"}>
          {passed && <Alert variant="success">The app and all its releases pass.</Alert>}
          <ul className="list-group">
            <li className="list-group-item" data-testid="revalidate-app" data-error={result.app?.code ?? ""}>
              <span className="fw-medium">App</span>
              <span className={`ms-2 ${result.app ? "text-danger" : "text-body-secondary"}`}>
                {result.app ? problemMessage(result.app) : "Passes."}
              </span>
            </li>
            {result.releases.map((release) => (
              <li
                key={release.serial}
                className="list-group-item"
                data-testid={`revalidate-release-${release.serial}`}
                data-error={release.error?.code ?? ""}
              >
                <span className="fw-medium">Release {release.serial}</span>
                <span className="text-body-secondary ms-2">Version {release.version}</span>
                <span className={`ms-2 ${release.error ? "text-danger" : "text-body-secondary"}`}>
                  {release.error ? problemMessage(release.error) : "Passes."}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
