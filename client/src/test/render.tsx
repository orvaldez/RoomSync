import { afterEach, vi, type Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthProvider";
import { ApiError, api, type Household, type Member, type User } from "../lib/api";

/**
 * Shared set-up for the component tests (#76).
 *
 * Every test file mocks `../lib/api` at the module boundary (see
 * `mockApi.ts`), so no test touches the network. Screens render inside the
 * real `AuthProvider` and a `MemoryRouter`, so routing and the session work
 * as they do in the app.
 */

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

/** The mocked `api`, typed so `.mockResolvedValue` checks its argument. */
export const mockedApi = api as unknown as {
  [K in keyof typeof api]: Mock<(typeof api)[K]>;
};

export const ME: User = {
  id: "u-agustin",
  name: "Agustin Lemuz-Juarez",
  email: "agustin@roomsync.test",
  createdAt: "2026-09-01T00:00:00.000Z",
};

export const ORLANDO: Member = {
  userId: "u-orlando",
  name: "Orlando Rodriguez Valdez",
  role: "OWNER",
  joinedAt: "2026-09-01T00:00:00.000Z",
};

export const ME_AS_MEMBER: Member = {
  userId: ME.id,
  name: ME.name,
  role: "MEMBER",
  joinedAt: "2026-09-02T00:00:00.000Z",
};

export const HOUSEHOLD: Household = {
  id: "h-apartment-41",
  name: "Apartment 41",
  createdAt: "2026-09-01T00:00:00.000Z",
  role: "MEMBER",
};

export function apiError(status: number, code: string, message: string, fields?: Record<string, string>) {
  return new ApiError(status, { code, message, fields });
}

/** Signed in as `user`, or signed out when `user` is null (GET /auth/me answers 401). */
export function signedInAs(user: User | null) {
  if (user) {
    mockedApi.me.mockResolvedValue({ user });
  } else {
    mockedApi.me.mockRejectedValue(apiError(401, "UNAUTHENTICATED", "You must be logged in to do that."));
  }
}

/** Shows where the router ended up, so a test can assert on a redirect. */
function Landed({ name }: { name: string }) {
  const location = useLocation();
  return (
    <p>
      Landed on {name} at {location.pathname}
    </p>
  );
}

/**
 * Render `routes` at `path`. Any path the routes don't cover renders a
 * "Landed on …" marker, so navigation away from the screen under test shows up.
 */
export function renderAt(path: string, routes: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          {routes}
          <Route path="*" element={<Landed name="another page" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

export { Landed };
