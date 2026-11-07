// The weekly dashboard: focus time and stats must never lose or double-count
// a session.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import axios from "axios";
import Dashboard from "./Dashboard";
import { renderAt, session, API } from "@/test/render";

vi.mock("axios");

// "Friday 6 Nov 2026, noon": the week runs Mon 2 Nov to Sun 8 Nov
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T12:00:00"));
  localStorage.setItem("token", "tok");
});

// A stat card is <p>value</p><p>label</p> (the sidebar also says "Sessions", as a link)
const stat = (label: string) => screen.getByText(label, { selector: "p" }).previousElementSibling?.textContent;

const show = async (sessions: unknown[]) => {
  vi.mocked(axios.get).mockResolvedValue({ data: sessions });
  renderAt("/dashboard", <Dashboard />);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
};

describe("this week's stats", () => {
  it("adds up focus time, blocks, sessions and overrides for this week only", async () => {
    await show([
      session({ startTime: "2026-11-04T10:00:00", actualEndTime: "2026-11-04T11:00:00", blockCount: 3, overrideCount: 1 }),
      session({ startTime: "2026-11-02T09:00:00", actualEndTime: "2026-11-02T09:30:00", blockCount: 1 }),
      session({ startTime: "2026-11-06T11:00:00", actualEndTime: null, isActive: true, blockCount: 2 }),
      session({ startTime: "2026-11-01T20:00:00", actualEndTime: "2026-11-01T21:00:00", blockCount: 5, overrideCount: 4 }), // last week
    ]);
    await waitFor(() => expect(stat("Total focus time")).toBe("1h 30m"));
    expect(stat("Pages blocked")).toBe("6");
    expect(stat("Sessions")).toBe("3");
    expect(stat("Overrides")).toBe("1");
  });

  it("counts focus time only for finished sessions (a running session adds no minutes yet)", async () => {
    await show([session({ startTime: "2026-11-06T09:00:00", actualEndTime: null, isActive: true })]);
    await waitFor(() => expect(stat("Sessions")).toBe("1"));
    expect(stat("Total focus time")).toBe("0m");
  });

  it("uses the recorded end time for sessions that ran out on their own", async () => {
    // backend sets actualEndTime = expectedEndTime when a timed session expires
    await show([session({ startTime: "2026-11-03T14:00:00", actualEndTime: "2026-11-03T14:45:00" })]);
    await waitFor(() => expect(stat("Total focus time")).toBe("45m"));
  });

  it("the week starts on Monday at midnight", async () => {
    await show([
      session({ startTime: "2026-11-02T00:00:00", actualEndTime: "2026-11-02T00:10:00" }), // Monday 00:00, in
      session({ startTime: "2026-11-01T23:59:00", actualEndTime: "2026-11-02T00:20:00" }), // Sunday before, out
    ]);
    await waitFor(() => expect(stat("Sessions")).toBe("1"));
    expect(stat("Total focus time")).toBe("10m");
  });

  it("shows zeros with no sessions, and survives a failed request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(axios.get).mockRejectedValue(new Error("network"));
    renderAt("/dashboard", <Dashboard />);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(stat("Total focus time")).toBe("0m");
    expect(stat("Pages blocked")).toBe("0");
  });

  it("asks for the student's sessions with their token", async () => {
    await show([]);
    expect(axios.get).toHaveBeenCalledWith(`${API}/api/sessions`, { headers: { Authorization: "Bearer tok" } });
  });
});
