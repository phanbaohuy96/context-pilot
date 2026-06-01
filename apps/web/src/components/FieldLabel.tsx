import type { ReactNode } from "react";
import { InfoHint } from "./InfoHint";

// A field's label text with an optional "(i)" detail bubble, sitting above its control. Shared
// by the settings page and the Local provider fields so the label+(i) markup lives in one place.
export function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label>
      <span className="label-row">
        {label}
        {hint ? <InfoHint text={hint} /> : null}
      </span>
      {children}
    </label>
  );
}
