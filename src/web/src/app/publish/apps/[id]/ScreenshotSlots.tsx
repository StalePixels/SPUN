import type { FormState } from "../../../actions";
import type { Screenshot } from "@/lib/screenshots";
import { SCREENSHOT_SLOTS } from "@/lib/rules";
import { ScreenshotSlot } from "./ScreenshotSlot";

export function ScreenshotSlots({
  appId,
  screenshots,
  upload,
  clear,
}: {
  appId: string;
  screenshots: Screenshot[];
  upload?: (slot: number) => (prev: FormState, formData: FormData) => Promise<FormState>;
  clear?: (slot: number) => () => Promise<void>;
}) {
  const slots = Array.from({ length: SCREENSHOT_SLOTS }, (_, i) => i + 1);
  return (
    <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
      {slots.map((slot) => {
        const shot = screenshots.find((item) => item.slot === slot);
        return (
          <div className="col" key={slot}>
            <ScreenshotSlot
              appId={appId}
              slot={slot}
              shot={shot ? { width: shot.width, url: shot.url } : null}
              upload={upload?.(slot)}
              clear={clear?.(slot)}
            />
          </div>
        );
      })}
    </div>
  );
}
