import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { RequireAuth } from "../auth/RequireAuth";
import { Landed, ME, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

const routes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/join/:token"
      element={
        <RequireAuth>
          <Landed name="the invitation" />
        </RequireAuth>
      }
    />
  </>
);

async function logIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginPage (UC-02)", () => {
  it("shows the server's one generic message when the login fails, on neither field", async () => {
    signedInAs(null);
    mockedApi.login.mockRejectedValue(apiError(401, "INVALID_CREDENTIALS", "Invalid email or password."));
    renderAt("/login", routes);

    await logIn("agustin@roomsync.test", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Invalid email or password.");
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("heading", { name: "Log in" })).toBeTruthy();
  });

  it("marks the fields the server names when validation fails", async () => {
    signedInAs(null);
    mockedApi.login.mockRejectedValue(
      apiError(400, "VALIDATION_FAILED", "Validation failed", { email: "Enter a valid email address." })
    );
    renderAt("/login", routes);

    await logIn("not-an-email", "whatever");

    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
  });

  it("sends the user to the dashboard after a successful login", async () => {
    signedInAs(null);
    mockedApi.login.mockResolvedValue({ user: ME });
    renderAt("/login", routes);

    await logIn("agustin@roomsync.test", "roomsync123");

    expect(await screen.findByText("Landed on another page at /")).toBeTruthy();
    expect(mockedApi.login).toHaveBeenCalledWith({ email: "agustin@roomsync.test", password: "roomsync123" });
  });
});

describe("RequireAuth", () => {
  it("sends a signed-out visitor to the login screen", async () => {
    signedInAs(null);
    renderAt("/join/abc123", routes);

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByText(/Landed on the invitation/)).toBeNull();
  });

  it("keeps where they were going and returns them there after login (UC-04 step 7)", async () => {
    signedInAs(null);
    mockedApi.login.mockResolvedValue({ user: ME });
    renderAt("/join/abc123", routes);

    await logIn("agustin@roomsync.test", "roomsync123");

    expect(await screen.findByText("Landed on the invitation at /join/abc123")).toBeTruthy();
  });

  it("lets a signed-in user straight through", async () => {
    signedInAs(ME);
    renderAt("/join/abc123", routes);

    expect(await screen.findByText("Landed on the invitation at /join/abc123")).toBeTruthy();
  });
});
