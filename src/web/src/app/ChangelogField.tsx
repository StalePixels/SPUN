import Form from "react-bootstrap/Form";
import { CHANGELOG_MAX } from "@/lib/rules";
import { Field } from "./Field";

export function ChangelogField({
  testId,
  defaultValue = "",
  controlId = "changelog",
}: {
  testId: string;
  defaultValue?: string;
  controlId?: string;
}) {
  return (
    <Field controlId={controlId} label="Changelog" help={`Optional. Up to ${CHANGELOG_MAX} characters.`}>
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
