import { permanentRedirect } from "next/navigation";

// The API keys were at /keys before /me had tabs.
export default function OldKeys() {
  permanentRedirect("/me/keys");
}
