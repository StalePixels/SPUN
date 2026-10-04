"use client";

import { FormError } from "../../../FormError";
import { useActionState, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../../actions";
import { FieldRow } from "../../../Field";
import { saveUser } from "../../actions";

// React resets the form after each action. The box is uncontrolled, so the reset shows the
// stored state, and ownLimit follows the reset for the number field.
export function UserForm({
  userId,
  appLimit,
  isAdmin,
  defaultLimit,
}: {
  userId: string;
  appLimit: string;
  isAdmin: boolean;
  defaultLimit: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveUser.bind(null, userId),
    {},
  );
  const [ownLimit, setOwnLimit] = useState(appLimit !== "");
  const toggle = useRef<HTMLInputElement>(null);
  return (
    <Form action={formAction} onReset={() => setOwnLimit(toggle.current?.defaultChecked ?? false)}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <FieldRow>
        <Form.Check
          type="checkbox"
          id="ownLimit"
          data-testid="user-own-limit-toggle"
          name="ownLimit"
          label="Own app limit"
          ref={toggle}
          defaultChecked={appLimit !== ""}
          onChange={(event) => setOwnLimit(event.target.checked)}
        />
        <Form.Text as="div">
          Otherwise the default applies: {defaultLimit}.
        </Form.Text>
        <fieldset disabled={!ownLimit} className={`ms-4 mt-2${ownLimit ? "" : " opacity-50"}`}>
          <Form.Group controlId="appLimit">
            <Form.Label>Number of apps</Form.Label>
            <Form.Control data-testid="user-app-limit" name="appLimit" type="number" min={0} defaultValue={appLimit} className="w-auto" />
          </Form.Group>
        </fieldset>
      </FieldRow>
      <FieldRow>
        <Form.Check
          type="checkbox"
          id="isAdmin"
          data-testid="user-is-admin"
          name="isAdmin"
          label="Admin"
          defaultChecked={isAdmin}
        />
      </FieldRow>
      <FieldRow>
        <Button data-testid="user-submit" type="submit" disabled={pending}>
          Save
        </Button>
      </FieldRow>
    </Form>
  );
}
