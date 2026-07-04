"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

// Client-side route guard for protected pages. Redirects to /login when there
// is no authenticated session, and renders nothing until the redirect happens
// so protected content never flashes for unauthenticated visitors.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-powder">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      </div>
    );
  }

  return <>{children}</>;
}
