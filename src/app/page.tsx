"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

// Entry point: once auth state has hydrated, send authenticated users to the
// board and everyone else to login.
export default function Home() {
  const router = useRouter();
  const { isAuthenticated, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) {
      router.replace(isAuthenticated ? "/tasks" : "/login");
    }
  }, [initializing, isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-powder">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
    </main>
  );
}
