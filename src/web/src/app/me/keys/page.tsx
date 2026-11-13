import Table from "react-bootstrap/Table";
import { listApiKeys } from "@/lib/apikeys";
import { listGrants } from "@/lib/oauthserver";
import { formatDay, isoDay } from "@/lib/rules";
import { requirePublisher } from "@/lib/session";
import { MeMenu } from "../MeMenu";
import { DeleteKey } from "./DeleteKey";
import { KeyForm } from "./KeyForm";
import { RevokeGrant } from "./RevokeGrant";

export default async function Keys() {
  const user = await requirePublisher();
  const keys = await listApiKeys(user.id);
  const grants = await listGrants(user.id);
  return (
    <>
      <MeMenu active="keys" />
      <h1 className="h3 mb-3" data-testid="keys-heading">API keys</h1>
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
      <h2 className="h4 mb-3" data-testid="grants-heading">MCP clients</h2>
      <p>An MCP client that you allowed on SPUN can do all that an API key can. Disconnect it here.</p>
      {grants.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="grants-empty">
          You have no connected MCP clients.
        </p>
      ) : (
        <Table className="mb-4" data-testid="grants-list">
          <thead>
            <tr>
              <th>Client</th>
              <th>Connected</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={grant.id} data-testid={`grant-${grant.id}`}>
                <td data-testid="grant-name">{grant.clientName}</td>
                <td>{formatDay(isoDay(grant.createdAt))}</td>
                <td>{grant.lastUsedAt ? formatDay(isoDay(grant.lastUsedAt)) : ""}</td>
                <td className="text-end">
                  <RevokeGrant grantId={grant.id} name={grant.clientName} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
