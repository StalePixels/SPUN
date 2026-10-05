import { permanentRedirect } from "next/navigation";

// The saved apps were at /my before /me had tabs.
export default function OldMyApps() {
  permanentRedirect("/me/apps");
}
