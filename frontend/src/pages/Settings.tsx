import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Shield, Sliders, Trash2 } from 'lucide-react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { toast } from 'sonner';

const sensitivityToString: Record<number, string> = {
  0: 'lenient',
  1: 'standard',
  2: 'strict',
};
const stringToSensitivity: Record<string, number> = {
  lenient: 0,
  standard: 1,
  strict: 2,
};

const Section = ({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-border bg-card">
    <div className="border-b border-border px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      <p className="mt-1 pl-9 text-xs text-muted-foreground">{description}</p>
    </div>
    <div className="space-y-4 p-6">{children}</div>
  </div>
);

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
    <div className="sm:ml-6">{children}</div>
  </div>
);

const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative h-5 w-9 rounded-full transition-colors ${
      checked ? 'bg-primary' : 'bg-border'
    }`}
  >
    <span
      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const SENSITIVITY_LEVELS = ['Lenient', 'Standard', 'Strict'] as const;

const Settings = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [sensitivity, setSensitivity] = useState(1);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [strictMode, setStrictMode] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await axios.get('https://focalpoint-q8r5.onrender.com/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setUsername(res.data.username);
        setEmail(res.data.email);
        setSensitivity(
          stringToSensitivity[res.data.preferences.blockSensitivity] ?? 1,
        );
        setStrictMode(res.data.preferences.strictMode);
      } catch (error) {
        toast.error('Failed to load settings');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
        const token = localStorage.getItem('token');
        await axios.put('https://focalpoint-q8r5.onrender.com/auth/settings', {
            username,
            email,
            blockSensitivity: sensitivityToString[sensitivity],
            strictMode
        }, {
            headers: { Authorization: `Bearer ${token}`}
        });

        localStorage.setItem('username', username);
        toast.success('Settings saved successfully');
    } catch (error: any) {
        toast.error(error.response?.data?.error || 'Failed to save settings');
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, focus preferences, and notifications
          </p>
        </div>

        <div className="space-y-6">
          <Section
            icon={User}
            title="Account"
            description="Your personal information"
          >
            <Field label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none sm:w-64"
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none sm:w-64"
              />
            </Field>
          </Section>

          <Section
            icon={Sliders}
            title="Focus preferences"
            description="Tune how FocalPoint blocks distractions"
          >
            <Field
              label="Block sensitivity"
              hint={`How aggressively to block: ${SENSITIVITY_LEVELS[sensitivity]}`}
            >
              <div className="w-full sm:w-64">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                  {SENSITIVITY_LEVELS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
              </div>
            </Field>
            <Field
              label="Strict mode"
              hint="Disable override button during sessions"
            >
              <Toggle checked={strictMode} onChange={setStrictMode} />
            </Field>
          </Section>

          <Section
            icon={Bell}
            title="Notifications"
            description="Control what we send you"
          >
            <Field label="Weekly report" hint="Email summary every Sunday">
              <Toggle checked={weeklyReport} onChange={setWeeklyReport} />
            </Field>
          </Section>

          <Section
            icon={Shield}
            title="Danger zone"
            description="Irreversible account actions"
          >
            <Field label="Delete account" hint="Permanently remove your data">
              <button
                onClick={() =>
                  toast.error('Account deletion is disabled in demo')
                }
                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </Field>
          </Section>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save changes
            </button>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Settings;
