"use client";

import { ActionForm } from "../../../ActionForm";
import { FormError } from "../../../FormError";
import { useActionState, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { FormState } from "../../../actions";
import { FieldRow } from "../../../Field";
import { saveUser } from "../../actions";
import { MAX_UPLOAD_TEXT, UPLOAD_LIMIT_MB_MAX, UPLOAD_LIMIT_MB_MIN } from "@/lib/rules";

// The form resets after a successful save. The boxes are uncontrolled, so the reset shows the
// stored state, and ownLimit and ownUploadLimit follow the reset for the number fields.
export function UserForm({
  userId,
  appLimit,
  uploadLimitMb,
  isAdmin,
  defaultLimit,
}: {
  userId: string;
  appLimit: string;
  uploadLimitMb: string;
  isAdmin: boolean;
  defaultLimit: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveUser.bind(null, userId),
    {},
  );
  const [ownLimit, setOwnLimit] = useState(appLimit !== "");
  const toggle = useRef<HTMLInputElement>(null);
  const [ownUploadLimit, setOwnUploadLimit] = useState(uploadLimitMb !== "");
  const uploadToggle = useRef<HTMLInputElement>(null);
  return (
    <ActionForm
      action={formAction}
      state={state}
      onReset={() => {
        setOwnLimit(toggle.current?.defaultChecked ?? false);
        setOwnUploadLimit(uploadToggle.current?.defaultChecked ?? false);
      }}
    >
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
          id="ownUploadLimit"
          data-testid="user-own-upload-limit-toggle"
          name="ownUploadLimit"
          label="Own zip size limit"
          ref={uploadToggle}
          defaultChecked={uploadLimitMb !== ""}
          onChange={(event) => setOwnUploadLimit(event.target.checked)}
        />
        <Form.Text as="div">
          Otherwise the default applies: {MAX_UPLOAD_TEXT}.
        </Form.Text>
        <fieldset disabled={!ownUploadLimit} className={`ms-4 mt-2${ownUploadLimit ? "" : " opacity-50"}`}>
          <Form.Group controlId="uploadLimitMb">
            <Form.Label>Largest zip, in MB</Form.Label>
            <Form.Control
              data-testid="user-upload-limit"
              name="uploadLimitMb"
              type="number"
              min={UPLOAD_LIMIT_MB_MIN}
              max={UPLOAD_LIMIT_MB_MAX}
              defaultValue={uploadLimitMb}
              className="w-auto"
            />
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
    </ActionForm>
  );
}
