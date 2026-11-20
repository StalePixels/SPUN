"use client";

import { useActionState, useState, useTransition } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Row from "react-bootstrap/Row";
import type { DependsApp } from "@/lib/depends";
import { DEPENDS_MAX } from "@/lib/rules";
import { ActionForm } from "../../../ActionForm";
import { findDepends, saveDepends, type FormState } from "../../../actions";
import { FormError } from "../../../FormError";

function AppLabel({ app }: { app: DependsApp }) {
  return (
    <span className="me-2">
      <span className="fw-medium">{app.title}</span>
      <code className="ms-2">{app.id}</code>
      {app.username && <span className="text-body-secondary ms-2">by {app.username}</span>}
      {app.deleted && (
        <Badge bg="secondary" className="ms-2">
          Deleted
        </Badge>
      )}
    </span>
  );
}

export function DependsForm({
  appId,
  depends,
  own,
  owner,
  save,
  find,
}: {
  appId: string;
  depends: DependsApp[];
  own: DependsApp[];
  owner?: string | null;
  save?: (prev: FormState, formData: FormData) => Promise<FormState>;
  find?: (query: string) => Promise<DependsApp[]>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(save ?? saveDepends.bind(null, appId), {});
  const [picked, setPicked] = useState(depends);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<DependsApp[] | null>(null);
  const [searching, startSearch] = useTransition();
  const isPicked = (id: string) => picked.some((app) => app.id === id);
  const full = picked.length >= DEPENDS_MAX;

  const add = (app: DependsApp) => setPicked((list) => (list.some((item) => item.id === app.id) ? list : [...list, app]));
  const remove = (id: string) => setPicked((list) => list.filter((item) => item.id !== id));
  const search = () => {
    const text = query.trim();
    if (text === "") {
      return;
    }
    startSearch(async () => setFound(await (find ?? ((q: string) => findDepends(appId, q)))(text)));
  };

  return (
    <ActionForm action={formAction} state={state}>
      <FormError problem={state.error} />
      {state.saved && <Alert variant="success" data-testid="form-saved">Saved.</Alert>}
      <p>
        The apps that SPUN on the Next installs or updates before this app. Each release keeps the list as it is
        when the release is made, so a change here reaches the Next only with the next release.
      </p>
      <input type="hidden" name="depends" value={picked.map((app) => app.id).join(" ")} />

      <h2 className="h6">Selected</h2>
      {picked.length === 0 ? (
        <p className="text-body-secondary" data-testid="depends-none">
          None.
        </p>
      ) : (
        <ul className="list-group mb-3" data-testid="depends-picked">
          {picked.map((app) => (
            <li
              key={app.id}
              className="list-group-item d-flex justify-content-between align-items-center"
              data-testid={`depends-picked-${app.id}`}
            >
              <AppLabel app={app} />
              <Button
                size="sm"
                variant="outline-danger"
                data-testid={`depends-remove-${app.id}`}
                aria-label={`Remove ${app.title}`}
                onClick={() => remove(app.id)}
              >
                <i className="bi bi-x-lg" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Row className="g-4 mb-3">
        <Col md={6}>
          <h2 className="h6">{owner ? `Apps of ${owner}` : "Your apps"}</h2>
          {own.length === 0 ? (
            <p className="text-body-secondary">{owner ? `${owner} has no other apps.` : "You have no other apps."}</p>
          ) : (
            <div className="list-group" data-testid="depends-own">
              {own.map((app) => {
                const on = isPicked(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    className={`list-group-item list-group-item-action d-flex align-items-center${on ? " active" : ""}`}
                    aria-pressed={on}
                    disabled={!on && full}
                    data-testid={`depends-own-${app.id}`}
                    onClick={() => (on ? remove(app.id) : add(app))}
                  >
                    <i className={`bi ${on ? "bi-check-square" : "bi-square"} me-2`} />
                    <span className="fw-medium">{app.title}</span>
                    <code className={`ms-2${on ? " text-reset" : ""}`}>{app.id}</code>
                  </button>
                );
              })}
            </div>
          )}
        </Col>
        <Col md={6}>
          <h2 className="h6">Find another app</h2>
          <InputGroup className="mb-2">
            <Form.Control
              type="search"
              placeholder="Title, description or app id"
              aria-label="Find an app"
              data-testid="depends-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search();
                }
              }}
            />
            <Button variant="outline-secondary" data-testid="depends-search-submit" disabled={searching} onClick={search}>
              <i className="bi bi-search" />
              <span className="visually-hidden">Search</span>
            </Button>
          </InputGroup>
          <Form.Text as="div" className="mb-2">
            Public apps of any publisher on SPUN.
          </Form.Text>
          {found !== null &&
            (found.length === 0 ? (
              <p className="text-body-secondary" data-testid="depends-found-none">
                No apps found.
              </p>
            ) : (
              <ul className="list-group" data-testid="depends-found">
                {found.map((app) => (
                  <li key={app.id} className="list-group-item d-flex justify-content-between align-items-center">
                    <AppLabel app={app} />
                    <Button
                      size="sm"
                      variant="outline-primary"
                      data-testid={`depends-add-${app.id}`}
                      disabled={isPicked(app.id) || full}
                      onClick={() => add(app)}
                    >
                      {isPicked(app.id) ? "Added" : "Add"}
                    </Button>
                  </li>
                ))}
              </ul>
            ))}
        </Col>
      </Row>

      <Button data-testid="depends-submit" type="submit" disabled={pending}>
        Save dependencies
      </Button>
    </ActionForm>
  );
}
