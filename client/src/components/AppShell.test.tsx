import { describe, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ME, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

/** The header on every signed-in screen. */
const routes = (
  <>
    <Route path="/" element={<p>The dashboard</p>} />
    <Route
      path="/history"
      element={
        <AppShell>
          <p>The history page</p>
        </AppShell>
      }
    />
  </>
);

describe("AppShell", () => {
  it("goes back to the dashboard when RoomSync is clicked", async () => {
    signedInAs(ME);
    renderAt("/history", routes);

    await userEvent.click(screen.getByRole("link", { name: "RoomSync" }));

    await screen.findByText("The dashboard");
  });
});
