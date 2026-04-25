import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  Clock,
  Shield,
  TrendingUp,
  BarChart3,
  Settings,
  LogOut,
  Target,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import DashboardLayout from '@/components/DashboardLayout';
import { getWeekBounds } from '@/lib/weekBounds';

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
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get('https://focalpoint-q8r5.onrender.com/api/sessions', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setSessions(data);
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      }
    }
    fetchSessions();
  }, []);

  // Calculate dynamic stats from the sessions array
  let totalMinutes = 0;
  let totalBlocks = 0;
  let totalOverrides = 0;

  // Setup an object to hold the chart data for each day
  const dayMap = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

  const { start: weekStart, end: weekEnd } = getWeekBounds(new Date());
  const thisWeek = sessions.filter((s) => {
    const t = new Date(s.startTime);
    return t >= weekStart && t < weekEnd;
  });

  thisWeek.forEach((session) => {
    totalBlocks += session.blockCount || 0;
    totalOverrides += session.overrideCount || 0;

    // Only calculate time for finished sessions
    if (session.actualEndTime) {
      const start = new Date(session.startTime);
      const end = new Date(session.actualEndTime);
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);

      totalMinutes += diff;

      // Figure out what day of the week this session was on and add the minutes
      const dayName = start.toLocaleDateString('en-US', { weekday: 'short' });
      if (dayMap[dayName] !== undefined) {
        dayMap[dayName] += diff;
      }
    }
  });

  // Format the total time string nicely
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const totalTimeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Format the final array for the Recharts component
  const weeklyData = [
    { day: 'Mon', minutes: dayMap['Mon'] },
    { day: 'Tue', minutes: dayMap['Tue'] },
    { day: 'Wed', minutes: dayMap['Wed'] },
    { day: 'Thu', minutes: dayMap['Thu'] },
    { day: 'Fri', minutes: dayMap['Fri'] },
    { day: 'Sat', minutes: dayMap['Sat'] },
    { day: 'Sun', minutes: dayMap['Sun'] },
  ];

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your focus overview for this week
          </p>
        </div>

        {/* Stats grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Clock}
            label="Total focus time"
            value={totalTimeText}
          />
          <StatCard
            icon={Shield}
            label="Pages blocked"
            value={totalBlocks.toString()}
          />
          <StatCard
            icon={Target}
            label="Sessions"
            value={thisWeek.length.toString()}
          />
          <StatCard
            icon={TrendingUp} // You could change this import to AlertTriangle for overrides
            label="Overrides"
            value={totalOverrides.toString()}
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
                  tick={{ fontSize: 11, fill: 'hsl(225 12% 28%)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(225 12% 28%)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}m`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(228 20% 9%)',
                    border: '1px solid hsl(228 15% 15%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(225 10% 92%)',
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
            {sessions.slice(0, 5).map((session) => {
              let durationText = 'Active';
              if (session.actualEndTime) {
                const start = new Date(session.startTime);
                const end = new Date(session.actualEndTime);
                const diffInMinutes = Math.round(
                  (end.getTime() - start.getTime()) / 60000,
                );

                // Format to "Xh Ym" or just "Xm"
                if (diffInMinutes >= 60) {
                  const hours = Math.floor(diffInMinutes / 60);
                  const mins = diffInMinutes % 60;
                  durationText = `${hours}h ${mins}m`;
                } else {
                  durationText = `${diffInMinutes}m`;
                }
              }

              const dateText = new Date(session.startTime).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                },
              );

              return (
                <div
                  key={session._id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.sessionGoal}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dateText} · {durationText}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      {session.blockCount}
                    </span>
                    <span className="flex items-center gap-1 text-destructive">
                      {session.overrideCount > 0 && (
                        <>⚠ {session.overrideCount}</>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Dashboard;
