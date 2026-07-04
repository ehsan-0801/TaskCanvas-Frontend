"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

// Client-side route guard for protected pages. Once auth state has hydrated,
// unauthenticated visitors are redirected to /login. Renders a spinner until
// then so protected content never flashes.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && !isAuthenticated) {
      router.replace("/login");
    }
  }, [initializing, isAuthenticated, router]);

  if (initializing || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-powder">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      </div>
    );
  }

  return <>{children}</>;
}
