"use client";

import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidDateString, formatDateKeyThai } from "@/lib/dates";

export interface DatePickerProps {
  /** Domain value "YYYY-MM-DD" or "". */
  value: string;
  onChange: (value: string) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  /** Show Buddhist Era in the display + calendar header. */
  buddhist?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]; // Mon..Sun
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** Build a YYYY-MM-DD key from parts WITHOUT any timezone conversion. */
function key(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(
    d
  ).padStart(2, "0")}`;
}

function parse(value: string): { y: number; m: number; d: number } | null {
  if (!isValidDateString(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return { y: y!, m: m! - 1, d: d! };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** 0=Mon..6=Sun for the first of the month. */
function firstWeekday(y: number, m: number): number {
  return (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  invalid = false,
  clearable = false,
  buddhist = false,
  id,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const parsed = parse(value);
  const today = new Date();
  const [view, setView] = React.useState(() =>
    parsed
      ? { y: parsed.y, m: parsed.m }
      : { y: today.getUTCFullYear(), m: today.getUTCMonth() }
  );

  React.useEffect(() => {
    if (open && parsed) setView({ y: parsed.y, m: parsed.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function isDisabled(k: string): boolean {
    if (min && k < min) return true;
    if (max && k > max) return true;
    return false;
  }

  function pick(d: number) {
    const k = key(view.y, view.m, d);
    if (isDisabled(k)) return;
    onChange(k);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const nm = v.m + delta;
      const y = v.y + Math.floor(nm / 12);
      const m = ((nm % 12) + 12) % 12;
      return { y, m };
    });
  }

  const dim = daysInMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const headerYear = buddhist ? view.y + 543 : view.y;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={invalid || undefined}
        aria-label={aria["aria-label"]}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-destructive" : "border-input"
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {parsed ? formatDateKeyThai(value, { buddhist }) : "เลือกวันที่"}
        </span>
        <span className="flex items-center gap-1">
          {clearable && value && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="ล้างวันที่"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <Calendar className="h-4 w-4 opacity-60" />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="ปฏิทิน"
          className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-card p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">
              {MONTHS[view.m]} {headerYear}
            </span>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }).map((_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const k = key(view.y, view.m, d);
              const selected = k === value;
              const off = isDisabled(k);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={off}
                  aria-pressed={selected}
                  onClick={() => pick(d)}
                  className={cn(
                    "h-8 rounded text-sm",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                    off && "cursor-not-allowed opacity-30 hover:bg-transparent"
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between">
            <button
              type="button"
              onClick={() => {
                const k = key(
                  today.getUTCFullYear(),
                  today.getUTCMonth(),
                  today.getUTCDate()
                );
                if (!isDisabled(k)) {
                  onChange(k);
                  setOpen(false);
                }
              }}
              className="text-xs text-primary hover:underline"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
