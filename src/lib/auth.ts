// Auth configuration. Token *state* now lives in React Context
// (see context/AuthContext.tsx) rather than localStorage.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
