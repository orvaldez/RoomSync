import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

export function LoginPage() {
  const { logIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      await logIn(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // Branch on code, never on message (contract Section 1).
        if (error.code === "VALIDATION_FAILED") {
          setFieldErrors(error.fields);
        } else {
          // INVALID_CREDENTIALS is deliberately one message for both an
          // unknown address and a wrong password, so show it as-is rather
          // than attaching it to the email or password field — attaching it
          // would tell someone guessing which half was wrong.
          setFormError(error.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <h1>Log in</h1>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {/* role="alert" so a screen reader announces the failure without the
            user having to hunt for it. */}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="auth-switch">
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </main>
  );
}
