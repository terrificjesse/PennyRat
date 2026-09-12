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

  it("posts exclusions and pinned positions for itinerary edits", async () => {
    const selectedIds = [fixtureOptions[0].id];
    const excludedIds = [fixtureOptions[1].id];
    const pinned = [
      {
        id: fixtureOptions[0].id,
        date: fixtureIntake.startDate,
        startMinutes: 9 * 60,
      },
    ];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ itinerary }));

    await buildTripSchedule(
      fixtureIntake,
      fixtureOptions,
      selectedIds,
      undefined,
      fetcher,
      { excludedIds, pinned },
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/schedule",
      expect.objectContaining({
        body: JSON.stringify({
          intake: fixtureIntake,
          options: fixtureOptions,
          selectedIds,
          excludedIds,
          pinned,
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

  it("turns a dropped connection into a readable error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      buildTripSchedule(fixtureIntake, fixtureOptions, [], undefined, fetcher),
    ).rejects.toThrow(
      "Scheduling could not connect to PennyRat. Check your connection and try again.",
    );
  });

  it("includes the status when a proxy returns an HTML error page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>Bad gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      buildTripSchedule(fixtureIntake, fixtureOptions, [], undefined, fetcher),
    ).rejects.toThrow("Scheduling failed with status 502.");
  });

  it("fails closed when a successful response is HTML", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      buildTripSchedule(fixtureIntake, fixtureOptions, [], undefined, fetcher),
    ).rejects.toThrow("Scheduling returned an unreadable response. Please try again.");
  });

  it("forwards cancellation to fetch and preserves AbortError", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The request was cancelled.", "AbortError")),
          { once: true },
        );
      }),
    );

    const request = buildTripSchedule(
      fixtureIntake,
      fixtureOptions,
      [],
      controller.signal,
      fetcher,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/schedule",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
