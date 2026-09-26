"use server";

// Proxy misses server actions, so each one calls requireAdmin().

import { revalidatePath } from "next/cache";
import { parseLimit } from "@/lib/rules";
import { adminGetUser, adminSetAppLimit, adminUpdateUser, requireAdmin } from "@/lib/admin";
import { DEFAULT_APP_LIMIT } from "@/lib/settings";
import type { FormState } from "../actions";

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const limit = parseLimit(String(formData.get(DEFAULT_APP_LIMIT) ?? ""));
  if (!limit.ok) {
    return { error: limit.error };
  }
  await adminSetAppLimit(limit.limit);
  revalidatePath("/admin/settings");
  return { saved: true };
}

export async function saveUser(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const user = await adminGetUser(userId);
  if (!user) {
    return { error: { code: "user.notFound" } };
  }
  const limit =
    formData.get("ownLimit") === "on"
      ? parseLimit(String(formData.get("appLimit") ?? ""))
      : ({ ok: true, limit: null } as const);
  if (!limit.ok) {
    return { error: limit.error };
  }
  if (formData.get("ownLimit") === "on" && limit.limit === null) {
    return { error: { code: "limit.missing" } };
  }
  const result = await adminUpdateUser(userId, {
    appLimit: limit.limit,
    isAdmin: formData.get("isAdmin") === "on",
  });
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { saved: true };
}
