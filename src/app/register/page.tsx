"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

import { Button } from "@/components/ui/Button";
import { GuestGuard } from "@/components/GuestGuard";
import { useAuth } from "@/context/AuthContext";
import { register } from "@/lib/api";

function RegisterForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const { access, refresh } = await register(email.trim(), password, name.trim());
      login(access, refresh);
      router.replace("/tasks");
    } catch (err) {
      const axErr = err as AxiosError<Record<string, string[] | string>>;
      const data = axErr.response?.data;
      const firstError =
        data &&
        (Object.values(data)[0] as string[] | string | undefined);
      setError(
        (Array.isArray(firstError) ? firstError[0] : firstError) ||
          "Could not create your account."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

  return (
    <main className="flex min-h-screen items-center justify-center bg-powder px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            T
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create your workspace</h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign up as a team owner — you can add members and boards next.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="name">
              Name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputBase} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputBase} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={inputBase} />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-teal-600 hover:text-teal-700">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <GuestGuard>
      <RegisterForm />
    </GuestGuard>
  );
}
