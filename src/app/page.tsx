"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/context/AuthContext";

// Entry point: send authenticated users to the board, everyone else to login.
export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    router.replace(isAuthenticated ? "/tasks" : "/login");
  }, [isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-powder">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
    </main>
  );
}
