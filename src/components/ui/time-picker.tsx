"use client";

import * as React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { isValidTimeString } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface TimePicker24hProps {
  /** "HH:mm" (24h) or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  /** Minute step (e.g. 1, 5, 10, 15). Default 5. */
  step?: number;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}

function hourOptions(): ComboboxOption[] {
  return Array.from({ length: 24 }, (_, h) => ({
    value: String(h).padStart(2, "0"),
    label: String(h).padStart(2, "0"),
  }));
}

function minuteOptions(step: number): ComboboxOption[] {
  const s = step >= 1 ? step : 1;
  const out: ComboboxOption[] = [];
  for (let m = 0; m < 60; m += s) {
    out.push({ value: String(m).padStart(2, "0"), label: String(m).padStart(2, "0") });
  }
  return out;
}

/**
 * 24-hour time picker (00–23 : 00–59). Never renders AM/PM and never parses
 * with the browser locale. The value is always canonical "HH:mm".
 */
export function TimePicker24h({
  value,
  onChange,
  step = 5,
  disabled = false,
  invalid = false,
  className,
  ...aria
}: TimePicker24hProps) {
  const valid = isValidTimeString(value);
  const hh = valid ? value.slice(0, 2) : null;
  const mm = valid ? value.slice(3, 5) : null;

  const minutes = React.useMemo(() => minuteOptions(step), [step]);
  // Ensure the current minute is selectable even if it is off-step.
  const minuteOpts = React.useMemo(() => {
    if (mm && !minutes.some((o) => o.value === mm)) {
      return [...minutes, { value: mm, label: mm }].sort((a, b) =>
        a.value.localeCompare(b.value)
      );
    }
    return minutes;
  }, [minutes, mm]);

  function setPart(nextHH: string | null, nextMM: string | null) {
    const h = nextHH ?? hh ?? "00";
    const m = nextMM ?? mm ?? "00";
    onChange(`${h}:${m}`);
  }

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      aria-label={aria["aria-label"]}
    >
      <Combobox
        value={hh}
        onValueChange={(v) => setPart(v, mm)}
        options={hourOptions()}
        placeholder="--"
        searchable={false}
        disabled={disabled}
        invalid={invalid}
        aria-label="ชั่วโมง"
        className="w-16"
      />
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <Combobox
        value={mm}
        onValueChange={(v) => setPart(hh, v)}
        options={minuteOpts}
        placeholder="--"
        searchable={false}
        disabled={disabled}
        invalid={invalid}
        aria-label="นาที"
        className="w-16"
      />
    </div>
  );
}
