// Session history: every session listed with its stats, filterable.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import axios from "axios";
import Sessions from "./Sessions";
import { renderAt, session } from "@/test/render";

vi.mock("axios");

beforeEach(() => localStorage.setItem("token", "tok"));

const show = (sessions: unknown[]) => {
  vi.mocked(axios.get).mockResolvedValue({ data: sessions });
  renderAt("/dashboard/sessions", <Sessions />);
};

describe("session history", () => {
  it("lists sessions newest first with duration, or 'Active now' while running", async () => {
    show([
      session({ sessionGoal: "Older chemistry review", startTime: "2026-11-02T09:00:00", actualEndTime: "2026-11-02T10:15:00" }),
      session({ sessionGoal: "Current essay outline", startTime: "2026-11-06T09:00:00", actualEndTime: null, isActive: true }),
    ]);
    await screen.findByText("Current essay outline");
    const text = document.body.textContent!;
    expect(text.indexOf("Current essay outline")).toBeLessThan(text.indexOf("Older chemistry review"));
    expect(screen.getByText("Active now")).toBeInTheDocument();
    expect(screen.getByText("1h 15m")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    show([session({ sessionGoal: "Chemistry problem set" }), session({ sessionGoal: "History essay draft" })]);
    await screen.findByText("History essay draft");
    fireEvent.change(screen.getByPlaceholderText("Search by goal..."), { target: { value: "chem" } });
    expect(screen.queryByText("History essay draft")).not.toBeInTheDocument();
    expect(screen.getByText("Chemistry problem set")).toBeInTheDocument();
  });

  it("shows nothing when signed out (no request)", () => {
    localStorage.clear();
    renderAt("/dashboard/sessions", <Sessions />);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
