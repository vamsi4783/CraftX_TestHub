import type { RecordingState } from './types';

/**
 * Directed adjacency list of every legal state transition.
 * Any transition not listed here is ILLEGAL and will throw.
 */
const VALID_TRANSITIONS: Readonly<Record<RecordingState, readonly RecordingState[]>> = {
  IDLE:      ['READY'],
  READY:     ['RECORDING', 'CANCELLED', 'IDLE'],
  RECORDING: ['PAUSED', 'STOPPING', 'CANCELLED', 'ERROR'],
  PAUSED:    ['RECORDING', 'STOPPING', 'CANCELLED', 'ERROR'],
  STOPPING:  ['SAVING', 'ERROR'],
  SAVING:    ['COMPLETED', 'ERROR'],
  COMPLETED: ['IDLE'],
  CANCELLED: ['IDLE'],
  ERROR:     ['IDLE'],
};

export function canTransition(from: RecordingState, to: RecordingState): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Throws a descriptive error for illegal transitions so bugs surface
 * immediately during development rather than silently corrupting state.
 */
export function assertTransition(from: RecordingState, to: RecordingState): void {
  if (!canTransition(from, to)) {
    const allowed = VALID_TRANSITIONS[from]?.join(', ') ?? 'none';
    throw new Error(
      `[RecorderStateMachine] Illegal transition: ${from} → ${to}. ` +
      `Valid transitions from ${from}: [${allowed}]`
    );
  }
}

/** Returns every state reachable from the given state (direct only). */
export function allowedFrom(state: RecordingState): RecordingState[] {
  return [...(VALID_TRANSITIONS[state] ?? [])];
}
