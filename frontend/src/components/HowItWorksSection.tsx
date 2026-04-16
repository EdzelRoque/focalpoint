import { motion } from "framer-motion";
import { ArrowDown, Play } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Install the extension",
    description: "Add FocalPoint to Chrome from the Chrome Web Store. Takes 30 seconds.",
  },
  {
    number: "02",
    title: "Create an account",
    description: "Sign up so your sessions sync to the dashboard. Login from the extension popup.",
  },
  {
    number: "03",
    title: "Set your goal and start",
    description: "Click the extension icon, type your goal in plain English, and press Start. That's it.",
  },
  {
    number: "04",
    title: "Browse normally",
    description: "FocalPoint runs silently. Distractions get blocked. Relevant pages get through.",
  },
];

const HowItWorksSection = () => {
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            How it works
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Up and running in minutes
          </h2>
        </motion.div>

        <div className="grid items-start gap-16 md:grid-cols-2">
          {/* Steps */}
          <div className="relative space-y-10">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-[44px] bottom-4 w-px bg-border" />

            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative flex gap-5"
              >
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}

            {/* Scroll hint */}
            <div className="flex justify-center pt-2">
              <ArrowDown className="h-5 w-5 animate-bounce text-muted-foreground/40" />
            </div>
          </div>

          {/* Demo placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="sticky top-32 flex aspect-video items-center justify-center rounded-xl border border-border bg-card"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Demo GIF goes here — record after extension is complete
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
