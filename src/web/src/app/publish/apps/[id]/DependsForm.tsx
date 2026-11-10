"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { DEPENDS_MAX } from "@/lib/rules";
import { ActionForm } from "../../../ActionForm";
import { saveDepends, type FormState } from "../../../actions";
import { Field, FieldRow } from "../../../Field";
import { FormError } from "../../../FormError";

export function DependsForm({
  appId,
  depends,
  save,
}: {
  appId: string;
  depends: string[];
  save?: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(save ?? saveDepends.bind(null, appId), {});
  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <p>
        The apps that SPUN on the Next installs or updates before this app. Each release keeps the list as it is
        when the release is made, so a change here reaches the Next only with the next release.
      </p>
      <Field
        controlId="depends"
        label="App ids"
        help={`The ids of other apps on SPUN, with spaces between them. Up to ${DEPENDS_MAX}.`}
      >
        <Form.Control data-testid="depends-input" name="depends" defaultValue={depends.join(" ")} />
      </Field>
      <FieldRow>
        <Button data-testid="depends-submit" type="submit" disabled={pending}>
          Save dependencies
        </Button>
      </FieldRow>
    </ActionForm>
  );
}
