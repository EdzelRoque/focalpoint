import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import axios from 'axios';

const Register = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async(e: any) => {
    e.preventDefault();
    setError("");

    try {
      await axios.post("https://focalpoint-q8r5.onrender.com/auth/register", { username, email, password });

      navigate("/login", {
        state: { message: "Account successfully created, please login." }
      });
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to register. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <Link to="/" className="mb-10 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary glow-primary" />
          <span className="text-sm font-semibold tracking-wide text-foreground">
            FocalPoint
          </span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start focusing in under a minute
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Username
            </label>
            <input
              type="text"
              value={username}
              placeholder="Your Username"
              onChange={(e: any) => {
                setUsername(e.target.value);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e: any) => {
                setEmail(e.target.value);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="••••••••"
                onChange={(e: any) => {
                  setPassword(e.target.value);
                }}
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="mt-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-primary transition-colors hover:text-primary/80"
          >
            Sign in →
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Register;
