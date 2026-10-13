"use client";

import { useState } from "react";
import Modal from "react-bootstrap/Modal";
import { Screenshot } from "../../Screenshot";

type Shot = { slot: number; url: string; width: number };

const BOX = { aspectRatio: "5 / 4" };

export function ScreenshotGallery({ title, shots }: { title: string; shots: Shot[] }) {
  const [open, setOpen] = useState<Shot | null>(null);
  const main = shots.find((shot) => shot.slot === 1);
  const others = shots.filter((shot) => shot.slot !== 1);
  const alt = (shot: Shot) => (shot.slot === 1 ? `${title}, main screenshot` : `${title}, screenshot ${shot.slot}`);
  const mainWidth = others.length > 0 ? undefined : 640;

  const tile = (shot: Shot, scale: number) => (
    <button
      type="button"
      className="d-flex align-items-center justify-content-center w-100 p-0 border-0 bg-black"
      style={{ ...BOX, maxWidth: shot.slot === 1 ? mainWidth : undefined }}
      onClick={() => setOpen(shot)}
      data-testid={`public-screenshot-open-${shot.slot}`}
    >
      <Screenshot url={shot.url} width={shot.width} scale={scale} alt={alt(shot)} testId={`public-screenshot-${shot.slot}`} className="w-100" />
    </button>
  );

  return (
    <>
      <div className="row g-3 mb-4" data-testid="public-screenshots">
        <div className={others.length > 0 ? "col-md-6" : "col-12"}>
          {main ? (
            tile(main, 2)
          ) : (
            <div className="d-flex align-items-center justify-content-center bg-black" style={{ ...BOX, maxWidth: mainWidth }}>
              <Screenshot url="/placeholder.png" width={320} scale={2} alt="SPUN" testId="public-screenshot-placeholder" className="w-100" />
            </div>
          )}
        </div>
        {others.length > 0 && (
          <div className="col-md-6">
            <div className="row row-cols-2 g-3">
              {others.map((shot) => (
                <div className="col" key={shot.slot}>
                  {tile(shot, 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal show={open !== null} onHide={() => setOpen(null)} size="xl" centered data-testid="public-screenshot-modal">
        {open && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>{alt(open)}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="bg-white">
              <Screenshot
                url={open.url}
                width={open.width}
                scale={4}
                alt={alt(open)}
                testId="public-screenshot-large"
                className="d-block mx-auto border border-2 border-black"
                style={{ width: `min(100%, calc(75vh * ${open.width === 320 ? 320 / 256 : 256 / 192}))` }}
              />
            </Modal.Body>
          </>
        )}
      </Modal>
    </>
  );
}
