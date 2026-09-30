"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { saveChangelog, type FormState } from "../../../../../actions";
import { ChangelogField } from "../../../../../ChangelogField";
import { FieldRow } from "../../../../../Field";
import { FormError } from "../../../../../FormError";

export function ChangelogForm({ appId, serial, changelog }: { appId: string; serial: number; changelog: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveChangelog.bind(null, appId, serial),
    {},
  );
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <ChangelogField testId="changelog-edit" defaultValue={changelog} />
      <FieldRow>
        <Button data-testid="changelog-submit" type="submit" disabled={pending}>
          Save
        </Button>
      </FieldRow>
    </Form>
  );
}
