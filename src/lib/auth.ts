// Auth configuration. Token *state* lives in React Context
// (see context/AuthContext.tsx) rather than localStorage.

// Backend API base URL — read from the environment (.env.local / host config).
// Set NEXT_PUBLIC_API_URL; see .env.example.
export const API_URL = process.env.NEXT_PUBLIC_API_URL as string;
