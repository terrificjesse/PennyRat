// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureActivities, fixtureIntake } from "@/fixtures";
import { canSubmit } from "@/lib/budget";
import type { TripIntake, TripOption } from "@/lib/types";
import { OptionList } from "@/components/options/OptionList";
import { ResearchNotice } from "./ResearchNotice";
import { SubmitGate } from "./SubmitGate";

afterEach(cleanup);

describe("rendered trip states", () => {
  it("presents a research failure and an operable retry", async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    const message = "Research lost its connection. Your choices are still safe.";

    render(
      createElement(ResearchNotice, {
        state: { status: "error", error: message },
        onRetry: retry,
      }),
    );

    expect(screen.getByRole("alert", { name: "Research failed" })).toHaveTextContent(message);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("names an empty option group and explains that no results matched", () => {
    render(
      createElement(OptionList, {
        title: "Places to recharge",
        emptyMessage: "No lodging matched this trip.",
        options: [] as TripOption[],
        selectedIds: [],
        onSelectionChange: vi.fn(),
      }),
    );

    const group = screen.getByRole("region", { name: "Places to recharge" });
    expect(within(group).getByText("No lodging matched this trip.")).toBeVisible();
    expect(within(group).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps over-remaining options visible and operable with a clear warning", async () => {
    const options = fixtureActivities.filter((option) => option.costCents > 0).slice(0, 2);
    expect(options).toHaveLength(2);
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(OptionList, {
        title: "Things to do",
        options,
        selectedIds: [],
        remainingCents: 0,
        onSelectionChange,
      }),
    );

    expect(screen.getByRole("status", { name: "Things to do affordability" })).toHaveTextContent(
      "Every option here costs more than you have left.",
    );
    expect(screen.getAllByText("Over what’s left")).toHaveLength(options.length);

    const choices = screen.getAllByRole("checkbox", { name: /^Select / });
    for (const choice of choices) expect(choice).toBeEnabled();

    await user.click(choices[0]);
    expect(onSelectionChange).toHaveBeenCalledWith(options[0].id, true);
  });

  it("renders canSubmit blockers and warnings verbatim", () => {
    const picked = fixtureActivities.find((option) => option.costCents > 0);
    if (!picked) throw new Error("The activity fixture needs one priced option.");

    const intake: TripIntake = {
      ...fixtureIntake,
      budgetTotal: picked.costCents - 1,
    };
    const options: TripOption[] = [picked];
    const selectedIds = [picked.id];
    const check = canSubmit(intake, options, selectedIds);

    render(
      createElement(SubmitGate, {
        intake,
        options,
        selectedIds,
        onContinue: vi.fn(),
      }),
    );

    expect(check.blockers.length).toBeGreaterThan(0);
    const blockers = screen.getByRole("list", { name: "What needs fixing" });
    for (const reason of check.blockers) {
      expect(within(blockers).getByText(reason, { exact: true })).toBeVisible();
    }

    const warnings = screen.getByRole("list", { name: "Good to know" });
    for (const reason of check.warnings) {
      expect(within(warnings).getByText(reason, { exact: true })).toBeVisible();
    }
    expect(screen.getByRole("button", { name: "Continue to schedule" })).toBeDisabled();
  });

  it("shows warning-only reasons without blocking the schedule", async () => {
    const check = canSubmit(fixtureIntake, [], []);
    const onContinue = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(SubmitGate, {
        intake: fixtureIntake,
        options: [],
        selectedIds: [],
        onContinue,
      }),
    );

    expect(check.ok).toBe(true);
    const warnings = screen.getByRole("list", { name: "Good to know" });
    for (const reason of check.warnings) {
      expect(within(warnings).getByText(reason, { exact: true })).toBeVisible();
    }

    await user.click(screen.getByRole("button", { name: "Continue to schedule" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
