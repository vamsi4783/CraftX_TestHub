# CommandBus — Public Contract

**Module**: `src/engine/CommandBus.ts`  
**Phase**: 3 · Milestone 2  
**Role**: Unicast, synchronous command dispatch. Exactly one handler per command type.

---

## Responsibilities

- Register exactly one handler per `command_type`.
- Validate command envelopes before dispatch.
- Route commands to their handler and propagate exceptions to the caller.

---

## API

### `registerHandler<P>(command_type, handler): void`

Register a handler for a command type.

- **Throws** `DuplicateHandlerError` if a handler is already registered.
- Registration is permanent for the lifetime of the process.

### `execute<P>(envelope: CommandEnvelope<P>): Promise<void>`

Execute a command.

1. Validate envelope structure (`EnvelopeValidator.validateCommand`)
2. Resolve the registered handler — throws `UnknownCommandError` if none
3. Invoke the handler and await completion
4. Handler exceptions propagate to the caller (not swallowed)

### `hasHandler(command_type: string): boolean`

Returns `true` if a handler is registered.

---

## Errors

| Error | Thrown when |
|---|---|
| `DuplicateHandlerError` | `registerHandler()` called with an already-registered `command_type` |
| `UnknownCommandError` | `execute()` called for a `command_type` with no handler |
| `InvalidCommandEnvelopeError` | Envelope fails structural validation |

---

## Contrast with EventBus

| | CommandBus | EventBus |
|---|---|---|
| Dispatch | Unicast (1 handler) | Multicast (N subscribers) |
| Handler exceptions | Propagate to caller | Swallowed (logged only) |
| Persistence | None | EventStore |
| Naming convention | Imperative (`RunSession`) | Past-tense (`SessionStarted`) |
