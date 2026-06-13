import { Show } from "solid-js";
import { useRoutines } from "../context";
import "../app.css";
import TopBar from "../components/TopBar";
import Calendar from "../components/Calendar";
import StatusPanel from "../components/StatusPanel";
import RoutinesList from "../components/RoutinesList";

export default function Home() {
  const ctx = useRoutines();

  return (
    <div class="app">
      <TopBar />
      <Show when={!ctx.loading()} fallback={<div class="loading">Loading…</div>}>
        <main class="home">
          <section class="home-calendar reveal" style={{ "animation-delay": "0ms" }}>
            <Calendar />
          </section>
          <aside class="home-status reveal" style={{ "animation-delay": "60ms" }}>
            <StatusPanel />
          </aside>
          <section class="home-routines reveal" style={{ "animation-delay": "120ms" }}>
            <RoutinesList />
          </section>
        </main>
      </Show>
    </div>
  );
}
