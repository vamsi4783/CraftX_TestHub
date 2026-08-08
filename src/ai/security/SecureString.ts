/**
 * Wraps a sensitive string so it can never accidentally appear in logs,
 * console output, or JSON serialisation.
 *
 * Invariants:
 *   • toString()  → '[REDACTED]'
 *   • toJSON()    → '[REDACTED]'
 *   • The raw value is only available through .reveal(), which must be
 *     called at the exact site of consumption (HTTP header, query param).
 *   • Private field (#value) prevents prototype inspection tricks.
 */
export class SecureString {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** Returns the raw credential. Call only where it is immediately consumed. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return 'SecureString([REDACTED])';
  }

  static from(value: string): SecureString {
    return new SecureString(value);
  }

  /** Returns true only when the wrapped value is non-empty. */
  isPresent(): boolean {
    return this.#value.length > 0;
  }
}
