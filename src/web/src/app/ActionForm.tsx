"use client";

import { startTransition, useEffect, useRef, type ComponentProps } from "react";
import { requestFormReset } from "react-dom";
import Form from "react-bootstrap/Form";
import type { Problem } from "@/lib/problems";

// A form action resets the form even when it returns an error, which throws away what the
// user typed. This form runs the action from onSubmit and resets only after a success.
export function ActionForm({
  action,
  state,
  ...props
}: Omit<ComponentProps<typeof Form>, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  state: { error?: Problem };
}) {
  const form = useRef<HTMLFormElement>(null);
  const first = useRef(state);
  useEffect(() => {
    const element = form.current;
    if (element && state !== first.current && !state.error) {
      startTransition(() => requestFormReset(element));
    }
  }, [state]);
  return (
    <Form
      {...props}
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(formData));
      }}
    />
  );
}
