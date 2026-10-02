import Table from "react-bootstrap/Table";
import { listApiKeys } from "@/lib/apikeys";
import { formatDay, isoDay } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { Breadcrumbs } from "../Breadcrumbs";
import { DeleteKey } from "./DeleteKey";
import { KeyForm } from "./KeyForm";

export default async function Keys() {
  const user = await requirePublisher();
  const keys = await listApiKeys(user.id);
  return (
    <>
      <Breadcrumbs items={[{ label: "Your account", href: "/me" }, { label: "API keys" }]} />
      <h1 className="h3 mb-3">API keys</h1>
      <p>
        An agent uses an API key to work with your apps through the SPUN API. The{" "}
        <a href="/api.md">API description</a> says how.
      </p>
      {keys.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="keys-empty">
          You have no API keys.
        </p>
      ) : (
        <Table className="mb-4" data-testid="keys-list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key id</th>
              <th>Made</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} data-testid={`key-${key.id}`}>
                <td data-testid="key-name">{key.name}</td>
                <td>
                  <code>{key.id}</code>
                </td>
                <td>{formatDay(isoDay(key.createdAt))}</td>
                <td className="text-end">
                  <DeleteKey keyId={key.id} name={key.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-plus-lg me-1" />
          New API key
        </div>
        <div className="card-body">
          <KeyForm />
        </div>
      </div>
    </>
  );
}
