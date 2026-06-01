"use client";

import { useEffect, useRef, useState } from "react";

// A clickable "(i)" that toggles a small explanation bubble next to a heading. Closes on a
// click outside or Escape (a plain title tooltip can't be opened by click and is unreliable on
// touch; a <details> won't light-dismiss). Kept tiny and self-contained so it can sit inline in
// any heading row.
export function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="info-hint" ref={ref}>
      <button
        type="button"
        className="info-icon"
        aria-label="More information"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open ? (
        <span className="info-bubble" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}
