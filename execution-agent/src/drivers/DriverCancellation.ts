// ─── Driver Cancellation ──────────────────────────────────────────────────────
// CancellationToken: read-only view given to DriverHost and context.
// CancellationTokenSource: write side — caller holds and calls cancel().
//
// Phase 3: Promise.race-level cancellation (driver still runs, result ignored).
// Phase 5: Worker Thread termination replaces the process-level approach.

export interface CancellationToken {
  /** True once cancel() has been called on the source. */
  readonly isCancelled: boolean;
  /** AbortSignal for interop with Web APIs / fetch / AbortController patterns. */
  readonly signal: AbortSignal;
  /**
   * Register a callback to fire on cancellation.
   * If already cancelled, the callback fires synchronously (in the same microtask).
   */
  onCancelled(callback: () => void): void;
}

export class CancellationTokenSource {
  private readonly controller: AbortController;
  readonly token: CancellationToken;

  constructor() {
    const ctrl = new AbortController();
    this.controller = ctrl;

    this.token = {
      get isCancelled(): boolean {
        return ctrl.signal.aborted;
      },
      get signal(): AbortSignal {
        return ctrl.signal;
      },
      onCancelled(callback: () => void): void {
        if (ctrl.signal.aborted) {
          // Already cancelled — fire synchronously so callers don't need to check isCancelled
          callback();
        } else {
          ctrl.signal.addEventListener('abort', callback, { once: true });
        }
      },
    };
  }

  /** Cancel — all registered callbacks fire immediately. Idempotent. */
  cancel(): void {
    this.controller.abort();
  }

  /** No-op in Phase 3. Phase 5 may need cleanup of Worker Thread subscriptions. */
  dispose(): void { /* reserved */ }
}

/** A token that is never cancelled. Use in tests or fire-and-forget executions. */
export const NON_CANCELLABLE: CancellationToken = {
  isCancelled: false,
  signal:      new AbortController().signal,
  onCancelled: () => { /* never fires */ },
};
