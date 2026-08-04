"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: {
    title?: string;
    description?: string;
    variant?: ToastVariant;
  }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** useToast(): fire app-wide toasts. Falls back to a no-op if no provider. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  return ctx ?? { toast: () => {} };
}

const VARIANT_ICON = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

const VARIANT_CLASS: Record<ToastVariant, string> = {
  default: "border-border",
  success: "border-primary/50",
  error: "border-destructive/50",
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  default: "text-muted-foreground",
  success: "text-primary",
  error: "text-destructive",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const idRef = React.useRef(0);

  React.useEffect(() => setMounted(true), []);

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "default" }) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:items-end">
              {items.map((t) => {
                const Icon = VARIANT_ICON[t.variant];
                return (
                  <div
                    key={t.id}
                    role="status"
                    aria-live="polite"
                    className={cn(
                      "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card p-3 shadow-lg",
                      VARIANT_CLASS[t.variant]
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        VARIANT_ICON_CLASS[t.variant]
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      {t.title ? (
                        <p className="text-sm font-medium">{t.title}</p>
                      ) : null}
                      {t.description ? (
                        <p className="text-sm text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      aria-label="ปิด"
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}
