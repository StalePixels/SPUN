"use client";

import { useActionState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../../actions";
import { FormError } from "../../../FormError";
import { disableAdminUser, enableAdminUser } from "../../actions";

export function UserStatus({ userId, disabled }: { userId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    (disabled ? enableAdminUser : disableAdminUser).bind(null, userId),
    {},
  );
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {disabled ? (
        <Button data-testid="user-enable" type="submit" variant="outline-primary" disabled={pending}>
          <i className="bi bi-person-check me-1" />
          Enable
        </Button>
      ) : (
        <Button data-testid="user-disable" type="submit" variant="outline-danger" disabled={pending}>
          <i className="bi bi-person-slash me-1" />
          Disable
        </Button>
      )}
    </Form>
  );
}
