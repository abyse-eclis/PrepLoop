"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  icon?: React.ReactNode;
}

export interface ComboboxProps {
  value: string | null;
  onValueChange: (value: string | null) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  clearable?: boolean;
  /** Hide the search box for short lists. */
  searchable?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Accessible, dependency-free single-select combobox.
 * Keyboard: ArrowUp/Down, Home/End, Enter, Escape. Theme-aware (dark/light).
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "เลือก...",
  searchPlaceholder = "ค้นหา...",
  emptyMessage = "ไม่พบรายการ",
  disabled = false,
  loading = false,
  clearable = false,
  searchable = true,
  invalid = false,
  id,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      const idx = filtered.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(idx: number) {
    const opt = filtered[idx];
    if (!opt || opt.disabled) return;
    onValueChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-destructive" : "border-input"
        )}
      >
        <span className={cn("flex items-center gap-2 truncate", !selected && "text-muted-foreground")}>
          {selected?.icon}
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {clearable && selected && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="ล้างค่า"
              onClick={(e) => {
                e.stopPropagation();
                onValueChange(null);
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {searchable ? (
            <div className="flex items-center gap-2 border-b border-border px-2">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label={aria["aria-label"] ?? placeholder}
            className="max-h-60 overflow-y-auto p-1"
          >
            {loading ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                กำลังโหลด…
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((opt, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(idx);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm",
                      isActive && "bg-accent text-accent-foreground",
                      opt.disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {opt.icon}
                      {opt.label}
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
