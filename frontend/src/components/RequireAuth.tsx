import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hasToken } from "@/lib/auth";

// Dashboard pages need a login; without a token, go to /login instead of
// showing an empty dashboard.
const RequireAuth = ({ children }: { children: ReactNode }) =>
  hasToken() ? <>{children}</> : <Navigate to="/login" replace />;

export default RequireAuth;
