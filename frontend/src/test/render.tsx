import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactElement } from "react";

// Shows where the app navigated to, so tests can assert on redirects
const WhereAmI = () => <div data-testid="location">{useLocation().pathname}</div>;

export const renderAt = (path: string, element: ReactElement, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="*" element={<WhereAmI />} />
      </Routes>
    </MemoryRouter>,
  );

export const API = "https://focalpoint-q8r5.onrender.com";

type S = Partial<{
  _id: string;
  sessionGoal: string;
  startTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  blockCount: number;
  overrideCount: number;
}>;

let n = 0;
export const session = (o: S = {}) => ({
  _id: `s${++n}`,
  sessionGoal: "Study for my organic chemistry midterm",
  startTime: "2026-11-04T10:00:00",
  actualEndTime: "2026-11-04T11:00:00",
  isActive: false,
  blockCount: 0,
  overrideCount: 0,
  ...o,
});
