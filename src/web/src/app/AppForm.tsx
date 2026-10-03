"use client";

import { FormError } from "./FormError";
import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { Category } from "@/lib/categories";
import { DESCRIPTION_MAX, INSTALL_DIR_MAX, TITLE_MAX } from "@/lib/rules";
import { createApp, updateApp, type FormState } from "./actions";
import { Field, FieldRow, RequiredNote } from "./Field";

type Props = {
  app?: { id: string; title: string; description: string; installDir?: string | null };
  categories: Category[];
  selected?: number[];
  save?: (prev: FormState, formData: FormData) => Promise<FormState>;
};

export function AppForm({ app, categories, selected = [], save }: Props) {
  const action = save ?? (app ? updateApp.bind(null, app.id) : createApp);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <RequiredNote />
      <Field controlId="title" label="Title" required help={`Up to ${TITLE_MAX} characters.`}>
        <Form.Control data-testid="app-title" name="title" required maxLength={TITLE_MAX} defaultValue={app?.title} />
      </Field>
      <Field controlId="description" label="Description" help={`Up to ${DESCRIPTION_MAX} characters.`}>
        <Form.Control data-testid="app-description"
          as="textarea"
          rows={3}
          name="description"
          maxLength={DESCRIPTION_MAX}
          defaultValue={app?.description}
        />
      </Field>
      {!save && (
        <Field
          controlId="installDir"
          label="Suggested install directory"
          help={`Where SPUN on the Next installs the app the first time. The user can change it. Up to ${INSTALL_DIR_MAX} characters.`}
        >
          <Form.Control data-testid="app-install-dir" name="installDir" defaultValue={app?.installDir ?? ""} />
        </Field>
      )}
      <Field controlId="categories" label="Categories" required help="Choose at least one.">
        {categories.map((category) => (
          <Form.Check
            key={category.id}
            data-testid={`app-category-${category.slug}`}
            type="checkbox"
            id={`category-${category.id}`}
            name="categories"
            value={category.id}
            label={category.name}
            defaultChecked={selected.includes(category.id)}
          />
        ))}
      </Field>
      <FieldRow>
        <Button data-testid="app-submit" type="submit" disabled={pending}>
          {app ? "Save" : "Create app"}
        </Button>
      </FieldRow>
    </Form>
  );
}
