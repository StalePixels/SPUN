"use client";

import { useActionState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { VERSION_MAX } from "@/lib/rules";
import { ActionForm } from "../../../ActionForm";
import { republishRelease, type UploadState } from "../../../actions";
import { ChangelogField } from "../../../ChangelogField";
import { Field, FieldRow, RequiredNote } from "../../../Field";
import { FormError } from "../../../FormError";

export function RepublishForm({ appId, version }: { appId: string; version: string }) {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(republishRelease.bind(null, appId), {});
  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      <p>
        Makes a new release with the zip of version <code>{version}</code> and the app&apos;s current
        dependencies.
      </p>
      <RequiredNote />
      <Field controlId="republishVersion" label="Version" required help="A version this app has not used yet.">
        <Form.Control
          data-testid="republish-version"
          name="version"
          required
          maxLength={VERSION_MAX}
          pattern="[A-Za-z0-9_.,#\-]+"
        />
      </Field>
      <ChangelogField testId="republish-changelog" controlId="republishChangelog" />
      <FieldRow>
        <Button data-testid="republish-submit" type="submit" disabled={pending}>
          <i className="bi bi-arrow-repeat me-1" />
          Republish
        </Button>
      </FieldRow>
    </ActionForm>
  );
}
