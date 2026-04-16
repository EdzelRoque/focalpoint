import {
  Clock,
  Shield,
  TrendingUp,
  Target,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";

const miniStats = [
  { icon: Clock, label: "Total focus time", value: "11h 15m", sub: "+23% vs last week" },
  { icon: Shield, label: "Pages blocked", value: "40" },
  { icon: Target, label: "Sessions", value: "7" },
  { icon: TrendingUp, label: "Focus score", value: "87%", sub: "Great week!" },
];

const miniSessions = [
  { goal: "Studying for machine learning exam", duration: "2h 15m", date: "Today" },
  { goal: "Writing research paper on NLP", duration: "1h 30m", date: "Yesterday" },
  { goal: "Reviewing React documentation", duration: "45m", date: "Apr 14" },
];

const BrowserMockup = () => {
  return (
    <div className="relative mx-auto max-w-4xl select-none">
      {/* Browser frame */}
      <div className="overflow-hidden rounded-xl border border-border shadow-2xl shadow-primary/5">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-border bg-[hsl(228,20%,10%)] px-4 py-2.5">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>

          {/* URL bar */}
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 rounded-md bg-[hsl(228,15%,14%)] px-3 py-1">
              <svg className="h-3 w-3 text-muted-foreground/50" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a4.5 4.5 0 00-4.5 4.5c0 1.02.34 1.96.91 2.72L1.22 11.4a.75.75 0 001.06 1.06l3.18-3.18A4.5 4.5 0 108 1z" opacity="0" />
                <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zM4 8a4 4 0 118 0 4 4 0 01-8 0z" clipRule="evenodd" opacity="0.5" />
                <path d="M11.5 3.5L8 1.5v2L11.5 5V3.5z" opacity="0" />
              </svg>
              <span className="font-mono text-[10px] text-muted-foreground/60">
                focalpoint.app/dashboard
              </span>
            </div>
          </div>

          <div className="w-[52px]" />
        </div>

        {/* Dashboard content (miniature) */}
        <div className="flex bg-background" style={{ fontSize: "0.55rem" }}>
          {/* Mini sidebar */}
          <div className="hidden w-28 shrink-0 border-r border-border bg-surface-elevated p-2.5 sm:block">
            <div className="mb-4 flex items-center gap-1.5 px-1.5 pt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary glow-primary" />
              <span className="text-[0.55rem] font-semibold text-foreground">FocalPoint</span>
            </div>
            <nav className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                <BarChart3 className="h-2.5 w-2.5" />
                Dashboard
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                Sessions
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
                <Settings className="h-2.5 w-2.5" />
                Settings
              </div>
            </nav>
            <div className="mt-auto pt-8 flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
              <LogOut className="h-2.5 w-2.5" />
              Sign out
            </div>
          </div>

          {/* Mini main content */}
          <div className="flex-1 p-3 sm:p-4">
            <div className="mb-3">
              <p className="text-[0.65rem] font-semibold text-foreground">Dashboard</p>
              <p className="text-[0.5rem] text-muted-foreground">Your focus overview for this week</p>
            </div>

            {/* Stats */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {miniStats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-2">
                  <div className="mb-1 flex h-4 w-4 items-center justify-center rounded bg-primary/10 text-primary">
                    <stat.icon className="h-2 w-2" />
                  </div>
                  <p className="font-mono text-[0.65rem] font-semibold text-foreground">{stat.value}</p>
                  <p className="text-[0.4rem] text-muted-foreground">{stat.label}</p>
                  {stat.sub && <p className="text-[0.4rem] text-success">{stat.sub}</p>}
                </div>
              ))}
            </div>

            {/* Mini chart placeholder */}
            <div className="mb-3 rounded-lg border border-border bg-card p-2">
              <p className="mb-2 text-[0.5rem] font-medium text-foreground">Focus time this week</p>
              <div className="flex h-16 items-end gap-1 px-1">
                {[60, 45, 90, 22, 75, 30, 15].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-sm bg-primary/30"
                      style={{ height: `${(h / 90) * 100}%` }}
                    >
                      <div
                        className="w-full rounded-sm bg-primary"
                        style={{ height: "60%" }}
                      />
                    </div>
                    <span className="text-[0.35rem] text-muted-foreground">
                      {["M", "T", "W", "T", "F", "S", "S"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini sessions */}
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-2 py-1.5">
                <p className="text-[0.5rem] font-medium text-foreground">Recent sessions</p>
              </div>
              {miniSessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border px-2 py-1.5 last:border-0">
                  <div>
                    <p className="text-[0.5rem] font-medium text-foreground">{s.goal}</p>
                    <p className="text-[0.35rem] text-muted-foreground">{s.date} · {s.duration}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrowserMockup;
