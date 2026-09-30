"use client";

import { useActionState, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_TEXT } from "@/lib/rules";
import { removeScreenshot, uploadScreenshot, type FormState } from "../../../actions";
import { FormError } from "../../../FormError";
import { Screenshot } from "../../../Screenshot";

export type SlotShot = { width: number; url: string };

export function ScreenshotSlot({
  appId,
  slot,
  shot,
  upload,
  clear,
}: {
  appId: string;
  slot: number;
  shot: SlotShot | null;
  upload?: (prev: FormState, formData: FormData) => Promise<FormState>;
  clear?: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    upload ?? uploadScreenshot.bind(null, appId, slot),
    {},
  );
  const [tooLarge, setTooLarge] = useState(false);
  return (
    <div className="card h-100" data-testid={`screenshot-slot-${slot}`}>
      <div className="card-header">{slot === 1 ? "Main screenshot" : `Screenshot ${slot}`}</div>
      <div className="card-body">
        {shot ? (
          <Screenshot
            url={shot.url}
            width={shot.width}
            alt={`Screenshot ${slot}`}
            testId={`screenshot-preview-${slot}`}
            className="d-block mb-3"
          />
        ) : (
          <p className="text-body-secondary" data-testid={`screenshot-empty-${slot}`}>
            Empty
          </p>
        )}
        <Form action={formAction}>
          <FormError problem={state.error} />
          <Form.Control
            data-testid={`screenshot-file-${slot}`}
            type="file"
            name="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,.nxi"
            required
            className="mb-2"
            isInvalid={tooLarge}
            onChange={(event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              setTooLarge(!!file && file.size > MAX_SCREENSHOT_BYTES);
            }}
          />
          <Form.Control.Feedback type="invalid">The file is larger than {MAX_SCREENSHOT_TEXT}.</Form.Control.Feedback>
          <Button data-testid={`screenshot-upload-${slot}`} type="submit" size="sm" disabled={pending || tooLarge}>
            <i className="bi bi-upload me-1" />
            {shot ? "Replace" : "Upload"}
          </Button>
        </Form>
        {shot && (
          <form action={clear ?? removeScreenshot.bind(null, appId, slot)} className="mt-2">
            <Button data-testid={`screenshot-clear-${slot}`} type="submit" size="sm" variant="outline-danger">
              <i className="bi bi-x-lg me-1" />
              Clear
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
