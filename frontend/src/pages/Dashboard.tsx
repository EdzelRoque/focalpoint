import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Clock,
  Shield,
  TrendingUp,
  BarChart3,
  Settings,
  LogOut,
  Target,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const weeklyData = [
  { day: "Mon", minutes: 120, blocks: 8 },
  { day: "Tue", minutes: 90, blocks: 5 },
  { day: "Wed", minutes: 180, blocks: 12 },
  { day: "Thu", minutes: 45, blocks: 3 },
  { day: "Fri", minutes: 150, blocks: 9 },
  { day: "Sat", minutes: 60, blocks: 2 },
  { day: "Sun", minutes: 30, blocks: 1 },
];

const sessions = [
  {
    id: 1,
    goal: "Studying for machine learning exam",
    duration: "2h 15m",
    blocks: 8,
    overrides: 1,
    date: "Today",
  },
  {
    id: 2,
    goal: "Writing research paper on NLP",
    duration: "1h 30m",
    blocks: 5,
    overrides: 0,
    date: "Yesterday",
  },
  {
    id: 3,
    goal: "Reviewing React documentation",
    duration: "45m",
    blocks: 3,
    overrides: 2,
    date: "Apr 14",
  },
  {
    id: 4,
    goal: "Completing assignment on data structures",
    duration: "3h 00m",
    blocks: 12,
    overrides: 1,
    date: "Apr 13",
  },
];

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </div>
    <p className="text-2xl font-semibold font-mono text-foreground">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    {sub && <p className="mt-0.5 text-xs text-success">{sub}</p>}
  </div>
);

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-screen w-56 flex-col border-r border-border bg-surface-elevated p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2 pt-2">
          <span className="h-2 w-2 rounded-full bg-primary glow-primary" />
          <span className="text-sm font-semibold text-foreground">
            FocalPoint
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          <SidebarLink icon={BarChart3} label="Dashboard" active />
          <SidebarLink icon={Clock} label="Sessions" />
          <SidebarLink icon={Settings} label="Settings" />
        </nav>

        <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </aside>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-border bg-surface-elevated p-4 md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-sm font-semibold text-foreground">FocalPoint</span>
        </Link>
        <div className="flex gap-2">
          <Link to="/login" className="text-xs text-muted-foreground">Sign out</Link>
        </div>
      </header>

      {/* Main content */}
      <main className="md:ml-56">
        <div className="mx-auto max-w-5xl p-6 md:p-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your focus overview for this week
              </p>
            </div>

            {/* Stats grid */}
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={Clock}
                label="Total focus time"
                value="11h 15m"
                sub="+23% vs last week"
              />
              <StatCard
                icon={Shield}
                label="Pages blocked"
                value="40"
              />
              <StatCard
                icon={Target}
                label="Sessions"
                value="7"
              />
              <StatCard
                icon={TrendingUp}
                label="Focus score"
                value="87%"
                sub="Great week!"
              />
            </div>

            {/* Chart */}
            <div className="mb-8 rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-sm font-medium text-foreground">
                Focus time this week
              </h2>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient
                        id="focusGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="hsl(239 84% 67%)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(239 84% 67%)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(228 15% 15%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "hsl(225 12% 28%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(225 12% 28%)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}m`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(228 20% 9%)",
                        border: "1px solid hsl(228 15% 15%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(225 10% 92%)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="hsl(239 84% 67%)"
                      strokeWidth={2}
                      fill="url(#focusGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Session history */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-sm font-medium text-foreground">
                  Recent sessions
                </h2>
              </div>
              <div className="divide-y divide-border">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {session.goal}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {session.date} · {session.duration}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Shield className="h-3 w-3" />
                        {session.blocks}
                      </span>
                      <span className="flex items-center gap-1 text-destructive">
                        {session.overrides > 0 && (
                          <>⚠ {session.overrides}</>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

const SidebarLink = ({
  icon: Icon,
  label,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
}) => (
  <button
    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? "bg-primary/10 font-medium text-primary"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

export default Dashboard;
