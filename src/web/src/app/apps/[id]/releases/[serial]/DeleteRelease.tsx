"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { removeRelease } from "../../../../actions";

export function DeleteRelease({ appId, serial }: { appId: string; serial: number }) {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button data-testid="delete-release" variant="outline-danger" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete release
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete release {serial}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">
            The file of this release is removed from the server.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button data-testid="delete-release-confirm"
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(() => removeRelease(appId, serial))}
          >
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
