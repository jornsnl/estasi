/** Up/down buttons for reordering modules, lessons and blocks. */
export function MoveButtons({
  action,
  id,
  first,
  last,
  extra,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  first: boolean;
  last: boolean;
  extra?: Record<string, string>;
}) {
  return (
    <>
      {(["up", "down"] as const).map((direction) => (
        <form key={direction} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="blockId" value={id} />
          {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="direction" value={direction} />
          <button
            type="submit"
            disabled={direction === "up" ? first : last}
            className="btn-ghost px-2 py-1.5 disabled:opacity-25"
            aria-label={direction === "up" ? "Omhoog" : "Omlaag"}
            title={direction === "up" ? "Omhoog" : "Omlaag"}
          >
            {direction === "up" ? "↑" : "↓"}
          </button>
        </form>
      ))}
    </>
  );
}
