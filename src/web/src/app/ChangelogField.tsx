import Form from "react-bootstrap/Form";
import { CHANGELOG_MAX } from "@/lib/rules";
import { Field } from "./Field";

export function ChangelogField({ testId, defaultValue = "" }: { testId: string; defaultValue?: string }) {
  return (
    <Field controlId="changelog" label="Changelog" help={`Optional. Up to ${CHANGELOG_MAX} characters.`}>
      <Form.Control
        data-testid={testId}
        as="textarea"
        rows={5}
        name="changelog"
        maxLength={CHANGELOG_MAX}
        defaultValue={defaultValue}
      />
    </Field>
  );
}
