"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp, type AuthState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "กำลังดำเนินการ…" : children}
    </Button>
  );
}

export function LoginForm() {
  const [signInState, signInAction] = useActionState<AuthState, FormData>(
    signIn,
    {}
  );
  const [signUpState, signUpAction] = useActionState<AuthState, FormData>(
    signUp,
    {}
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={signInAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>

          {signInState.error ? (
            <p className="text-sm text-destructive">{signInState.error}</p>
          ) : null}
          {signUpState.error ? (
            <p className="text-sm text-destructive">{signUpState.error}</p>
          ) : null}
          {signUpState.message ? (
            <p className="text-sm text-primary">{signUpState.message}</p>
          ) : null}

          <SubmitButton>เข้าสู่ระบบ</SubmitButton>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            formAction={signUpAction}
          >
            สมัครสมาชิกใหม่
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
