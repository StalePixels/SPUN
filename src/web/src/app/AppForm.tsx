"use client";

import { FormError } from "./FormError";
import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/rules";
import { createApp, updateApp, type FormState } from "./actions";
import { Field, FieldRow, RequiredNote } from "./Field";

type Props = { app?: { id: string; title: string; description: string } };

export function AppForm({ app }: Props) {
  const action = app ? updateApp.bind(null, app.id) : createApp;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <RequiredNote />
      <Field controlId="title" label="Title" required help={`Up to ${TITLE_MAX} characters.`}>
        <Form.Control data-testid="app-title" name="title" required maxLength={TITLE_MAX} defaultValue={app?.title} />
      </Field>
      <Field controlId="description" label="Description" help={`Up to ${DESCRIPTION_MAX} characters.`}>
        <Form.Control data-testid="app-description"
          as="textarea"
          rows={3}
          name="description"
          maxLength={DESCRIPTION_MAX}
          defaultValue={app?.description}
        />
      </Field>
      <FieldRow>
        <Button data-testid="app-submit" type="submit" disabled={pending}>
          {app ? "Save" : "Create app"}
        </Button>
      </FieldRow>
    </Form>
  );
}
