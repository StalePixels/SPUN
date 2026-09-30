"use client";

import { useActionState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { CATEGORY_NAME_MAX, CATEGORY_SLUG_MAX } from "@/lib/rules";
import type { FormState } from "../../actions";
import { Field, FieldRow } from "../../Field";
import { FormError } from "../../FormError";
import { addAdminCategory, saveAdminCategory } from "../actions";

type Props = { category?: { id: number; slug: string; name: string } };

export function CategoryForm({ category }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    category ? saveAdminCategory.bind(null, category.id) : addAdminCategory,
    {},
  );
  const prefix = category ? `category-${category.id}` : "category-new";
  return (
    <Form action={formAction}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <Field
        controlId={`${prefix}-slug`}
        label="Slug"
        help={`The URL of the category. Lowercase letters, digits and hyphens, up to ${CATEGORY_SLUG_MAX} characters. A change breaks the old URL.`}
      >
        <Form.Control data-testid="category-slug" name="slug" maxLength={CATEGORY_SLUG_MAX} defaultValue={category?.slug} />
      </Field>
      <Field controlId={`${prefix}-name`} label="Name" help={`Up to ${CATEGORY_NAME_MAX} characters.`}>
        <Form.Control data-testid="category-name" name="name" maxLength={CATEGORY_NAME_MAX} defaultValue={category?.name} />
      </Field>
      <FieldRow>
        <Button data-testid="category-submit" type="submit" disabled={pending}>
          {category ? "Save" : "Add category"}
        </Button>
      </FieldRow>
    </Form>
  );
}
