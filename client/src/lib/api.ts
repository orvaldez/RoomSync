/**
 * Thin wrapper over `fetch` that understands the API contract.
 *
 * Every error response has the same shape (contract Section 1):
 *
 *     { "error": { "code": "...", "message": "...", "fields"?: {...} } }
 *
 * so this turns a non-2xx response into an `ApiError` carrying that `code`.
 * Components branch on `code`, never on `message` — the contract says the
 * wording may change at any time.
 */

export type ApiErrorBody = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? {};
  }
}

/**
 * Whether a request failed because the session is gone — it expired, or the
 * user logged out in another tab. Pages pass this to `refresh()` from
 * `useAuth`, which asks the server again and lets `RequireAuth` send the user
 * to log in, rather than showing a generic error they cannot fix by retrying.
 */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.code === "UNAUTHENTICATED";
}

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type MembershipRole = "OWNER" | "MEMBER";

/** Matches the contract's `HouseholdPublic`. `role` is the requester's own. */
export type Household = {
  id: string;
  name: string;
  createdAt: string;
  role: MembershipRole;
};

/** Matches the contract's `MemberPublic`. No email — the server never sends one. */
export type Member = {
  userId: string;
  name: string;
  role: MembershipRole;
  joinedAt: string;
};

/**
 * `body` is whatever the caller wants to send, serialized below — hence the
 * Omit: intersecting with RequestInit directly would keep the DOM's BodyInit
 * constraint and reject a plain object.
 */
type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      // Send and accept the session cookie. Without this the browser drops it
      // and every authenticated request comes back 401.
      credentials: "same-origin",
    });
  } catch {
    // fetch only rejects when the request never completed — the dev server is
    // down, or the network is gone. An HTTP error status resolves normally.
    throw new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Is it running?",
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown;

  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // A non-JSON body means something upstream of the API answered — a proxy
    // error page, say. Don't let a parse failure surface as a blank screen.
    throw new ApiError(response.status, {
      code: "INVALID_RESPONSE",
      message: "The server returned an unexpected response.",
    });
  }

  if (!response.ok) {
    const body = (payload as { error?: ApiErrorBody } | undefined)?.error;

    throw new ApiError(
      response.status,
      body ?? {
        code: "UNKNOWN_ERROR",
        message: "Something went wrong. Please try again.",
      }
    );
  }

  return payload as T;
}

export const api = {
  register(input: { name: string; email: string; password: string }) {
    return request<{ user: User }>("/auth/register", {
      method: "POST",
      body: input,
    });
  },

  login(input: { email: string; password: string }) {
    return request<{ user: User }>("/auth/login", {
      method: "POST",
      body: input,
    });
  },

  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },

  me() {
    return request<{ user: User }>("/auth/me");
  },

  createHousehold(input: { name: string }) {
    return request<{ household: Household }>("/households", {
      method: "POST",
      body: input,
    });
  },

  /**
   * The signed-in user's household, or null.
   *
   * Belonging to no household is a normal state rather than an error, so the
   * server answers 200 with null and the client chooses between the create
   * screen and the dashboard without treating it as a failure.
   */
  currentHousehold() {
    return request<{ household: Household | null }>("/households/current");
  },

  members(householdId: string) {
    return request<{ members: Member[] }>(`/households/${householdId}/members`);
  },
};
