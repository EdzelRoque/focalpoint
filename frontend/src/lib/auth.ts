import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

export const LOGIN_EXPIRED_MESSAGE = "Your login expired. Sign in again.";

export const hasToken = () => Boolean(localStorage.getItem("token"));

const isUnauthorized = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 401;

/**
 * Returns a handler for API errors on signed-in pages. When the backend
 * rejects the token (401: expired or invalid) it clears the stale login and
 * sends the student to /login with LOGIN_EXPIRED_MESSAGE, and returns true.
 * Any other error returns false so the page can handle it as before.
 */
export const useLoginExpiredRedirect = () => {
  const navigate = useNavigate();
  return useCallback(
    (error: unknown) => {
      if (!isUnauthorized(error)) return false;
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      navigate("/login", { replace: true, state: { message: LOGIN_EXPIRED_MESSAGE, tone: "warning" } });
      return true;
    },
    [navigate],
  );
};
