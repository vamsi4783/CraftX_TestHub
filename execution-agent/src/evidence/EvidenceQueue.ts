// ─── EvidenceQueue ────────────────────────────────────────────────────────────
// Append-only, ordered queue for evidence items awaiting upload.
//
// Immutability guarantee: once an item is enqueued its evidenceId, request,
// path, and enqueuedAt are frozen forever. Re-enqueueing the same evidenceId
// throws EvidenceImmutabilityError. Lifecycle status fields (status, retryCount,
// etc.) are mutable — they represent pipeline state, not evidence content.

import type { EvidenceQueueItem, EvidenceStatus } from './EvidenceTypes.js';

// ─── Error ────────────────────────────────────────────────────────────────────

export class EvidenceImmutabilityError extends Error {
  constructor(evidenceId: string) {
    super(
      `Evidence item "${evidenceId}" is already enqueued. ` +
      `Evidence is immutable — re-enqueue is not allowed.`,
    );
    this.name = 'EvidenceImmutabilityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── EvidenceQueue ────────────────────────────────────────────────────────────

export class EvidenceQueue {
  private readonly _items = new Map<string, EvidenceQueueItem>();
  /** Insertion-order list of evidenceIds — drives FIFO upload ordering. */
  private readonly _order: string[] = [];

  /**
   * Append an item to the queue.
   * Throws EvidenceImmutabilityError if the same evidenceId is enqueued twice.
   */
  enqueue(item: EvidenceQueueItem): void {
    if (this._items.has(item.evidenceId)) {
      throw new EvidenceImmutabilityError(item.evidenceId);
    }
    this._items.set(item.evidenceId, item);
    this._order.push(item.evidenceId);
  }

  /** Look up a queue item by evidenceId. Returns undefined if not found. */
  get(evidenceId: string): EvidenceQueueItem | undefined {
    return this._items.get(evidenceId);
  }

  /** All items with status === 'pending', in FIFO order. */
  pending(): EvidenceQueueItem[] {
    return this._order
      .map(id => this._items.get(id)!)
      .filter(item => item.status === 'pending');
  }

  /** All items with status === 'failed', in FIFO order. */
  failed(): EvidenceQueueItem[] {
    return this._order
      .map(id => this._items.get(id)!)
      .filter(item => item.status === 'failed');
  }

  /** All items with status === 'uploaded', in FIFO order. */
  uploaded(): EvidenceQueueItem[] {
    return this._order
      .map(id => this._items.get(id)!)
      .filter(item => item.status === 'uploaded');
  }

  /** All items in insertion order. */
  all(): EvidenceQueueItem[] {
    return this._order.map(id => this._items.get(id)!);
  }

  /** Total number of items ever enqueued. */
  size(): number {
    return this._items.size;
  }

  /** True if evidenceId has been enqueued. */
  has(evidenceId: string): boolean {
    return this._items.has(evidenceId);
  }

  /**
   * Transition an item's status.
   * The transition table mirrors EvidenceStatus lifecycle:
   *   pending → uploading → uploaded
   *   pending → uploading → failed
   *   failed  → pending   (re-queue for retry)
   *
   * Throws if the evidenceId is not in the queue or the transition is invalid.
   */
  transition(evidenceId: string, to: EvidenceStatus): void {
    const item = this._items.get(evidenceId);
    if (!item) {
      throw new Error(`EvidenceQueue: unknown evidenceId "${evidenceId}"`);
    }

    const valid = VALID_STATUS_TRANSITIONS[item.status];
    if (!valid.includes(to)) {
      throw new Error(
        `EvidenceQueue: illegal status transition "${item.status}" → "${to}" ` +
        `for evidenceId "${evidenceId}"`,
      );
    }

    item.status = to;
  }
}

const VALID_STATUS_TRANSITIONS: Record<EvidenceStatus, EvidenceStatus[]> = {
  pending:   ['uploading'],
  uploading: ['uploaded', 'failed'],
  uploaded:  [],
  failed:    ['pending'],  // re-queued for retry
};
