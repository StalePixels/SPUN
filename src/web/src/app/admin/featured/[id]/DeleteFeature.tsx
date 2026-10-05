"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import type { Problem } from "@/lib/problems";
import { FormError } from "../../../FormError";
import { deleteAdminFeature } from "../../actions";

export function DeleteFeature({ id, title }: { id: number; title: string }) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState<Problem>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <FormError problem={error} />
      <Button data-testid="delete-feature" variant="outline-danger" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete feature
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete the feature of {title}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            The feature leaves the drafts and the timeline, and cannot be restored. A new feature for this app still
            starts with its article.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            data-testid="delete-feature-confirm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAdminFeature(id);
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
