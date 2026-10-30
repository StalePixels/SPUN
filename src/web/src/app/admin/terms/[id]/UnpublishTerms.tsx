"use client";

import { ActionForm } from "../../../ActionForm";
import { useActionState } from "react";
import Button from "react-bootstrap/Button";
import type { FormState } from "../../../actions";
import { FormError } from "../../../FormError";
import { unpublishAdminTerms } from "../../actions";

export function UnpublishTerms({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(unpublishAdminTerms.bind(null, id), {});
  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      <Button data-testid="terms-unpublish" type="submit" variant="outline-danger" disabled={pending}>
        <i className="bi bi-eye-slash me-1" />
        Unpublish
      </Button>
    </ActionForm>
  );
}
