"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { KEY_NAME_MAX } from "@/lib/rules";
import { Field, FieldRow } from "../Field";
import { FormError } from "../FormError";
import { makeKey, type KeyFormState } from "./actions";

export function KeyForm() {
  const [state, formAction, pending] = useActionState<KeyFormState, FormData>(makeKey, {});
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.key && (
        <Alert variant="warning" data-testid="key-made">
          <p>Copy this key now. SPUN shows it only once, and cannot show it again.</p>
          <code className="d-block text-break user-select-all" data-testid="key-secret">
            {state.key}
          </code>
        </Alert>
      )}
      <Field controlId="key-name" label="Name" required help={`Up to ${KEY_NAME_MAX} characters, to tell your keys apart.`}>
        <Form.Control data-testid="key-name-field" name="name" required maxLength={KEY_NAME_MAX} />
      </Field>
      <FieldRow>
        <Button data-testid="key-submit" type="submit" disabled={pending}>
          Make key
        </Button>
      </FieldRow>
    </Form>
  );
}
