"use client";

import { ActionForm } from "../ActionForm";
import { useActionState } from "react";
import Button from "react-bootstrap/Button";
import { acceptCurrentTerms, type FormState } from "../actions";
import { FormError } from "../FormError";

export function AcceptTerms({ termsId }: { termsId: number }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(acceptCurrentTerms, {});
  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      <input type="hidden" name="termsId" value={termsId} />
      <Button data-testid="terms-accept" type="submit" disabled={pending}>
        <i className="bi bi-check-lg me-1" />I accept
      </Button>
    </ActionForm>
  );
}
