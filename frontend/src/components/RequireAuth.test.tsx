// Signed-in pages: no token, or an expired one, sends the student to /login.
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import axios from "axios";
import RequireAuth from "./RequireAuth";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";

vi.mock("axios");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const EXPIRED = "Your login expired. Sign in again.";
const pages = [
  ["/dashboard", <Dashboard />],
  ["/dashboard/sessions", <Sessions />],
  ["/dashboard/settings", <Settings />],
] as const;

const renderApp = (path: string, page: JSX.Element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<RequireAuth>{page}</RequireAuth>} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  );

const unauthorized = { response: { status: 401, data: { error: "Invalid or expired token." } } };

describe.each(pages)("%s", (path, page) => {
  it("without a login, goes to /login (no API call, no message)", () => {
    renderApp(path, page);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(axios.get).not.toHaveBeenCalled();
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument();
  });

  it("with an expired login, clears it and goes to /login with the expired message", async () => {
    localStorage.setItem("token", "expired");
    localStorage.setItem("username", "chem.student");
    vi.mocked(axios.get).mockRejectedValue(unauthorized);
    renderApp(path, page);
    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("username")).toBeNull();
  });

  it("other errors do not sign the student out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("token", "tok");
    vi.mocked(axios.get).mockRejectedValue({ response: { status: 500 } });
    renderApp(path, page);
    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(localStorage.getItem("token")).toBe("tok");
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument();
  });
});

it("saving settings with an expired login goes to /login with the message", async () => {
  localStorage.setItem("token", "tok");
  vi.mocked(axios.get).mockResolvedValue({
    data: { username: "chem.student", email: "chem@school.edu", preferences: { blockSensitivity: "standard", strictMode: false } },
  });
  vi.mocked(axios.put).mockRejectedValue(unauthorized);
  renderApp("/dashboard/settings", <Settings />);
  await screen.findByDisplayValue("chem.student");
  fireEvent.click(screen.getByText("Save changes"));
  expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
  expect(localStorage.getItem("token")).toBeNull();
});
