"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

// "user": oturum var ama hesap türü henüz okunmadı (ilk birkaç yüz milisaniye).
export type Account =
  | { kind: "guest" }
  | { kind: "user" | "customer" | "business" | "admin"; id: string; name: string };

// Başlık, alt sekme çubuğu ve üye ana sayfası aynı bilgiyi ister: tek oturum dinleyicisi, tek sorgu.
let current: Account | null = null;
let started = false;
let lastUserId: string | undefined | null = null;
const listeners = new Set<() => void>();

function set(next: Account) {
  current = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const supabase = createClient();
  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id;
    // Oturum yenilemesi (TOKEN_REFRESHED) aynı kullanıcı için tekrar sorgu yapmasın.
    if (userId === lastUserId) return;
    lastUserId = userId;
    if (!userId) return set({ kind: "guest" });
    set({ kind: "user", id: userId, name: "" });
    Promise.all([
      supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle(),
      supabase.rpc("is_admin"),
    ]).then(([{ data }, { data: admin }]) => {
      if (lastUserId !== userId) return;
      const kind = admin === true ? "admin" : data?.role === "business" ? "business" : "customer";
      set({ kind, id: userId, name: (data?.full_name as string | undefined) ?? "" });
    });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** Giriş yapan kullanıcının türü ve adı; yüklenirken null. */
export function useAccount() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Giriş yapılmış mı (hesap türü henüz bilinmese de). null: henüz bilinmiyor. */
export function isSignedIn(account: Account | null) {
  return account ? account.kind !== "guest" : null;
}

/** Hesap türüne göre "benim sayfam" bağlantısı. */
export function accountHome(account: Account | null) {
  if (!account || account.kind === "guest" || account.kind === "user") return null;
  if (account.kind === "admin") return { href: "/admin", label: "Yönetim", short: "Yönetim" };
  if (account.kind === "business") return { href: "/panel", label: "İşletme Paneli", short: "Panel" };
  return { href: "/hesabim", label: "Hesabım", short: "Hesabım" };
}
