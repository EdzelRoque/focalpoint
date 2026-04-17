import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import BrowserMockup from "@/components/BrowserMockup";

const HeroSection = () => {
  const isLoggedIn = !!localStorage.getItem("token");

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-14">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5"
        >
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
          <span className="text-xs font-medium text-muted-foreground">
            AI-powered focus assistant
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl"
        >
          Focus on what matters.{' '}
          <span className="text-gradient">AI blocks the rest.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          FocalPoint understands your goal and uses AI to classify every page
          you visit in real time. Stay productive without rigid blocklists.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex items-center justify-center gap-4"
        >
          {isLoggedIn ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
              >
                Start focusing — free
              </Link>
              <Link
                to="/login"
                className="rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Sign in
              </Link>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16"
        >
          <BrowserMockup />
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
