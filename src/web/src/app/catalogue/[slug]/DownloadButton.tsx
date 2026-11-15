"use client";

import { useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";

const HIDE_KEY = "spun:hide-download-modal";

export function DownloadButton({ appId, title }: { appId: string; title: string }) {
  const [show, setShow] = useState(false);
  const href = `/catalogue/${appId}/download`;
  const command = `.nbnget /dot/spun : ../spun get spun : .spun get ${appId}`;

  const open = (event: React.MouseEvent) => {
    if (localStorage.getItem(HIDE_KEY)) {
      return;
    }
    event.preventDefault();
    setShow(true);
  };

  const hide = (checked: boolean) => {
    if (checked) {
      localStorage.setItem(HIDE_KEY, "1");
    } else {
      localStorage.removeItem(HIDE_KEY);
    }
  };

  return (
    <>
      <a href={href} className="btn btn-primary" data-testid="public-app-download" download onClick={open}>
        <i className="bi bi-download me-1" />
        Download
      </a>
      <Modal show={show} onHide={() => setShow(false)} centered data-testid="download-modal">
        <Modal.Header closeButton>
          <Modal.Title>Get {title} on your Next</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Did you know you can download this title direct to your Next? No?! Well, why not try it now? Just type:</p>
          <pre className="bg-body-tertiary p-2 mb-3" style={{ whiteSpace: "pre-wrap" }}>
            <code data-testid="download-modal-command">{command}</code>
          </pre>
          <Form.Check
            id="download-modal-hide"
            label="Don't show this again"
            onChange={(event) => hide(event.target.checked)}
            data-testid="download-modal-hide"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Close
          </Button>
          <a href={href} className="btn btn-primary" download onClick={() => setShow(false)} data-testid="download-modal-zip">
            <i className="bi bi-download me-1" />
            Download the zip
          </a>
        </Modal.Footer>
      </Modal>
    </>
  );
}
