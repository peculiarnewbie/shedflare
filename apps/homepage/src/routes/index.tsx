import { For, createResource, onCleanup, onMount } from "solid-js";
import { PROFILE } from "../lib/profile";

function BlueskyIcon() {
  return (
    <svg viewBox="0 0 568 501" xmlns="http://www.w3.org/2000/svg" class="social-icon">
      <path d="M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866-1.61183 568-28.9064 568 57.9464C568 75.2916 558.055 203.659 552.222 224.501C531.947 296.954 458.067 315.434 392.347 304.249C507.222 323.8 536.444 388.56 473.333 453.32C353.473 576.312 301.061 422.461 287.631 383.039C285.169 375.812 284.017 372.431 284 375.306C283.983 372.431 282.831 375.812 280.369 383.039C266.939 422.461 214.527 576.312 94.6667 453.32C31.5556 388.56 60.7778 323.8 175.653 304.249C109.933 315.434 36.0535 296.954 15.7778 224.501C9.94525 203.659 0 75.2916 0 57.9464C0-28.9064 76.1345-1.61183 123.121 33.6637Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 85 83" xmlns="http://www.w3.org/2000/svg" class="social-icon">
      <path d="M42.5 0C19.0329 0 0 19.0514 0 42.5491C0 61.3488 12.1762 77.2976 29.0665 82.9247C31.1879 83.3183 31.875 81.9993 31.875 80.8788V72.9576C20.0529 75.5318 17.5915 67.9368 17.5915 67.9368C15.6577 63.0188 12.8704 61.7104 12.8704 61.7104C9.01354 59.0688 13.1644 59.1256 13.1644 59.1256C17.4321 59.4234 19.6775 63.5117 19.6775 63.5117C23.4671 70.0146 29.619 68.1353 32.045 67.0468C32.424 64.2988 33.5254 62.4196 34.7438 61.3594C25.3052 60.2779 15.3815 56.6293 15.3815 40.3295C15.3815 35.681 17.0425 31.887 19.759 28.9086C19.3198 27.8342 17.8642 23.5049 20.1733 17.6473C20.1733 17.6473 23.7433 16.5055 31.8644 22.0085C35.2537 21.0654 38.8875 20.5938 42.5 20.5761C46.1125 20.5938 49.7498 21.0654 53.1462 22.0085C61.2602 16.5055 64.8231 17.6473 64.8231 17.6473C67.1358 23.5084 65.6802 27.8378 65.241 28.9086C67.9681 31.887 69.615 35.6845 69.615 40.3295C69.615 56.6719 59.6735 60.2708 50.2102 61.3239C51.7331 62.643 53.125 65.2314 53.125 69.2026V80.8788C53.125 82.0099 53.805 83.3396 55.9619 82.9212C72.8379 77.287 85 61.3417 85 42.5491C85 19.0514 65.9706 0 42.5 0Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="12"
      height="15"
      viewBox="0 0 256 256"
      fill="#fff"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flex: "none" }}
    >
      <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
    </svg>
  );
}

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

interface Experience {
  id: string;
  title: string;
  workplace: string;
  url: string;
  tags: string;
  startDate: string;
  endDate: string | null;
  body: string;
  sortOrder: number;
  showOnHome: boolean;
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

function socialIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case "bluesky":
      return <BlueskyIcon />;
    case "github":
      return <GithubIcon />;
    case "twitter":
    case "x":
      return (
        <svg viewBox="0 0 93 93" xmlns="http://www.w3.org/2000/svg" class="social-icon">
          <path d="M93 17.6584C89.5784 19.1774 85.901 20.2004 82.0415 20.6615C85.9824 18.3016 89.0087 14.5622 90.4309 10.106C86.7457 12.2915 82.6615 13.8802 78.3137 14.7366C74.8379 11.0282 69.874 8.711 64.387 8.711C52.0684 8.711 43.0164 20.2042 45.7986 32.1354C29.946 31.341 15.8875 23.746 6.47513 12.2024C1.47638 20.7777 3.88275 31.9959 12.3768 37.6766C9.2535 37.5759 6.3085 36.7195 3.73937 35.2896C3.53012 44.1285 9.86575 52.3977 19.0418 54.2384C16.3564 54.9669 13.4153 55.1374 10.4238 54.5639C12.8495 62.1434 19.8943 67.6575 28.2487 67.8125C20.2275 74.1016 10.1215 76.911 0 75.7175C8.44362 81.1309 18.476 84.289 29.2485 84.289C64.6738 84.289 84.6881 54.3701 83.4791 27.5357C87.2069 24.8426 90.4425 21.483 93 17.6584Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Home() {
  let boltRef: HTMLSpanElement | undefined;
  let shineRef: HTMLDivElement | undefined;

  const [experiences] = createResource(() => fetchJson<Experience[]>("/api/experiences"));
  const [allProjects] = createResource(() => fetchJson<Project[]>("/api/projects"));

  onMount(() => {
    const pointerHandler = (e: PointerEvent) => {
      if (!boltRef) return;
      const rect = boltRef.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.abs(e.clientX - cx) + Math.abs(e.clientY - cy);
      boltRef.style.opacity = String(Math.max(0, 1.2 - dist / 250));
    };
    const shineHandler = (e: MouseEvent) => {
      if (!shineRef) return;
      shineRef.style.setProperty("--shine-x", `${e.clientX}px`);
      shineRef.style.setProperty("--shine-y", `${e.clientY}px`);
    };
    document.addEventListener("pointermove", pointerHandler);
    document.addEventListener("mousemove", shineHandler);
    onCleanup(() => {
      document.removeEventListener("pointermove", pointerHandler);
      document.removeEventListener("mousemove", shineHandler);
    });
  });

  const p = PROFILE;
  const homeProjects = () => (allProjects() ?? []).filter((proj) => proj.showOnHome);

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
              <div style={{ position: "relative", width: "fit-content" }}>
                <h1 class="name-heading">{p.name}</h1>
                {p.nickname ? (
                  <span
                    ref={(el) => {
                      boltRef = el;
                    }}
                    id="bolt"
                    class="name-nickname"
                  >
                    ({p.nickname})
                  </span>
                ) : null}
              </div>
              <p class="title-text">{p.title}</p>
              <p class="tagline-text">{p.tagline}</p>
            </header>

            <footer class="social-footer">
              <For each={p.socials}>
                {(social) => (
                  <a href={social.url} target="_blank" class="social-btn">
                    {socialIcon(social.platform)}
                  </a>
                )}
              </For>
            </footer>
          </div>

          <main class="right-col">
            {p.bio.length > 0 ? (
              <div class="bio-section">
                <For each={p.bio}>{(line) => <p>{line}</p>}</For>
              </div>
            ) : null}

            <h1 class="section-heading">EXPERIENCE</h1>
            <div class="section-list">
              <For each={experiences()}>
                {(exp) => (
                  <div class="exp-row">
                    <div class="exp-meta">
                      <p class="exp-title">{exp.title}</p>
                      <p class="exp-date">
                        {exp.startDate} - {exp.endDate ?? "Present"}
                      </p>
                    </div>
                    <div class="exp-body">
                      <a href={exp.url} target="_blank" class="exp-workplace-link">
                        {exp.workplace} <ArrowIcon />
                      </a>
                      <p class="exp-body-desc">{exp.body}</p>
                      <div class="tag-row">
                        <For each={parseTags(exp.tags)}>
                          {(tag) => <span class="tag-pill">{tag}</span>}
                        </For>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <h1 class="section-heading">PROJECTS</h1>
            <div class="section-list">
              <For each={homeProjects()}>
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

            <h1 class="section-heading">BLOG</h1>
            <p class="blog-soon">(soon)</p>
          </main>
        </div>
      </div>
    </div>
  );
}
