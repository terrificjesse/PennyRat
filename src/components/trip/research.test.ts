import { describe, expect, it, vi } from "vitest";
import { fixtureFlights, fixtureIntake } from "@/fixtures";
import { researchTripOptions } from "./research";

const meta = {
  source: "fixture" as const,
  latencyMs: 4,
  model: "fixture",
  warnings: ["Sample research is in use."],
};

describe("researchTripOptions", () => {
  it("posts intake and validates the matching response schema", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ options: fixtureFlights, meta }),
    );

    const result = await researchTripOptions("flight", fixtureIntake, undefined, fetcher);

    expect(result).toEqual({ options: fixtureFlights, meta });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/research/flights",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ intake: fixtureIntake }),
      }),
    );
  });

  it("rejects a successful response that violates the contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ options: [{ id: "not-a-flight" }], meta }),
    );

    await expect(
      researchTripOptions("flight", fixtureIntake, undefined, fetcher),
    ).rejects.toThrow();
  });

  it("uses the validated API detail for a non-success response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: "invalid_request", detail: "endDate must be after startDate" },
        { status: 400 },
      ),
    );

    await expect(
      researchTripOptions("flight", fixtureIntake, undefined, fetcher),
    ).rejects.toThrow("endDate must be after startDate");
  });

  it("turns a dropped connection into a readable error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      researchTripOptions("flight", fixtureIntake, undefined, fetcher),
    ).rejects.toThrow(
      "Research could not connect to PennyRat. Check your connection and try again.",
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
      researchTripOptions("flight", fixtureIntake, undefined, fetcher),
    ).rejects.toThrow("Research request failed with status 502.");
  });

  it("fails closed when a successful response is HTML", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>Sign in</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      researchTripOptions("flight", fixtureIntake, undefined, fetcher),
    ).rejects.toThrow("Research returned an unreadable response. Please try again.");
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

    const request = researchTripOptions(
      "flight",
      fixtureIntake,
      controller.signal,
      fetcher,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/research/flights",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
