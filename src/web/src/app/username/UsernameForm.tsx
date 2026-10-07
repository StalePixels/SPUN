"use client";

import { FormError } from "../FormError";
import { useActionState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { USERNAME_MAX, USERNAME_UI_MIN } from "@/lib/rules";
import { chooseUsername, type FormState } from "../actions";
import { Field, FieldRow } from "../Field";

export function UsernameForm({ termsId }: { termsId: number | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(chooseUsername, {});
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      <Field
        controlId="username"
        label="Username"
        required
        help={`${USERNAME_UI_MIN} to ${USERNAME_MAX} letters, numbers, - or _. You cannot change it later.`}
      >
        <Form.Control
          data-testid="username-field"
          name="username"
          required
          minLength={USERNAME_UI_MIN}
          maxLength={USERNAME_MAX}
          pattern="[A-Za-z0-9_\-]+"
        />
      </Field>
      {termsId !== null && (
        <FieldRow>
          <input type="hidden" name="termsId" value={termsId} />
          <Form.Check
            id="acceptTerms"
            data-testid="username-accept-terms"
            name="acceptTerms"
            required
            label="I accept the terms and conditions above."
          />
        </FieldRow>
      )}
      <FieldRow>
        <Button data-testid="username-submit" type="submit" disabled={pending}>
          Save username
        </Button>
      </FieldRow>
    </Form>
  );
}
