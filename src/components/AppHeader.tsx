"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/tasks", label: "Board" },
  { href: "/annotate", label: "Annotate" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/tasks" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
              T
            </span>
            <span className="text-sm font-semibold text-gray-900">TaskCanvas</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Button variant="secondary" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
