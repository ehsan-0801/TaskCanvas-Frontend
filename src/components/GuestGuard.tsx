"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

// Guard for guest-only routes (e.g. /login). If the user already has a session,
// bounce them to the dashboard instead of showing the login form.
export function GuestGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/tasks");
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-powder">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      </div>
    );
  }

  return <>{children}</>;
}
