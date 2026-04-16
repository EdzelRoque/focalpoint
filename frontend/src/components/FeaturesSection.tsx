import { motion } from "framer-motion";
import { Brain, Shield, BarChart3, Zap } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Goal-Aware AI",
    description:
      "Set your focus goal in plain English. The AI evaluates every page against your intent — not a static blocklist.",
  },
  {
    icon: Shield,
    title: "Soft Block Overlay",
    description:
      "Distracting pages get a non-intrusive overlay with the AI's reasoning. Override if you need to.",
  },
  {
    icon: BarChart3,
    title: "Focus Dashboard",
    description:
      "Track your session history, view productivity scores, and see which sites cost you the most time.",
  },
  {
    icon: Zap,
    title: "Instant Classification",
    description:
      "Redis-cached decisions mean sub-second responses. No lag, no interruptions to your flow.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="relative py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Features
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Not just a blocklist
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Every other focus tool blocks youtube.com. FocalPoint blocks the gaming videos and lets through the tutorials.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
