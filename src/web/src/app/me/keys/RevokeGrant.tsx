"use client";

import { useState, useTransition } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { removeGrant } from "./actions";

export function RevokeGrant({ grantId, name }: { grantId: string; name: string }) {
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button data-testid="revoke-grant" variant="outline-danger" size="sm" onClick={() => setShow(true)}>
        <i className="bi bi-x-circle me-1" />
        Disconnect
      </Button>
      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Disconnect {name}?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-0">The client can no longer use SPUN for you. To use it again, connect it again.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button
            data-testid="revoke-grant-confirm"
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(() => removeGrant(grantId))}
          >
            Disconnect
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
