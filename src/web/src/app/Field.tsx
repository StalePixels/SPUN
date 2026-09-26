import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";

export function Field({
  controlId,
  label,
  required,
  help,
  children,
}: {
  controlId: string;
  label: string;
  required?: boolean;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Form.Group as={Row} className="mb-3" controlId={controlId}>
      <Form.Label column md={3}>
        {label}
        {required && <RequiredMark />}
      </Form.Label>
      <Col md={9}>
        {children}
        {help && <Form.Text as="div">{help}</Form.Text>}
      </Col>
    </Form.Group>
  );
}

export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <Row className="mb-3">
      <Col md={{ span: 9, offset: 3 }}>{children}</Col>
    </Row>
  );
}

export function RequiredNote() {
  return (
    <p className="small text-body-secondary">
      You must fill in the fields marked <RequiredMark />.
    </p>
  );
}

function RequiredMark() {
  return (
    <>
      <span className="text-danger ms-1" aria-hidden="true">
        *
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}
