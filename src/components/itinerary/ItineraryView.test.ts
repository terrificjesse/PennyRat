import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  FlightOption,
  Itinerary,
  ScheduleBlock,
  TripIntake,
} from "@/lib/types";
import { ItineraryView } from "./ItineraryView";

const lisbonTrip: TripIntake = {
  origin: "JFK",
  destination: "Lisbon, Portugal",
  startDate: "2026-11-02",
  endDate: "2026-11-08",
  travelers: 1,
  budgetTotal: 250_000,
  interests: ["food", "history", "art"],
  pace: "packed",
};

const overnightFlight: FlightOption = {
  id: "flt_lisbon_overnight",
  kind: "flight",
  bucket: "flights",
  title: "Overnight flight to Lisbon",
  costCents: 82_000,
  costBasis: "per_party",
  estimated: true,
  confidence: "high",
  direction: "outbound",
  legs: [
    {
      from: "JFK",
      to: "LIS",
      departLocal: "2026-11-02T20:00",
      arriveLocal: "2026-11-03T08:00",
      carrier: "TAP Air Portugal",
      flightNo: "TP210",
      durationMinutes: 420,
    },
  ],
  stops: 0,
  totalDurationMinutes: 420,
  cabin: "economy",
  baggageIncluded: true,
};

function renderItinerary(itinerary: Itinerary): string {
  return renderToStaticMarkup(
    createElement(ItineraryView, {
      itinerary,
      intake: lisbonTrip,
      options: [overnightFlight],
    }),
  );
}

function baseItinerary(days: Itinerary["days"]): Itinerary {
  return {
    days,
    totalCents: 98_000,
    unscheduled: [],
    warnings: [],
  };
}

describe("ItineraryView edge cases", () => {
  it("renders a free-only day as open destination time", () => {
    const markup = renderItinerary(
      baseItinerary([
        {
          date: "2026-11-04",
          blocks: [
            {
              start: "2026-11-04T08:00",
              end: "2026-11-04T22:00",
              kind: "free",
              title: "Nothing booked yet",
              note: "Time at the destination with no plans against it",
              costCents: 0,
            },
          ],
          daySpendCents: 0,
          warnings: [],
        },
      ]),
    );

    expect(markup).toContain("Open time");
    expect(markup).toContain("Nothing booked yet");
    expect(markup).toContain("Time at the destination with no plans against it");
    expect(markup).not.toContain("Travel day");
  });

  it("renders a genuinely in-air day as travel", () => {
    const markup = renderItinerary(
      baseItinerary([
        {
          date: "2026-11-02",
          blocks: [],
          daySpendCents: 82_000,
          warnings: [],
        },
      ]),
    );

    expect(markup).toContain("Travel day");
    expect(markup).toContain(
      "Your selected journey is in progress, so no destination activities are scheduled.",
    );
  });

  it("resolves an unscheduled flight and renders its reason verbatim", () => {
    const reason =
      "overlaps TP212, which you also picked — you can only be on one";
    const itinerary = baseItinerary([]);
    itinerary.unscheduled = [{ id: overnightFlight.id, reason }];
    const markup = renderItinerary(itinerary);

    expect(markup).toContain(overnightFlight.title);
    expect(markup).toContain(reason);
  });

  it("renders a packed plan with more than fifteen outings", () => {
    const outings: ScheduleBlock[] = Array.from({ length: 16 }, (_, index) => {
      const hour = 8 + Math.floor(index / 2);
      const startMinute = index % 2 === 0 ? "00" : "30";
      const endHour = startMinute === "00" ? hour : hour + 1;
      const endMinute = startMinute === "00" ? "30" : "00";
      return {
        start: `2026-11-05T${String(hour).padStart(2, "0")}:${startMinute}`,
        end: `2026-11-05T${String(endHour).padStart(2, "0")}:${endMinute}`,
        kind: "activity",
        title: `Lisbon outing ${index + 1}`,
        costCents: 1_000,
      };
    });
    const markup = renderItinerary(
      baseItinerary([
        {
          date: "2026-11-05",
          blocks: outings,
          daySpendCents: 16_000,
          warnings: ["A full day — leave room to slow down if you need it."],
        },
      ]),
    );

    for (const outing of outings) expect(markup).toContain(outing.title);
  });
});
