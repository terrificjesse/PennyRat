// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectableCard } from "./SelectableCard";
import { fixtureActivities } from "@/fixtures";

/**
 * The card is one big button, and it has to behave like one.
 *
 * It briefly did not: the title sits inside a `label` that already reaches the checkbox
 * through `htmlFor`, so a card-wide click handler fired on top of it and undid the
 * toggle. Every click was cancelling itself out, which read as "the button needs
 * clicking twice".
 */

const option = fixtureActivities.find((entry) => entry.id === "act_sensoji")!;

afterEach(cleanup);

function renderCard(selected = false) {
  const onSelectedChange = vi.fn();
  render(
    createElement(SelectableCard, { option, selected, onSelectedChange }),
  );
  return onSelectedChange;
}

describe("clicking a selectable card", () => {
  it("toggles once when the title is clicked", async () => {
    const onSelectedChange = renderCard();
    await userEvent.click(screen.getByRole("heading", { name: option.title }));

    expect(onSelectedChange).toHaveBeenCalledTimes(1);
    expect(onSelectedChange).toHaveBeenCalledWith(option.id, true);
  });

  it("toggles once when a dead area of the card is clicked", async () => {
    const onSelectedChange = renderCard();
    await userEvent.click(screen.getByText("trip total"));

    expect(onSelectedChange).toHaveBeenCalledTimes(1);
    expect(onSelectedChange).toHaveBeenCalledWith(option.id, true);
  });

  it("toggles once when the checkbox itself is clicked", async () => {
    const onSelectedChange = renderCard();
    await userEvent.click(screen.getByRole("checkbox"));

    expect(onSelectedChange).toHaveBeenCalledTimes(1);
  });

  it("asks to deselect when it is already selected", async () => {
    const onSelectedChange = renderCard(true);
    await userEvent.click(screen.getByText("trip total"));

    expect(onSelectedChange).toHaveBeenCalledWith(option.id, false);
  });

  it("leaves the map link alone", async () => {
    const onSelectedChange = renderCard();
    const link = screen.queryByRole("link");

    if (link) {
      await userEvent.click(link);
      expect(onSelectedChange).not.toHaveBeenCalled();
    }
  });
});
