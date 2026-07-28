import { For, createResource, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";

function GitIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      class="proj-icon-svg"
    >
      <path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      class="proj-icon-svg"
    >
      <path d="M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z" />
    </svg>
  );
}

interface Project {
  id: string;
  title: string;
  tags: string;
  image: string;
  url: string;
  githubUrl: string;
  sortOrder: number;
  desc: string;
  showOnHome: boolean;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function parseTags(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export default function Projects() {
  let shineRef: HTMLDivElement | undefined;

  const [projects] = createResource(() => fetchJson<Project[]>("/api/projects"));

  onMount(() => {
    const shineHandler = (e: MouseEvent) => {
      if (!shineRef) return;
      shineRef.style.setProperty("--shine-x", `${e.clientX}px`);
      shineRef.style.setProperty("--shine-y", `${e.clientY}px`);
    };
    document.addEventListener("mousemove", shineHandler);
    onCleanup(() => document.removeEventListener("mousemove", shineHandler));
  });

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <div
        ref={(el) => {
          shineRef = el;
        }}
        class="shine"
        aria-hidden="true"
      />
      <div class="home-layout">
        <div class="two-col">
          <div class="left-col">
            <header>
              <h1 class="name-heading">Projects</h1>
            </header>

            <footer class="social-footer">
              <A href="/" style={{ "font-size": "var(--font-size-sm)", color: "var(--text)" }}>
                &larr; Back to home
              </A>
            </footer>
          </div>

          <main class="right-col">
            <h1 class="section-heading">ALL PROJECTS</h1>
            <div class="section-list">
              <For each={projects()}>
                {(proj) => (
                  <div class="proj-row">
                    <div class="proj-media">
                      <img width={720} height={360} src={proj.image} alt="" class="proj-image" />
                      <div class="proj-icon-row">
                        <a
                          href={proj.githubUrl}
                          target="_blank"
                          class="proj-icon-btn"
                          aria-label="Repository"
                        >
                          <GitIcon />
                        </a>
                        <a
                          href={proj.url}
                          target="_blank"
                          class="proj-icon-btn"
                          aria-label="Live link"
                        >
                          <LinkIcon />
                        </a>
                      </div>
                    </div>
                    <div class="proj-body">
                      <h4 class="proj-body-title">{proj.title}</h4>
                      <p class="proj-body-desc">{proj.desc}</p>
                      <div class="tag-row">
                        <For each={parseTags(proj.tags)}>
                          {(tag) => <span class="tag-pill">{tag}</span>}
                        </For>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
