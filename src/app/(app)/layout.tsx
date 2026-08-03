import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/workspace";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-5xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
