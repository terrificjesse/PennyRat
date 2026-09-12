// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripCelebration } from "./TripCelebration";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TripCelebration", () => {
  it("announces the send-off and completes after its brief reveal", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();

    render(createElement(TripCelebration, { open: true, onComplete }));

    expect(screen.getByRole("status", { name: "Enjoy your trip" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Enjoy your trip." })).toBeVisible();
    expect(onComplete).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("renders nothing after the trip has already been celebrated", () => {
    render(
      createElement(TripCelebration, {
        open: false,
        onComplete: () => undefined,
      }),
    );

    expect(screen.queryByRole("status", { name: "Enjoy your trip" })).toBeNull();
  });
});
