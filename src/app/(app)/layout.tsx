import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/workspace";
import { ToastProvider } from "@/components/ui/toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <AppNav />
        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          {/* Reading-width by default. A page whose root carries
              `data-wide-page` (e.g. /today's two-lane resource layout) opts
              into the full desktop width instead. */}
          <div className="mx-auto w-full max-w-5xl p-4 [&:has([data-wide-page])]:max-w-[1400px] md:p-6">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
