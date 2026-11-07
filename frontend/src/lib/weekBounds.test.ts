import { describe, it, expect } from "vitest";
import { getWeekBounds } from "./weekBounds";

describe("getWeekBounds (weeks run Monday 00:00 to the next Monday 00:00)", () => {
  it.each([
    ["Monday", "2026-11-02T08:00:00"],
    ["Friday", "2026-11-06T12:00:00"],
    ["Sunday night", "2026-11-08T23:59:59"],
  ])("%s belongs to the week of Mon 2 Nov", (_label, now) => {
    const { start, end } = getWeekBounds(new Date(now));
    expect(start).toEqual(new Date("2026-11-02T00:00:00"));
    expect(end).toEqual(new Date("2026-11-09T00:00:00"));
  });

  it("does not modify the date passed in", () => {
    const now = new Date("2026-11-06T12:00:00");
    getWeekBounds(now);
    expect(now).toEqual(new Date("2026-11-06T12:00:00"));
  });
});
