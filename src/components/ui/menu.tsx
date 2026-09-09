"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Small dependency-free dropdown menu. Closes on outside click, Escape, or
 * after choosing an item. Renders inline (absolute) so it never causes
 * horizontal overflow on narrow screens — it aligns to the trigger's right
 * edge and is clamped to the viewport by `max-w`.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  label,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <span
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex"
      >
        {trigger}
      </span>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-30 mt-1 min-w-[12rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0"
          )}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-menu-item]")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  className,
  destructive,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
        destructive ? "text-destructive hover:text-destructive" : "",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MenuLink({
  children,
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      role="menuitem"
      data-menu-item
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
