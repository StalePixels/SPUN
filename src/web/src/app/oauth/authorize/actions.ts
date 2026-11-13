"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { authorizeQuery, checkAuthorizeRequest, parseAuthorizeParams } from "@/lib/oauth";
import { allowUrl, errorUrl, findClient, urls } from "@/lib/oauthserver";
import { requirePublisher } from "@/lib/session";

function formQuery(formData: FormData): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const name of new Set(formData.keys())) {
    const values = formData.getAll(name).filter((value) => typeof value === "string");
    query[name] = values.length === 1 ? values[0] : values;
  }
  return query;
}

export async function logInToAuthorize(formData: FormData): Promise<void> {
  const params = parseAuthorizeParams(formQuery(formData));
  await signIn("nbn", { redirectTo: `/oauth/authorize?${params ? authorizeQuery(params) : ""}` });
}

// Checked again, as the form fields can be changed. A request that fails goes
// back to the page, which shows why.
export async function decide(formData: FormData): Promise<void> {
  const user = await requirePublisher();
  const params = parseAuthorizeParams(formQuery(formData));
  const lookup = params?.clientId ? await findClient(params.clientId) : null;
  const client = lookup && "client" in lookup ? lookup.client : null;
  const check = params ? checkAuthorizeRequest(params, client, urls().resource) : null;
  if (!params || !client || !check?.ok || params.redirectUri === undefined) {
    redirect(`/oauth/authorize?${params ? authorizeQuery(params) : ""}`);
  }
  if (formData.get("decision") !== "allow") {
    redirect(errorUrl(params.redirectUri, "access_denied", params.state));
  }
  redirect(await allowUrl(user.id, client, params));
}
