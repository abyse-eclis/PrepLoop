import * as React from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertVariant = "info" | "success" | "warning" | "destructive";

const VARIANT_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: AlertCircle,
} as const;

const VARIANT_CLASS: Record<AlertVariant, string> = {
  info: "border-border bg-muted/40 text-foreground",
  success: "border-primary/40 bg-primary/10 text-primary",
  warning: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
};

const ICON_CLASS: Record<AlertVariant, string> = {
  info: "text-muted-foreground",
  success: "text-primary",
  warning: "text-yellow-300",
  destructive: "text-destructive",
};

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: AlertVariant;
  title?: React.ReactNode;
}

export function Alert({
  variant = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-3 text-sm",
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_CLASS[variant])} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-0.5", "text-foreground/90")}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
