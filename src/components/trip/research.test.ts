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
});
