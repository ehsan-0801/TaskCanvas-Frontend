"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { registerAuthBridge } from "@/lib/api";

interface AuthContextValue {
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (access: string, refresh: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth state via the Context API — the single source of truth for tokens.
 * Tokens are held in React state (in memory), not localStorage. Because the
 * axios interceptor lives outside React, the provider registers a small bridge
 * (getters + setters) so requests can read the current token and refresh it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // Refs mirror the latest tokens so the (non-reactive) axios bridge always
  // reads current values without re-registering on every change.
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  accessRef.current = accessToken;
  refreshRef.current = refreshToken;

  const login = useCallback((access: string, refresh: string) => {
    accessRef.current = access;
    refreshRef.current = refresh;
    setAccessToken(access);
    setRefreshToken(refresh);
  }, []);

  const logout = useCallback(() => {
    accessRef.current = null;
    refreshRef.current = null;
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  useEffect(() => {
    registerAuthBridge({
      getAccess: () => accessRef.current,
      getRefresh: () => refreshRef.current,
      setAccess: (access) => {
        accessRef.current = access;
        setAccessToken(access);
      },
      onAuthFailure: () => {
        logout();
        router.replace("/login");
      },
    });
    return () => registerAuthBridge(null);
  }, [logout, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      isAuthenticated: accessToken !== null,
      login,
      logout,
    }),
    [accessToken, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
