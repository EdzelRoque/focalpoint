// Settings: account fields, strict mode, and sensitivity (Standard only for now).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import axios from "axios";
import { toast } from "sonner";
import Settings from "./Settings";
import { renderAt, API } from "@/test/render";

vi.mock("axios");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const profile = (prefs = { blockSensitivity: "standard", strictMode: false }) => ({
  data: { username: "chem.student", email: "chem@school.edu", preferences: prefs },
});

beforeEach(() => {
  localStorage.setItem("token", "tok");
  vi.mocked(axios.get).mockResolvedValue(profile());
  vi.mocked(axios.put).mockResolvedValue({ data: {} });
});

const open = async () => {
  renderAt("/dashboard/settings", <Settings />);
  await waitFor(() => expect(screen.getByDisplayValue("chem.student")).toBeInTheDocument());
};
const save = () => fireEvent.click(screen.getByText("Save changes"));

describe("block sensitivity (coming soon)", () => {
  it("is marked Coming soon, blurred, and cannot be changed", async () => {
    await open();
    const slider = screen.getByLabelText("Block sensitivity");
    expect(slider).toBeDisabled();
    expect(screen.getByTestId("sensitivity-control")).toHaveClass("blur-[1px]");
    expect(screen.getByTestId("sensitivity-control")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText("Coming soon")).toHaveLength(2); // sensitivity + weekly report
    expect(screen.getByText("How aggressively to block: Standard")).toBeInTheDocument();
  });

  it("always saves Standard", async () => {
    await open();
    save();
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    expect(vi.mocked(axios.put).mock.calls[0][1]).toMatchObject({ blockSensitivity: "standard" });
  });
});

describe("saving", () => {
  it("sends username, email and strict mode with the token, and remembers the new username", async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue("chem.student"), { target: { value: "renamed_user" } });
    fireEvent.click(screen.getByText("Strict mode").closest("div")!.parentElement!.querySelector("button")!);
    save();
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    expect(axios.put).toHaveBeenCalledWith(
      `${API}/auth/settings`,
      { username: "renamed_user", email: "chem@school.edu", blockSensitivity: "standard", strictMode: true },
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(localStorage.getItem("username")).toBe("renamed_user");
    expect(toast.success).toHaveBeenCalled();
  });

  it("loads strict mode from the account", async () => {
    vi.mocked(axios.get).mockResolvedValue(profile({ blockSensitivity: "standard", strictMode: true }));
    await open();
    save();
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    expect(vi.mocked(axios.put).mock.calls[0][1]).toMatchObject({ strictMode: true });
  });

  it("shows the backend's error (e.g. username taken)", async () => {
    vi.mocked(axios.put).mockRejectedValue({ response: { data: { error: "Username is already taken" } } });
    await open();
    save();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Username is already taken"));
    expect(localStorage.getItem("username")).toBeNull();
  });
});
