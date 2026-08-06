// ─── Engine barrel export ─────────────────────────────────────────────────────

export { EventStore }               from './EventStore.js';
export { EventBus,
         InvalidEnvelopeError,
         DuplicateEventError,
         UnregisteredEventTypeError } from './EventBus.js';
export { CommandBus,
         DuplicateHandlerError,
         UnknownCommandError,
         InvalidCommandEnvelopeError } from './CommandBus.js';

export type { IEventStoreAdapter, EventStoreRecord } from './IEventStoreAdapter.js';
export { EventStoreImmutabilityError }               from './IEventStoreAdapter.js';

export { InMemoryEventStoreAdapter }  from './adapters/InMemoryEventStoreAdapter.js';
export { SupabaseEventStoreAdapter }  from './adapters/SupabaseEventStoreAdapter.js';

export type { EventHandler, SubscriptionId } from './EventBus.js';
export type { CommandHandler }               from './CommandBus.js';
