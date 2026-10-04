"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { ALIAS_MAX } from "@/lib/rules";
import type { FormState } from "../../../actions";
import { Field, FieldRow } from "../../../Field";
import { FormError } from "../../../FormError";
import { addAdminAlias, moveAdminAlias, removeAdminAlias } from "../../actions";

function AliasRow({ appId, alias }: { appId: string; alias: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    moveAdminAlias.bind(null, appId, alias),
    {},
  );
  return (
    <li className="list-group-item" data-testid={`alias-${alias}`}>
      <FormError problem={state.error} />
      <div className="d-flex flex-wrap align-items-center gap-2">
        <code className="me-auto" data-testid="alias-name">{alias}</code>
        <Form action={formAction} className="d-flex gap-2">
          <Form.Control
            data-testid="alias-move-target"
            name="target"
            placeholder="App id"
            aria-label={`Move ${alias} to app`}
            className="w-auto"
          />
          <Button data-testid="alias-move-submit" type="submit" variant="outline-primary" disabled={pending}>
            Move
          </Button>
        </Form>
        <form action={removeAdminAlias.bind(null, appId, alias)}>
          <Button data-testid="alias-remove" type="submit" variant="outline-danger">
            Remove
          </Button>
        </form>
      </div>
    </li>
  );
}

export function Aliases({ appId, aliases }: { appId: string; aliases: string[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addAdminAlias.bind(null, appId), {});
  return (
    <>
      {aliases.length === 0 ? (
        <p className="text-body-secondary" data-testid="aliases-none">No aliases.</p>
      ) : (
        <ul className="list-group mb-3">
          {aliases.map((alias) => (
            <AliasRow key={alias} appId={appId} alias={alias} />
          ))}
        </ul>
      )}
      <Form action={formAction} data-testid="alias-add">
        <FormError problem={state.error} />
        {state.saved && <Alert variant="success" data-testid="form-saved">Added.</Alert>}
        <Field controlId="alias" label="New alias" help={`a-z, 0-9, - and _, up to ${ALIAS_MAX} characters.`}>
          <Form.Control data-testid="alias-add-name" name="alias" />
        </Field>
        <FieldRow>
          <Button data-testid="alias-add-submit" type="submit" disabled={pending}>
            Add alias
          </Button>
        </FieldRow>
      </Form>
    </>
  );
}
