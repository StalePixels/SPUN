import { rateCheck, type RateDeps } from "./apigate";
import type { Problem } from "./problems";

// Per user, so that the web forms and every API key of the user share one count.
export async function checkUploadRate(deps: RateDeps, userId: string, limit: number): Promise<Problem | null> {
  const wait = await rateCheck(deps, `upload:${userId}`, limit, 3600);
  return wait === null ? null : { code: "upload.tooMany", max: limit, wait };
}
