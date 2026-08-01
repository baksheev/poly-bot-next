import { LockKeyhole } from "lucide-react";

import { login } from "../model/actions";

type LoginFormProps = {
  error?: "configuration" | "invalid";
  returnPath: string;
};

export function LoginForm({ error, returnPath }: LoginFormProps) {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-icon" aria-hidden="true">
          <LockKeyhole size={20} />
        </div>
        <div className="login-heading">
          <span>Poly Bot</span>
          <h1 id="login-title">Private dashboard</h1>
          <p>Enter the dashboard password to continue.</p>
        </div>

        <form action={login} className="login-form">
          <input type="hidden" name="next" value={returnPath} />
          <label htmlFor="dashboard-password">Password</label>
          <input
            autoFocus
            autoComplete="current-password"
            id="dashboard-password"
            name="password"
            required
            type="password"
          />
          {error === "invalid" && (
            <p className="login-error" role="alert">
              Incorrect password.
            </p>
          )}
          {error === "configuration" && (
            <p className="login-error" role="alert">
              Authentication is not configured. Check the server environment
              variables.
            </p>
          )}
          <button type="submit">Unlock dashboard</button>
        </form>

        <p className="login-session-note">
          This device will stay signed in for 30 days.
        </p>
      </section>
    </main>
  );
}
