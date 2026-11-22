"use client";

import { ActionForm } from "./ActionForm";
import { FormError } from "./FormError";
import { useActionState, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { LiveCategory } from "@/lib/categories";
import { DESCRIPTION_MAX, INSTALL_DIR_MAX, TITLE_MAX, suggestInstallDir, type Visibility } from "@/lib/rules";
import { createApp, updateApp, type FormState } from "./actions";
import { Field, FieldRow, RequiredNote } from "./Field";

const VISIBILITY_CHOICES: { value: Visibility; label: string }[] = [
  { value: "listed", label: "Listed: in the catalogue lists and search, on the web and on the Next." },
  {
    value: "unlisted",
    label: "Unlisted: not in the lists or search. Other publishers find it in the dependency picker. Use it for the parts of a larger app.",
  },
  {
    value: "secret",
    label: "Secret: not in the lists or search. Only you find it in search and in the dependency picker; other publishers can pick it only by its exact id or alias.",
  },
];

type Props = {
  app?: { id: string; title: string; description: string; installDir?: string | null; minCore?: string | null; visibility?: Visibility };
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
  const [title, setTitle] = useState(app?.title ?? "");
  const suggest = (ids: number[], name: string) => {
    if (!typed) {
      setInstallDir(suggestInstallDir(categories.filter((category) => ids.includes(category.id)), name) ?? "");
    }
  };
  const choose = (id: number, checked: boolean) => {
    const ids = checked ? [...chosen, id] : chosen.filter((other) => other !== id);
    setChosen(ids);
    suggest(ids, title);
  };
  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <RequiredNote />
      <Field controlId="title" label="Title" required help={`Up to ${TITLE_MAX} characters.`}>
        <Form.Control
          data-testid="app-title"
          name="title"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            suggest(chosen, event.target.value);
          }}
        />
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
        help={`Where SPUN on the Next installs the app the first time. The user can change it. Until you type here, it follows the categories you choose, with a folder named after the title. Up to ${INSTALL_DIR_MAX} characters.`}
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
      <Field
        controlId="minCore"
        label="Minimum core version"
        help="The oldest Next core the app runs on, as major.minor.sub, for example 3.01.10. Empty means any core. .spun does not install any apps that depend on a newer core."
      >
        <Form.Control data-testid="app-min-core" name="minCore" defaultValue={app?.minCore ?? ""} />
      </Field>
      <Field
        controlId="visibility"
        label="Visibility"
        help="A direct link to the app, its page, downloads and installs by id or alias work in all three."
      >
        {VISIBILITY_CHOICES.map((choice) => (
          <Form.Check
            key={choice.value}
            data-testid={`app-visibility-${choice.value}`}
            type="radio"
            id={`visibility-${choice.value}`}
            name="visibility"
            value={choice.value}
            label={choice.label}
            defaultChecked={(app?.visibility ?? "listed") === choice.value}
          />
        ))}
      </Field>
      <FieldRow>
        <Button data-testid="app-submit" type="submit" disabled={pending}>
          {app ? "Save" : "Create app"}
        </Button>
      </FieldRow>
    </ActionForm>
  );
}
