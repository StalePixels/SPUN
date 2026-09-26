"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { removeApp } from "../../actions";

export function DeleteApp({ appId }: { appId: string }) {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button data-testid="delete-app" variant="outline-danger" onClick={() => setShow(true)}>
        <i className="bi bi-trash me-1" />
        Delete app
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete app {appId}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>The release files of this app are removed from the server.</p>
          <p className="mb-0">
            The app id <code>{appId}</code> cannot be used again, by you or by
            anyone else.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button data-testid="delete-app-confirm"
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(() => removeApp(appId))}
          >
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
