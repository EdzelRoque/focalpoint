import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Search,
  Shield,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const formatDate = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTime = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDuration = (start: string, end: string | null) => {
  if (!end) return 'Active now';
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const PAGE_SIZE = 10;

const Sessions = () => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'active'>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await axios.get('http://localhost:3000/api/sessions', {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Sort newest first
        const sorted = res.data.sort(
          (a: any, b: any) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        );
        setSessions(sorted);
      } catch (error) {
        console.error('Failed to fetch sessions');
      }
    };
    fetchSessions();
  }, []);

  const filtered = sessions.filter((s) => {
    const matchesQuery = s.sessionGoal.toLowerCase().includes(query.toLowerCase());
    const status = s.isActive ? 'active' : 'completed';
    const matchesFilter = filter === 'all' || status === filter;
    return matchesQuery && matchesFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [query, filter]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your past focus sessions, searchable and filterable
          </p>
        </div>

        {/* Search + filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by goal..."
              className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {(['all', 'completed', 'active'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${
                  filter === f
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions list */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-sm font-medium text-foreground">
              {filtered.length} {filtered.length === 1 ? 'session' : 'sessions'}
            </h2>
            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No sessions match your search.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pageItems.map((s) => (
                <div
                  key={s._id}
                  className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-surface-elevated sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.sessionGoal}
                      </p>
                      {s.isActive === true && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(s.startTime)} · {formatTime(s.startTime)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuration(s.startTime, s.actualEndTime)}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      {s.blockCount || 0}
                    </span>
                    {s.overrideCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {s.overrideCount}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {filtered.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-md text-xs transition-colors ${
                        p === page
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Sessions;
