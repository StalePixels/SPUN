"use client";

import { FormError } from "../../../FormError";
import { useActionState, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_TEXT, VERSION_MAX } from "@/lib/rules";
import { uploadRelease, type UploadState } from "../../../actions";
import { ChangelogField } from "../../../ChangelogField";
import { Field, FieldRow, RequiredNote } from "../../../Field";

export function UploadForm({
  appId,
  upload,
}: {
  appId: string;
  upload?: (prev: UploadState, formData: FormData) => Promise<UploadState>;
}) {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    upload ?? uploadRelease.bind(null, appId),
    {},
  );
  const [tooLarge, setTooLarge] = useState(false);
  const [historic, setHistoric] = useState(false);
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      <RequiredNote />
      <Field
        controlId="version"
        label="Version"
        required
        help={
          <>
            For example <code>1.1-beta</code>. No spaces.
          </>
        }
      >
        <Form.Control data-testid="upload-version" name="version" required maxLength={VERSION_MAX} pattern="[A-Za-z0-9_.,#\-]+" />
      </Field>
      <FieldRow>
        <Form.Check data-testid="upload-historic"
          type="checkbox"
          id="historic"
          label="Historic release"
          checked={historic}
          onChange={(event) => setHistoric(event.target.checked)}
        />
        <fieldset disabled={!historic} className={`ms-4 mt-2${historic ? "" : " opacity-50"}`}>
          <Form.Group controlId="releaseDate">
            <Form.Label>Original release date</Form.Label>
            <Form.Control data-testid="upload-date" type="date" name="releaseDate" className="w-auto" />
            <Form.Text>Leave empty to use the upload date.</Form.Text>
          </Form.Group>
        </fieldset>
      </FieldRow>
      <ChangelogField testId="upload-changelog" />
      <Field controlId="file" label="Zip file" required help={`Up to ${MAX_UPLOAD_TEXT}.`}>
        <Form.Control data-testid="upload-file"
          type="file"
          name="file"
          accept=".zip"
          required
          isInvalid={tooLarge}
          onChange={(event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            setTooLarge(!!file && file.size > MAX_UPLOAD_BYTES);
          }}
        />
        <Form.Control.Feedback type="invalid" data-testid="upload-too-large">
          The file is larger than {MAX_UPLOAD_TEXT}.
        </Form.Control.Feedback>
      </Field>
      <FieldRow>
        <Button data-testid="upload-submit" type="submit" disabled={pending || tooLarge}>
          <i className="bi bi-upload me-1" />
          Upload
        </Button>
      </FieldRow>
    </Form>
  );
}
