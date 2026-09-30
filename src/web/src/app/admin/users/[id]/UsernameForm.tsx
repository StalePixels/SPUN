"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { USERNAME_MAX } from "@/lib/rules";
import type { FormState } from "../../../actions";
import { Field, FieldRow } from "../../../Field";
import { FormError } from "../../../FormError";
import { renameAdminUser } from "../../actions";

export function UsernameForm({ userId, username }: { userId: string; username: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    renameAdminUser.bind(null, userId),
    {},
  );
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <Field
        controlId="username"
        label="Username"
        help="The download paths of this user's apps change with it."
      >
        <Form.Control data-testid="user-username" name="username" maxLength={USERNAME_MAX} defaultValue={username} />
      </Field>
      <FieldRow>
        <Button data-testid="user-rename-submit" type="submit" disabled={pending}>
          Rename
        </Button>
      </FieldRow>
    </Form>
  );
}
