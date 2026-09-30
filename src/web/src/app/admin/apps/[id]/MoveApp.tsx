"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../../actions";
import { Field, FieldRow } from "../../../Field";
import { FormError } from "../../../FormError";
import { moveAdminApp } from "../../actions";

export function MoveApp({
  appId,
  ownerId,
  users,
}: {
  appId: string;
  ownerId: string;
  users: { id: string; username: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    moveAdminApp.bind(null, appId),
    {},
  );
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Moved.</Alert>}
      <Field controlId="userId" label="New owner">
        <Form.Select data-testid="move-user" name="userId" defaultValue={ownerId} className="w-auto">
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </Form.Select>
      </Field>
      <FieldRow>
        <Button data-testid="move-submit" type="submit" disabled={pending}>
          Move
        </Button>
      </FieldRow>
    </Form>
  );
}
