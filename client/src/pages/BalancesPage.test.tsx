import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router-dom";
import { BalancesPage } from "./BalancesPage";
import type { BalanceSummary, Settlement } from "../lib/api";
import { HOUSEHOLD, ME, ORLANDO, apiError, mockedApi, renderAt, signedInAs } from "../test/render";

vi.mock("../lib/api", async (importOriginal) =>
  (await import("../test/mockApi")).mockApiModule(importOriginal)
);

const OWING_ORLANDO: BalanceSummary = {
  balances: [{ userId: ORLANDO.userId, name: ORLANDO.name, netCents: -488 }],
  totals: { youOweCents: 488, owedToYouCents: 0 },
};

function setUp() {
  signedInAs(ME);
  mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
  mockedApi.balances.mockResolvedValue(OWING_ORLANDO);
  mockedApi.settlements.mockResolvedValue({ settlements: [] });
  renderAt("/balances", <Route path="/balances" element={<BalancesPage />} />);
}

async function openPaymentForm() {
  const user = userEvent.setup();
  await screen.findByText(`You owe ${ORLANDO.name} $4.88`);
  await user.click(screen.getByRole("button", { name: "Record payment" }));
  return user;
}

describe("BalancesPage (UC-07, UC-08)", () => {
  it("records a payment of the full amount owed and reloads the balances", async () => {
    setUp();
    const user = await openPaymentForm();
    expect((screen.getByLabelText("Amount paid ($)") as HTMLInputElement).value).toBe("4.88");

    const settled: Settlement = {
      id: "s-1",
      from: { userId: ME.id, name: ME.name },
      to: { userId: ORLANDO.userId, name: ORLANDO.name },
      amountCents: 488,
      note: null,
      settledAt: "2026-11-02T12:00:00.000Z",
      createdBy: null,
    };
    mockedApi.createSettlement.mockResolvedValue({ settlement: settled });
    mockedApi.balances.mockResolvedValue({
      balances: [{ userId: ORLANDO.userId, name: ORLANDO.name, netCents: 0 }],
      totals: { youOweCents: 0, owedToYouCents: 0 },
    });
    mockedApi.settlements.mockResolvedValue({ settlements: [settled] });

    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(mockedApi.createSettlement).toHaveBeenCalledWith(HOUSEHOLD.id, {
      fromUserId: ME.id,
      toUserId: ORLANDO.userId,
      amountCents: 488,
    });
    expect(await screen.findByText(`You and ${ORLANDO.name} are settled up`)).toBeTruthy();
  });

  it("refuses more than is owed before asking the server", async () => {
    setUp();
    const user = await openPaymentForm();

    await user.clear(screen.getByLabelText("Amount paid ($)"));
    await user.type(screen.getByLabelText("Amount paid ($)"), "5.00");
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(await screen.findByText("That is more than is owed. The most you can record is $4.88.")).toBeTruthy();
    expect(mockedApi.createSettlement).not.toHaveBeenCalled();
  });

  it("says so when nobody else is in the household yet", async () => {
    signedInAs(ME);
    mockedApi.currentHousehold.mockResolvedValue({ household: HOUSEHOLD });
    mockedApi.balances.mockResolvedValue({ balances: [], totals: { youOweCents: 0, owedToYouCents: 0 } });
    mockedApi.settlements.mockResolvedValue({ settlements: [] });
    renderAt("/balances", <Route path="/balances" element={<BalancesPage />} />);

    expect(await screen.findByText(/Nobody else is in this household yet/)).toBeTruthy();
    expect(screen.getByText("No payments recorded yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
  });

  it("refuses an amount that isn't money before asking the server", async () => {
    setUp();
    const user = await openPaymentForm();

    await user.clear(screen.getByLabelText("Amount paid ($)"));
    await user.type(screen.getByLabelText("Amount paid ($)"), "0");
    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect(await screen.findByText("Enter an amount more than zero, like 12.34.")).toBeTruthy();
    expect(mockedApi.createSettlement).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when the balance changed underneath (EXCEEDS_BALANCE)", async () => {
    setUp();
    const user = await openPaymentForm();
    mockedApi.createSettlement.mockRejectedValue(
      apiError(409, "EXCEEDS_BALANCE", "That is more than is currently owed.")
    );

    await user.click(screen.getByRole("button", { name: "Record payment" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nothing was recorded: that is more than is currently owed. The balance has changed since you opened this page, so it has been updated."
    );
    expect(mockedApi.balances).toHaveBeenCalledTimes(2);
  });
});
