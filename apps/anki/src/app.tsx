import { MetaProvider, Title } from "@solidjs/meta";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";
import { parse, type GenericSchema, type InferOutput } from "valibot";
import "./app.css";
import {
  CreatedSchema,
  MutationSchema,
  OverviewSchema,
  type Card,
  type Deck,
  type Overview,
  type ReviewGrade,
} from "./types";

const deckColors = ["#d87c4a", "#7f9d6a", "#496f9f", "#a55d6a", "#b69a55"];

async function api<Schema extends GenericSchema>(
  schema: Schema,
  path: string,
  init?: RequestInit,
): Promise<InferOutput<Schema>> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (!response.ok) throw new Error(await response.text());
  return parse(schema, await response.json());
}

function formatDue(value: string): string {
  const due = new Date(value);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return "due now";
  const days = Math.ceil(diff / 86_400_000);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export default function App() {
  const [overview, setOverview] = createSignal<Overview | null>(null);
  const [selectedDeckId, setSelectedDeckId] = createSignal<string>("");
  const [showAnswer, setShowAnswer] = createSignal(false);
  const [front, setFront] = createSignal("");
  const [back, setBack] = createSignal("");
  const [note, setNote] = createSignal("");
  const [tags, setTags] = createSignal("");
  const [deckName, setDeckName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const load = async () => {
    setError("");
    try {
      const next = await api(OverviewSchema, "/api/overview");
      setOverview(next);
      if (!selectedDeckId() && next.decks[0]) setSelectedDeckId(next.decks[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cards");
    }
  };

  createEffect(() => {
    void load();
  });

  const decks = () => overview()?.decks ?? [];
  const dueCards = () => overview()?.dueCards ?? [];
  const activeCard = () => dueCards()[0];
  const cardCount = (deckId: string) =>
    overview()?.cardCounts.find((row) => row.deckId === deckId)?.total ?? 0;
  const selectedDeck = () => decks().find((deck) => deck.id === selectedDeckId()) ?? decks()[0];

  const createDeck = async () => {
    const name = deckName().trim();
    if (!name) return;
    setBusy(true);
    try {
      const color = deckColors[decks().length % deckColors.length];
      const result = await api(CreatedSchema, "/api/decks", {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
      setDeckName("");
      setSelectedDeckId(result.id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const createCard = async () => {
    const deck = selectedDeck();
    if (!deck || !front().trim() || !back().trim()) return;
    setBusy(true);
    try {
      await api(MutationSchema, "/api/cards", {
        method: "POST",
        body: JSON.stringify({
          deckId: deck.id,
          front: front(),
          back: back(),
          note: note(),
          tags: tags(),
        }),
      });
      setFront("");
      setBack("");
      setNote("");
      setTags("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const review = async (grade: ReviewGrade) => {
    const card = activeCard();
    if (!card) return;
    setBusy(true);
    try {
      await api(MutationSchema, "/api/reviews", {
        method: "POST",
        body: JSON.stringify({ cardId: card.id, grade }),
      });
      setShowAnswer(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <MetaProvider>
      <Title>Shedflare Anki</Title>
      <main class="page-shell">
        <section class="hero-panel">
          <div class="brand-row">
            <div class="book-mark" />
            <span>Shedflare Anki</span>
          </div>
          <p class="eyebrow">Online-first memory work</p>
          <h1>Review what matters without wrestling your flashcards.</h1>
          <p class="hero-copy">
            A calmer spaced-repetition desk for your own notes: quick capture, one focused prompt,
            and a review queue that follows you online.
          </p>
          <div class="hero-stats">
            <div>
              <strong>{dueCards().length}</strong>
              <span>due now</span>
            </div>
            <div>
              <strong>{decks().length}</strong>
              <span>decks</span>
            </div>
            <div>
              <strong>{overview()?.recentReviews.length ?? 0}</strong>
              <span>recent reviews</span>
            </div>
          </div>
        </section>

        <section class="review-desk">
          <Show when={!error()} fallback={<div class="error-card">{error()}</div>}>
            <Switch>
              <Match when={!overview()}>
                <div class="loading-card">Opening your study desk...</div>
              </Match>
              <Match when={activeCard()}>
                {(card: () => Card) => (
                  <article class="study-card">
                    <div class="card-meta">
                      <span>
                        {decks().find((deck) => deck.id === card().deckId)?.name ?? "Deck"}
                      </span>
                      <span>{formatDue(card().dueAt)}</span>
                    </div>
                    <div class="prompt">{card().front}</div>
                    <Show
                      when={showAnswer()}
                      fallback={
                        <button class="reveal-button" onClick={() => setShowAnswer(true)}>
                          Show answer
                        </button>
                      }
                    >
                      <div class="answer-block">
                        <p>{card().back}</p>
                        <Show when={card().note}>
                          <small>{card().note}</small>
                        </Show>
                      </div>
                      <div class="grade-row">
                        <button disabled={busy()} onClick={() => review("again")}>
                          Again
                        </button>
                        <button disabled={busy()} onClick={() => review("hard")}>
                          Hard
                        </button>
                        <button disabled={busy()} onClick={() => review("good")}>
                          Good
                        </button>
                        <button disabled={busy()} onClick={() => review("easy")}>
                          Easy
                        </button>
                      </div>
                    </Show>
                  </article>
                )}
              </Match>
              <Match when={overview()}>
                <div class="empty-review">
                  <span>All clear</span>
                  <h2>No cards due right now.</h2>
                  <p>Add a fresh card below or come back when the next one ripens.</p>
                </div>
              </Match>
            </Switch>
          </Show>
        </section>

        <section class="deck-rail">
          <div class="section-heading">
            <p>Library</p>
            <h2>Decks</h2>
          </div>
          <div class="deck-list">
            <For each={decks()} fallback={<p class="muted">Create your first deck to start.</p>}>
              {(deck: Deck) => (
                <button
                  class="deck-pill"
                  classList={{ active: selectedDeckId() === deck.id }}
                  onClick={() => setSelectedDeckId(deck.id)}
                >
                  <span style={{ "background-color": deck.color }} />
                  <strong>{deck.name}</strong>
                  <em>{cardCount(deck.id)} cards</em>
                </button>
              )}
            </For>
          </div>
          <div class="mini-form">
            <input
              value={deckName()}
              onInput={(event) => setDeckName(event.currentTarget.value)}
              placeholder="New deck name"
            />
            <button disabled={busy()} onClick={createDeck}>
              Add deck
            </button>
          </div>
        </section>

        <section class="capture-panel">
          <div class="section-heading">
            <p>Capture</p>
            <h2>Add a card</h2>
          </div>
          <div class="capture-grid">
            <label>
              Front
              <textarea
                value={front()}
                onInput={(event) => setFront(event.currentTarget.value)}
                placeholder="What should future-you recall?"
              />
            </label>
            <label>
              Back
              <textarea
                value={back()}
                onInput={(event) => setBack(event.currentTarget.value)}
                placeholder="The answer, explanation, or worked example."
              />
            </label>
            <label>
              Note
              <input
                value={note()}
                onInput={(event) => setNote(event.currentTarget.value)}
                placeholder="Optional context"
              />
            </label>
            <label>
              Tags
              <input
                value={tags()}
                onInput={(event) => setTags(event.currentTarget.value)}
                placeholder="biology exam-2 leeches"
              />
            </label>
          </div>
          <button class="save-card" disabled={busy() || !selectedDeck()} onClick={createCard}>
            Save card to {selectedDeck()?.name ?? "a deck"}
          </button>
        </section>
      </main>
    </MetaProvider>
  );
}
