# Comparison Threads

Users want to ask the same question to multiple models simultaneously and compare responses side-by-side. We decided to implement this as 2-3 independent backend threads linked by a `comparison_group` table, with a unified single-thread UX in the frontend.

## Considered Options

**Single thread, multiple assistant messages per user message.** Would require reworking the message linked-list model (`parentMessageId` currently assumes one child), the `headMessageId` pointer logic, and `resolveThreadMessagePath()`. Cleaner conceptual model but high blast radius — touches message model, event system, path resolution, and recovery logic.

**3 independent threads linked by a comparison group (chosen).** Each model response is a real thread running the full `runAssistantTurn()` pipeline independently. A `comparison_group` join table links them. Zero changes to message model, turn pipeline, event system, or crash recovery. The grouping is purely a UI concern.

## Key Design Decisions

- **Thread-level property, immutable after creation.** Comparison mode is set at thread creation via a toggle in the composer. Cannot convert a normal thread to comparison or vice versa. The toggle only appears for new conversations.
- **Fixed model set.** The 2-3 models are locked at creation. Every user message in the thread fans out to all models. No per-message model routing.
- **Independent tool calls.** Each model gets full tool access (search, extract) and calls them independently. No shared search context — each model decides what to search for on its own.
- **Uniform settings.** Reasoning level and search toggle apply to all models in the group. No per-model reasoning control.
- **Real-time streaming.** All models stream simultaneously in the same view. Split-pane on desktop, tab switcher on mobile (responsive breakpoint).
- **Per-column fork.** Each column has a fork button. Forking creates a standalone thread from that model's conversation path. The comparison group stays intact.
- **Edit re-runs all, retry per-column.** Editing a user message re-runs all models. Retry re-runs just the selected model.
- **Sidebar: same entry, comparison icon.** The thread title is generated from the first prompt (same as normal). A distinct icon indicates it's a comparison thread.

## Consequences

- The `comparison_group` table is a new entity. Needs DDL, schema sync, event type, snapshot inclusion, and collection definition.
- The composer needs a comparison toggle and multi-select model picker (max 3).
- The main chat route (`routes/index.tsx`) needs a responsive layout that switches between single-column, split-pane, and tab modes based on viewport width and thread type.
- `runAssistantTurn()` is called 3 times per user message in comparison mode. This means 3× the model cost and 3× the search/extract cost. Expected and acceptable for the feature's purpose.
- Fork creates a _copy_ of the message history, not a move. The original comparison thread is unchanged.
- Title generation runs once (first model to complete), not 3 times.
- Crash recovery via `pending_turns` works per-thread, so interrupted comparison turns recover independently.
