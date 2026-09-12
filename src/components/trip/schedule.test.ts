import { describe, expect, it, vi } from "vitest";
import { fixtureIntake, fixtureOptions } from "@/fixtures";
import { buildTripSchedule } from "./schedule";

const itinerary = {
  days: [
    {
      date: "2026-10-12",
      blocks: [],
      daySpendCents: 0,
      warnings: [],
    },
  ],
  totalCents: 0,
  unscheduled: [],
  warnings: [],
};

describe("buildTripSchedule", () => {
  it("posts the selected trip and validates the itinerary", async () => {
    const selectedIds = [fixtureOptions[0].id];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ itinerary }),
    );

    await expect(
      buildTripSchedule(fixtureIntake, fixtureOptions, selectedIds, undefined, fetcher),
    ).resolves.toEqual(itinerary);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/schedule",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          intake: fixtureIntake,
          options: fixtureOptions,
          selectedIds,
        }),
      }),
    );
  });

  it("rejects an invalid itinerary response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ itinerary: { totalCents: "$0" } }),
    );

    await expect(
      buildTripSchedule(fixtureIntake, fixtureOptions, [], undefined, fetcher),
    ).rejects.toThrow();
  });
});
