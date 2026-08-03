"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Upload,
  BookOpen,
  ClipboardCheck,
  RefreshCw,
  BarChart3,
  History,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/today", label: "วันนี้", icon: CalendarDays },
  { href: "/plan", label: "แผน", icon: CalendarRange },
  { href: "/imports", label: "นำเข้า", icon: Upload },
  { href: "/courses", label: "คอร์ส", icon: BookOpen },
  { href: "/assessments", label: "ข้อสอบ", icon: ClipboardCheck },
  { href: "/reviews", label: "ทบทวน", icon: RefreshCw },
  { href: "/progress", label: "ความคืบหน้า", icon: BarChart3 },
  { href: "/history", label: "ย้อนหลัง", icon: History },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card p-3 md:flex">
        <div className="px-2 py-3">
          <span className="text-lg font-bold">PrepLoop</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form action={signOut} className="mt-2">
          <Button variant="outline" size="sm" className="w-full">
            ออกจากระบบ
          </Button>
        </form>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch overflow-x-auto border-t border-border bg-card md:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[4rem] flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
