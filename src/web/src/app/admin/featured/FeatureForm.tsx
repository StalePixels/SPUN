"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { ARTICLE_MAX } from "@/lib/rules";
import type { FormState } from "../../actions";
import { Field, FieldRow } from "../../Field";
import { FormError } from "../../FormError";

function subscribe() {
  return () => {};
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localInput(iso: string): string {
  if (iso === "") return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The time field is in the browser's time zone; the hidden field sends UTC.
// It holds the stored time, to the second, until the admin changes the field.
export function FeatureForm({
  save,
  article,
  publishAt,
  published,
}: {
  save: (state: FormState, formData: FormData) => Promise<FormState>;
  article: string;
  publishAt: string | null;
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(save, {});
  const [text, setText] = useState(article);
  const [utc, setUtc] = useState(publishAt ?? "");
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      <Field
        controlId="article"
        label="Article"
        help={`Markdown: paragraphs, bold, italic, code and links. A single line break stays a line break. Up to ${ARTICLE_MAX} characters.`}
      >
        <Form.Control
          as="textarea"
          rows={8}
          data-testid="feature-article"
          name="article"
          maxLength={ARTICLE_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Field
        controlId="publishAt"
        label="Publish time"
        help={published ? "In your time zone." : "In your time zone. Publish with no time publishes now."}
      >
        <Form.Control
          type="datetime-local"
          data-testid="feature-publish-at"
          value={hydrated ? localInput(utc) : ""}
          disabled={!hydrated}
          onChange={(event) => setUtc(event.target.value === "" ? "" : new Date(event.target.value).toISOString())}
          className="w-auto"
        />
        <input type="hidden" name="publishAt" value={utc} />
      </Field>
      <FieldRow>
        {published ? (
          <Button data-testid="feature-save" type="submit" name="intent" value="save" disabled={pending}>
            Save
          </Button>
        ) : (
          <div className="d-flex gap-2">
            <Button
              data-testid="feature-draft"
              type="submit"
              name="intent"
              value="draft"
              variant="outline-primary"
              disabled={pending}
            >
              Save draft
            </Button>
            <Button data-testid="feature-publish" type="submit" name="intent" value="publish" disabled={pending}>
              Publish
            </Button>
          </div>
        )}
      </FieldRow>
    </Form>
  );
}
