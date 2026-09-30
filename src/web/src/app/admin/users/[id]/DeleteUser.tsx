"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import type { Problem } from "@/lib/problems";
import { FormError } from "../../../FormError";
import { deleteAdminUser } from "../../actions";

export function DeleteUser({ userId, name }: { userId: string; name: string }) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState<Problem>();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <FormError problem={error} />
      <Button data-testid="delete-user" variant="outline-danger" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete user
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete user {name}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            The user is disabled, and all their apps are deleted. The username stays taken.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            data-testid="delete-user-confirm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAdminUser(userId);
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
