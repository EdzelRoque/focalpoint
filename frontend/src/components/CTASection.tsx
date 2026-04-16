import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const CTASection = () => {
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-border bg-card p-12 text-center md:p-16"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 h-[300px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Ready to focus?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Install the Chrome extension, set your goal, and let AI keep you
              on track.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                to="/register"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
              >
                Create free account
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="mx-auto mt-16 max-w-6xl border-t border-border px-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              FocalPoint
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built by Edzel Roque · © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
