import Link from "next/link";
import { redirect } from "next/navigation";
import Alert from "react-bootstrap/Alert";
import { FormError } from "../../FormError";
import {
  AUTHORIZE_FIELDS,
  checkAuthorizeRequest,
  oauthError,
  parseAuthorizeParams,
  redirectHost,
  type AuthorizeParams,
} from "@/lib/oauth";
import { errorUrl, findClient, urls } from "@/lib/oauthserver";
import { mustAcceptTerms } from "@/lib/rules";
import { currentUser } from "@/lib/session";
import { currentTermsId } from "@/lib/terms";
import { decide, logInToAuthorize } from "./actions";

function HiddenFields({ params }: { params: AuthorizeParams }) {
  return AUTHORIZE_FIELDS.map(([key, name]) =>
    params[key] === undefined ? null : <input key={name} type="hidden" name={name} value={params[key]} />,
  );
}

export default async function Authorize({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseAuthorizeParams(await searchParams);
  const heading = (
    <h1 className="h3 mb-3" data-testid="oauth-heading">
      Connect an MCP client
    </h1>
  );
  if (!params) {
    return (
      <>
        {heading}
        <FormError problem={{ code: "oauth.badRequest" }} />
      </>
    );
  }
  const user = await currentUser();
  if (!user) {
    return (
      <>
        {heading}
        <p>Log in to SPUN to connect an MCP client to your account.</p>
        <form action={logInToAuthorize}>
          <HiddenFields params={params} />
          <button type="submit" className="btn btn-primary" data-testid="oauth-login">
            <i className="bi bi-box-arrow-in-right me-1" />
            Log in
          </button>
        </form>
      </>
    );
  }
  if (!user.username || mustAcceptTerms(user.acceptedTermsId, await currentTermsId())) {
    return (
      <>
        {heading}
        <Alert variant="info" data-testid="oauth-not-publisher">
          {user.username ? (
            <>
              Accept the current <Link href="/terms">terms and conditions</Link> first, then connect the client again.
            </>
          ) : (
            <>
              Choose a <Link href="/username">username</Link> first, then connect the client again.
            </>
          )}
        </Alert>
      </>
    );
  }
  const lookup = params.clientId ? await findClient(params.clientId) : { error: { code: "oauth.unknownClient" as const } };
  const client = "client" in lookup ? lookup.client : null;
  const check = checkAuthorizeRequest(params, client, urls().resource);
  if (!check.ok && check.redirect && params.redirectUri !== undefined) {
    redirect(errorUrl(params.redirectUri, oauthError(check.error), params.state));
  }
  if (!check.ok || !client || params.redirectUri === undefined) {
    return (
      <>
        {heading}
        <FormError problem={"error" in lookup ? lookup.error : check.ok ? undefined : check.error} />
      </>
    );
  }
  return (
    <>
      <h1 className="h3 mb-3" data-testid="oauth-heading">
        Connect <span data-testid="oauth-client-name">{client.name}</span>?
      </h1>
      <dl className="row">
        <dt className="col-sm-3">Sends you back to</dt>
        <dd className="col-sm-9" data-testid="oauth-redirect-host">
          {redirectHost(params.redirectUri)}
        </dd>
      </dl>
      <p>
        If you allow it, this client can do all that you can do with your apps on SPUN, as an API key can: make,
        change and delete apps, releases and screenshots. You can disconnect it at any time on the{" "}
        <Link href="/me/keys">API keys</Link> page.
      </p>
      <Alert variant="warning" data-testid="oauth-local-warning">
        The answer goes to a program on this computer. Allow it only if you started this connection yourself just now.
      </Alert>
      <form action={decide} className="d-flex gap-2">
        <HiddenFields params={params} />
        <button type="submit" name="decision" value="allow" className="btn btn-primary" data-testid="oauth-allow">
          Allow
        </button>
        <button type="submit" name="decision" value="deny" className="btn btn-outline-secondary" data-testid="oauth-deny">
          Deny
        </button>
      </form>
    </>
  );
}
