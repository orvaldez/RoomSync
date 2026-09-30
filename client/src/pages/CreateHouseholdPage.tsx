import { useState, type FormEvent } from "react";
import { ApiError, api, isUnauthenticated, type Household } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

/** The user's current household, or null if that lookup fails as well. */
async function findExistingHousehold(): Promise<Household | null> {
  try {
    const { household } = await api.currentHousehold();
    return household;
  } catch {
    return null;
  }
}

/**
 * UC-03 — shown when the signed-in user belongs to no household.
 *
 * Joining by invitation (UC-04) will appear alongside this once that endpoint
 * exists; the heading already frames this as one of two ways in so the copy
 * does not have to change then.
 */
export function CreateHouseholdPage({
  onCreated,
}: {
  /** Called with the user's household once they have one. */
  onCreated: (household: Household) => void;
}) {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const { household } = await api.createHousehold({ name });
      onCreated(household);
    } catch (error) {
      if (isUnauthenticated(error)) {
        void refresh();
        return;
      }

      if (error instanceof ApiError && error.code === "ALREADY_IN_HOUSEHOLD") {
        // Another tab or device created one since this screen loaded. Show
        // that household rather than leaving the user on a form that can
        // never succeed; fall back to the server's message only if the
        // lookup fails too.
        const existing = await findExistingHousehold();
        if (existing) {
          onCreated(existing);
          return;
        }
      }

      if (error instanceof ApiError) {
        if (error.code === "VALIDATION_FAILED") {
          setFieldErrors(error.fields);
        } else {
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
    <main className="page">
      <h1>Set up your household</h1>

      <p className="muted">
        Create a household to start tracking shared expenses and chores. You
        can invite your roommates once it exists.
      </p>

      <form className="auth-form panel-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Household name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          placeholder="e.g. Apartment 4B"
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create household"}
        </button>
      </form>
    </main>
  );
}
