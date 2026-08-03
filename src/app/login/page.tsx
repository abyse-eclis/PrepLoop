import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">PrepLoop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            วางแผนและติดตามการติวสอบ
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
