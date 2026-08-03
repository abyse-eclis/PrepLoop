"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface AuthState {
  error?: string;
  message?: string;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "ยังไม่ได้ตั้งค่า Supabase (ตรวจ .env)" };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "เข้าสู่ระบบไม่สำเร็จ: " + error.message };
  }
  redirect("/today");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return { error: "ยังไม่ได้ตั้งค่า Supabase (ตรวจ .env)" };
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6) {
    return { error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: "สมัครไม่สำเร็จ: " + error.message };
  }
  return {
    message:
      "สมัครสำเร็จ หากเปิดการยืนยันอีเมลไว้ กรุณายืนยันก่อนเข้าสู่ระบบ จากนั้นล็อกอินได้เลย",
  };
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
