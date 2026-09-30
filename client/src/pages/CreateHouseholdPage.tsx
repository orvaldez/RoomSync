import { useState, type FormEvent } from "react";
import { ApiError, api, type Household } from "../lib/api";
import { Field } from "../components/Field";

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
  onCreated: (household: Household) => void;
}) {
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
      if (error instanceof ApiError) {
        if (error.code === "VALIDATION_FAILED") {
          setFieldErrors(error.fields);
        } else {
          // ALREADY_IN_HOUSEHOLD lands here. It means another tab or device
          // created one since this screen loaded, so the message is the
          // server's rather than something invented here.
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
