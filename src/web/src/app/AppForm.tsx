"use client";

import { FormError } from "./FormError";
import { useActionState, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { LiveCategory } from "@/lib/categories";
import { DESCRIPTION_MAX, INSTALL_DIR_MAX, TITLE_MAX, suggestInstallDir } from "@/lib/rules";
import { createApp, updateApp, type FormState } from "./actions";
import { Field, FieldRow, RequiredNote } from "./Field";

type Props = {
  app?: { id: string; title: string; description: string; installDir?: string | null };
  categories: LiveCategory[];
  selected?: number[];
  save?: (prev: FormState, formData: FormData) => Promise<FormState>;
};

export function AppForm({ app, categories, selected = [], save }: Props) {
  const action = save ?? (app ? updateApp.bind(null, app.id) : createApp);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [installDir, setInstallDir] = useState(app?.installDir ?? "");
  const [typed, setTyped] = useState(installDir !== "");
  const [chosen, setChosen] = useState(selected);
  const choose = (id: number, checked: boolean) => {
    const ids = checked ? [...chosen, id] : chosen.filter((other) => other !== id);
    setChosen(ids);
    if (!typed) {
      setInstallDir(suggestInstallDir(categories.filter((category) => ids.includes(category.id))) ?? "");
    }
  };
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
            onChange={(event) => choose(category.id, event.target.checked)}
          />
        ))}
      </Field>
      <Field
        controlId="installDir"
        label="Suggested install directory"
        required
        help={`Where SPUN on the Next installs the app the first time. The user can change it. Until you type here, it follows the categories you choose. Up to ${INSTALL_DIR_MAX} characters.`}
      >
        <Form.Control
          data-testid="app-install-dir"
          name="installDir"
          required
          value={installDir}
          onChange={(event) => {
            setInstallDir(event.target.value);
            setTyped(true);
          }}
        />
      </Field>
      <FieldRow>
        <Button data-testid="app-submit" type="submit" disabled={pending}>
          {app ? "Save" : "Create app"}
        </Button>
      </FieldRow>
    </Form>
  );
}
