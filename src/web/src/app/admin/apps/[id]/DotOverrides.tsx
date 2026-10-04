"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../../actions";
import { Field, FieldRow } from "../../../Field";
import { FormError } from "../../../FormError";
import { addAdminDotOverride, removeAdminDotOverride } from "../../actions";

export function DotOverrides({ appId, names }: { appId: string; names: string[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addAdminDotOverride.bind(null, appId), {});
  return (
    <>
      {names.length === 0 ? (
        <p className="text-body-secondary" data-testid="dot-overrides-none">No overrides.</p>
      ) : (
        <ul className="list-group mb-3">
          {names.map((name) => (
            <li key={name} className="list-group-item d-flex align-items-center gap-2" data-testid={`dot-override-${name}`}>
              <code className="me-auto" data-testid="dot-override-name">{name}</code>
              <form action={removeAdminDotOverride.bind(null, appId, name)}>
                <Button data-testid="dot-override-remove" type="submit" variant="outline-danger">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Form action={formAction} data-testid="dot-override-add">
        <FormError problem={state.error} />
        {state.saved && <Alert variant="success" data-testid="form-saved">Added.</Alert>}
        <Field
          controlId="dotOverride"
          label="Reserved dot command"
          help="A name the Next ships, or spun. This app's releases may then put it in C:/dot."
        >
          <Form.Control data-testid="dot-override-add-name" name="name" />
        </Field>
        <FieldRow>
          <Button data-testid="dot-override-add-submit" type="submit" disabled={pending}>
            Add override
          </Button>
        </FieldRow>
      </Form>
    </>
  );
}
