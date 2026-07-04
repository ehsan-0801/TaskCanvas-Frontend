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
  /** True until the provider has hydrated auth state on mount. Guards wait on this. */
  initializing: boolean;
  login: (access: string, refresh: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ---- lightweight cookie persistence (not localStorage) ---- */
const COOKIE = "taskcanvas_auth";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

interface StoredTokens {
  access: string;
  refresh: string;
}

function readCookie(): StoredTokens | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!entry) return null;
  try {
    return JSON.parse(decodeURIComponent(entry.slice(COOKIE.length + 1)));
  } catch {
    return null;
  }
}

function writeCookie(tokens: StoredTokens) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(tokens));
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

function clearCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * Auth state via the Context API — the single source of truth for tokens.
 * Tokens live in React state and are persisted to a cookie (not localStorage)
 * so the session — and route guards — survive a full page reload.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

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
    writeCookie({ access, refresh });
  }, []);

  const logout = useCallback(() => {
    accessRef.current = null;
    refreshRef.current = null;
    setAccessToken(null);
    setRefreshToken(null);
    clearCookie();
  }, []);

  // Hydrate from the cookie once on mount, then mark ready.
  useEffect(() => {
    const stored = readCookie();
    if (stored?.access && stored?.refresh) {
      accessRef.current = stored.access;
      refreshRef.current = stored.refresh;
      setAccessToken(stored.access);
      setRefreshToken(stored.refresh);
    }
    setInitializing(false);
  }, []);

  useEffect(() => {
    registerAuthBridge({
      getAccess: () => accessRef.current,
      getRefresh: () => refreshRef.current,
      setAccess: (access) => {
        accessRef.current = access;
        setAccessToken(access);
        // Keep the persisted access token fresh after a silent refresh.
        if (refreshRef.current) {
          writeCookie({ access, refresh: refreshRef.current });
        }
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
      initializing,
      login,
      logout,
    }),
    [accessToken, initializing, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
