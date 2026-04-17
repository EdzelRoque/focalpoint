import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut } from 'lucide-react';

const Navbar = () => {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const username = localStorage.getItem("username");
  const token = localStorage.getItem("token");
  const isLoggedIn = !!token; // Turns the token into a true/false boolean

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');

    // Force a hard refresh to the landing page so the state completely clears
    window.location.href = '/';
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary glow-primary" />
          <span className="text-sm font-semibold tracking-wide text-foreground">
            FocalPoint
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <span className="text-sm font-medium text-foreground">
                Hello, {username}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              {isLanding && (
                <Link
                  to="/register"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Get started
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
