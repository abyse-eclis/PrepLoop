"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
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

/**
 * Numeric 24-hour time picker (00–23 : 00–59). Never renders AM/PM and never
 * parses with the browser locale. The value is always canonical "HH:mm".
 */
export function TimePicker24h({
  value,
  onChange,
  step = 1,
  disabled = false,
  invalid = false,
  className,
  ...aria
}: TimePicker24hProps) {
  const valid = isValidTimeString(value);
  const hh = valid ? String(Number(value.slice(0, 2))) : "";
  const mm = valid ? String(Number(value.slice(3, 5))) : "";

  function setPart(part: "hour" | "minute", rawValue: string) {
    if (rawValue === "") {
      onChange("");
      return;
    }

    const next = Number(rawValue);
    const max = part === "hour" ? 23 : 59;
    if (!Number.isInteger(next) || next < 0 || next > max) return;

    const h = part === "hour" ? next : Number(hh || 0);
    const m = part === "minute" ? next : Number(mm || 0);
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      aria-label={aria["aria-label"]}
    >
      <Input
        type="number"
        value={hh}
        onChange={(event) => setPart("hour", event.target.value)}
        min={0}
        max={23}
        step={1}
        inputMode="numeric"
        placeholder="--"
        disabled={disabled}
        aria-invalid={invalid}
        aria-label="ชั่วโมง"
        className="w-16 px-2 text-center"
      />
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <Input
        type="number"
        value={mm}
        onChange={(event) => setPart("minute", event.target.value)}
        min={0}
        max={59}
        step={step >= 1 ? step : 1}
        inputMode="numeric"
        placeholder="--"
        disabled={disabled}
        aria-invalid={invalid}
        aria-label="นาที"
        className="w-16 px-2 text-center"
      />
    </div>
  );
}
