// Register and login pages.
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import axios from "axios";
import Login from "./Login";
import Register from "./Register";
import { renderAt, API } from "@/test/render";

vi.mock("axios");

const fill = (placeholderOrLabel: RegExp, value: string) => {
  const el = screen.getAllByRole("textbox").concat(Array.from(document.querySelectorAll('input[type="password"]')) as HTMLElement[])
    .find((e) => placeholderOrLabel.test(e.getAttribute("placeholder") ?? "") || placeholderOrLabel.test(e.getAttribute("type") ?? ""));
  if (!el) throw new Error(`no input matching ${placeholderOrLabel}`);
  fireEvent.change(el, { target: { value } });
};
const submit = () => fireEvent.submit(document.querySelector("form")!);

describe("login", () => {
  it("stores the token and username, then goes home", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { token: "tok", username: "chem.student" } });
    renderAt("/login", <Login />);
    fill(/@/, "chem@school.edu");
    fill(/password/, "Sup3r$ecret");
    submit();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(axios.post).toHaveBeenCalledWith(`${API}/auth/login`, { email: "chem@school.edu", password: "Sup3r$ecret" });
    expect(localStorage.getItem("token")).toBe("tok");
    expect(localStorage.getItem("username")).toBe("chem.student");
  });

  it("shows the backend error and stores nothing on failure", async () => {
    vi.mocked(axios.post).mockRejectedValue({ response: { data: { error: "Invalid email or password" } } });
    renderAt("/login", <Login />);
    fill(/@/, "chem@school.edu");
    fill(/password/, "wrong");
    submit();
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("shows the success message passed from registration", () => {
    renderAt("/login", <Login />, { message: "Account successfully created, please login." });
    expect(screen.getByText("Account successfully created, please login.")).toBeInTheDocument();
  });
});

describe("register", () => {
  it("creates the account and sends the student to login", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    renderAt("/register", <Register />);
    const [username, email] = screen.getAllByRole("textbox");
    fireEvent.change(username, { target: { value: "chem.student" } });
    fireEvent.change(email, { target: { value: "chem@school.edu" } });
    fill(/password/, "Sup3r$ecret");
    submit();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(axios.post).toHaveBeenCalledWith(`${API}/auth/register`, {
      username: "chem.student",
      email: "chem@school.edu",
      password: "Sup3r$ecret",
    });
  });

  it("shows the backend error (e.g. weak password)", async () => {
    vi.mocked(axios.post).mockRejectedValue({ response: { data: { error: "Password must contain at least one digit" } } });
    renderAt("/register", <Register />);
    submit();
    expect(await screen.findByText("Password must contain at least one digit")).toBeInTheDocument();
  });
});
