import { useId, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Message from the contract's `fields` map, when this field failed. */
  error?: string;
};

/**
 * A labelled input that announces its own error.
 *
 * NFR-04 requires the interface to be operable by keyboard and to meet WCAG
 * AA. The parts that matter here: the label is tied to the input by id rather
 * than placed beside it, `aria-invalid` marks the field as failed, and
 * `aria-describedby` points at the message so a screen reader reads the error
 * with the field instead of leaving it as unrelated red text.
 */
export function Field({ label, error, ...inputProps }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...inputProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
