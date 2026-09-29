import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type User } from "../lib/api";
import { AuthContext, type AuthStatus } from "./context";

/**
 * Who is signed in, for the whole app.
 *
 * `status` starts as "loading" because on a fresh page load we genuinely do
 * not know yet — the session lives in an httpOnly cookie the JavaScript
 * cannot read, so the only way to find out is to ask the server. Rendering
 * the login screen before that answer arrives would flash it at users who are
 * already signed in, on every refresh.
 */

type Session = { user: User | null; status: AuthStatus };

/**
 * Ask the server who we are.
 *
 * Every failure resolves to "anonymous" rather than throwing: a 401 is the
 * ordinary not-signed-in answer, and a network error or 500 during a boot
 * check has nothing useful to show. The next real action will surface a
 * genuine problem.
 */
async function fetchSession(): Promise<Session> {
  try {
    const { user } = await api.me();
    return { user, status: "authenticated" };
  } catch {
    return { user: null, status: "anonymous" };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    const session = await fetchSession();
    setUser(session.user);
    setStatus(session.status);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const session = await fetchSession();
      // StrictMode mounts effects twice in development. Without this guard
      // the first run's response can land after the second and set state on a
      // component that has already been torn down.
      if (cancelled) return;
      setUser(session.user);
      setStatus(session.status);
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  const logIn = useCallback(async (email: string, password: string) => {
    // Let ApiError propagate: the form renders the field errors and the
    // INVALID_CREDENTIALS message, which is not this provider's decision.
    const { user: signedIn } = await api.login({ email, password });
    setUser(signedIn);
    setStatus("authenticated");
  }, []);

  const logOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Clear locally even if the request failed. Leaving a stale user on
      // screen after someone pressed log out is worse than a server-side
      // session that expires on its own.
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, logIn, logOut, refresh }),
    [status, user, logIn, logOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
