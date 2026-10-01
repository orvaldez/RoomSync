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

/** Matches the contract's `InvitationPublic`. */
export type Invitation = {
  id: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  createdAt: string;
};

/** What `GET /invitations/:token` reveals: only the household name. */
export type InvitationPreview = {
  householdName: string;
  expiresAt: string;
};

export type SplitMethod = "EQUAL" | "CUSTOM" | "PERCENTAGE";

/** Matches the contract's `SharePublic`. */
export type Share = {
  userId: string;
  name: string;
  amountOwedCents: number;
  percentBasisPoints: number | null;
};

/** Matches the contract's `ExpensePublic`. */
export type Expense = {
  id: string;
  description: string;
  totalAmountCents: number;
  /** `YYYY-MM-DD` */
  expenseDate: string;
  paidBy: { userId: string; name: string };
  splitMethod: SplitMethod;
  shares: Share[];
  createdAt: string;
};

/**
 * The contract's expense body, shared by preview and create. Participants go
 * in household join order: remainder cents are handed out in request order,
 * so a stable order keeps the same expense splitting the same way everywhere.
 */
/**
 * Matches the contract's `BalancePublic`, from the requester's side: positive
 * `netCents` means that member owes the requester; negative, the reverse.
 */
export type Balance = {
  userId: string;
  name: string;
  netCents: number;
};

export type BalanceSummary = {
  balances: Balance[];
  totals: { youOweCents: number; owedToYouCents: number };
};

/** Matches the contract's `SettlementPublic`: `from` paid `to`. */
export type Settlement = {
  id: string;
  from: { userId: string; name: string };
  to: { userId: string; name: string };
  amountCents: number;
  note: string | null;
  settledAt: string;
};

export type SettlementInput = {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  note?: string;
};

export type ExpenseInput = {
  description: string;
  totalAmountCents: number;
  expenseDate: string;
  paidByUserId: string;
  splitMethod: SplitMethod;
  participants: {
    userId: string;
    amountCents?: number;
    percentBasisPoints?: number;
  }[];
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

  /** OWNER only; a member gets 403 NOT_HOUSEHOLD_OWNER. */
  createInvitation(householdId: string) {
    return request<{ invitation: Invitation }>(
      `/households/${householdId}/invitations`,
      { method: "POST" }
    );
  },

  /** The household name for the confirmation screen (UC-04 step 8). */
  invitation(token: string) {
    return request<{ invitation: InvitationPreview }>(
      `/invitations/${encodeURIComponent(token)}`
    );
  },

  acceptInvitation(token: string) {
    return request<{ household: Household }>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST" }
    );
  },

  /**
   * The shares the server would calculate for this expense, without saving
   * it (UC-05 step 7). The split is only ever calculated on the server, so
   * what the preview shows is exactly what create will store.
   */
  previewExpense(householdId: string, input: ExpenseInput) {
    return request<{ shares: Share[] }>(
      `/households/${householdId}/expenses/preview`,
      { method: "POST", body: input }
    );
  },

  createExpense(householdId: string, input: ExpenseInput) {
    return request<{ expense: Expense }>(`/households/${householdId}/expenses`, {
      method: "POST",
      body: input,
    });
  },

  /** The requester's balance with each other member, derived on every request. */
  balances(householdId: string) {
    return request<BalanceSummary>(`/households/${householdId}/balances`);
  },

  /** Every settlement, newest first, including ones that paid a balance off. */
  settlements(householdId: string) {
    return request<{ settlements: Settlement[] }>(
      `/households/${householdId}/settlements`
    );
  },

  /** 409 EXCEEDS_BALANCE if `from` does not owe `to` at least `amountCents` right now. */
  createSettlement(householdId: string, input: SettlementInput) {
    return request<{ settlement: Settlement }>(
      `/households/${householdId}/settlements`,
      { method: "POST", body: input }
    );
  },
};
