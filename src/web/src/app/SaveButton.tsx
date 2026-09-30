import { setSaved } from "./actions";

export function SaveButton({ appId, saved }: { appId: string; saved: boolean }) {
  return (
    <form action={setSaved.bind(null, appId, !saved)}>
      <button
        type="submit"
        className={`btn btn-sm text-nowrap ${saved ? "btn-primary" : "btn-outline-primary"}`}
        aria-pressed={saved}
        data-testid={`save-${appId}`}
      >
        <i className={`bi ${saved ? "bi-bookmark-check-fill" : "bi-bookmark"} me-1`} />
        {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}
