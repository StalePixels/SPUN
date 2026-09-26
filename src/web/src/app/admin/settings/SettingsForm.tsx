"use client";

import { FormError } from "../../FormError";
import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../actions";
import { Field, FieldRow } from "../../Field";
import { saveSettings } from "../actions";

export function SettingsForm({ appLimit, appLimitHelp }: { appLimit: string; appLimitHelp: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSettings, {});
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <Field controlId="default_app_limit" label="Default app limit" help={appLimitHelp}>
        <Form.Control data-testid="setting-default-app-limit"
          name="default_app_limit"
          type="number"
          min={0}
          defaultValue={appLimit}
          className="w-auto"
        />
      </Field>
      <FieldRow>
        <Button data-testid="settings-submit" type="submit" disabled={pending}>
          Save
        </Button>
      </FieldRow>
    </Form>
  );
}
