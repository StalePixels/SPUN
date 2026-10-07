"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import type { Problem } from "@/lib/problems";
import { FormError } from "../../../FormError";
import { deleteAdminTerms } from "../../actions";

export function DeleteTerms({ id }: { id: number }) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState<Problem>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <FormError problem={error} />
      <Button data-testid="delete-terms" variant="outline-danger" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete version
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete version {id}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">The version leaves the list, and cannot be restored.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            data-testid="delete-terms-confirm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAdminTerms(id);
                setError(result.error);
                setShow(false);
              })
            }
          >
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
