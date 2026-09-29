import { createContext } from "react";
import type { User } from "../lib/api";

/**
 * The context object lives in its own module so the provider file exports
 * only a component. Mixing the two breaks Vite's fast refresh, which can only
 * hot-reload a module whose exports are all components.
 */

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthValue = {
  status: AuthStatus;
  user: User | null;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);
