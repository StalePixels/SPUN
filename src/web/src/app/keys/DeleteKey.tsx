"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { removeKey } from "./actions";

export function DeleteKey({ keyId, name }: { keyId: string; name: string }) {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button data-testid="delete-key" variant="outline-danger" size="sm" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete key {name}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            An agent that uses the key <code>{keyId}</code> can no longer use the API.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            data-testid="delete-key-confirm"
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(() => removeKey(keyId))}
          >
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
