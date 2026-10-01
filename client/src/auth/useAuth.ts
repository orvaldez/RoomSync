import { useContext } from "react";
import { AuthContext, type AuthValue } from "./context";

/**
 * Read the auth state. Throws when used outside the provider, so a component
 * mounted in the wrong place fails immediately in development rather than
 * silently behaving as if nobody is signed in.
 */
export function useAuth(): AuthValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }

  return value;
}
