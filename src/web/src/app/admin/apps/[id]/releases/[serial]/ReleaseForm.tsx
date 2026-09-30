"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { VERSION_MAX } from "@/lib/rules";
import type { FormState } from "../../../../../actions";
import { ChangelogField } from "../../../../../ChangelogField";
import { Field, FieldRow, RequiredNote } from "../../../../../Field";
import { FormError } from "../../../../../FormError";
import { saveAdminRelease } from "../../../../actions";

export function ReleaseForm({
  appId,
  serial,
  version,
  releaseDate,
  changelog,
}: {
  appId: string;
  serial: number;
  version: string;
  releaseDate: string;
  changelog: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveAdminRelease.bind(null, appId, serial),
    {},
  );
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <RequiredNote />
      <Field controlId="version" label="Version" required>
        <Form.Control
          data-testid="release-edit-version"
          name="version"
          required
          maxLength={VERSION_MAX}
          defaultValue={version}
        />
      </Field>
      <Field controlId="releaseDate" label="Original release date" required>
        <Form.Control
          data-testid="release-edit-date"
          type="date"
          name="releaseDate"
          required
          defaultValue={releaseDate}
          className="w-auto"
        />
      </Field>
      <ChangelogField testId="release-edit-changelog" defaultValue={changelog} />
      <FieldRow>
        <Button data-testid="release-edit-submit" type="submit" disabled={pending}>
          Save
        </Button>
      </FieldRow>
    </Form>
  );
}
