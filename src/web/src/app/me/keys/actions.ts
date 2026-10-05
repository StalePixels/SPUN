"use server";

import { revalidatePath } from "next/cache";
import { createApiKey, deleteApiKey } from "@/lib/apikeys";
import type { Problem } from "@/lib/problems";
import { requirePublisher } from "@/lib/session";

export type KeyFormState = { error?: Problem; key?: string };

export async function makeKey(_prev: KeyFormState, formData: FormData): Promise<KeyFormState> {
  const user = await requirePublisher();
  const name = formData.get("name");
  const result = await createApiKey(user.id, typeof name === "string" ? name : "");
  if (result.error) {
    return { error: result.error };
  }
  revalidatePath("/me/keys");
  return { key: result.key };
}

export async function removeKey(keyId: string): Promise<void> {
  const user = await requirePublisher();
  await deleteApiKey(user.id, keyId);
  revalidatePath("/me/keys");
}
