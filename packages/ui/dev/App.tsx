import type { JSX } from "solid-js";
import { Button, Input, Panel, Tag, css } from "../src";

const page = css({
  "--min-height": "100vh",
  "--padding": 8,
  "--background-color": "var(--color_bg)",
  "--color": "var(--color_text)",
  "--font-family": "var(--font-family_sans)",
});

const header = css({
  "--margin-bottom": 10,
});

const title = css({
  "--font-size": "var(--font-size_2xl)",
  "--font-weight": "var(--weight_semibold)",
  "--margin": 0,
});

const subtitle = css({
  "--margin-top": 2,
  "--color": "var(--color_text-secondary)",
  "--font-size": "var(--font-size_sm)",
});

const stack = css({
  "--display": "flex",
  "--flex-direction": "column",
  "--gap": 10,
});

const sectionTitle = css({
  "--font-size": "var(--font-size_lg)",
  "--font-weight": "var(--weight_medium)",
  "--margin": 0,
  "--margin-bottom": 4,
});

const row = css({
  "--display": "flex",
  "--flex-wrap": "wrap",
  "--align-items": "center",
  "--gap": 3,
});

const rowLabel = css({
  "--flex-basis": "100%",
  "--font-size": "var(--font-size_xs)",
  "--color": "var(--color_text-muted)",
  "--text-transform": "uppercase",
  "--letter-spacing": "0.06em",
});

const inputRow = css({
  "--display": "flex",
  "--flex-direction": "column",
  "--gap": 3,
  "--max-width": 80,
});

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <Panel padding="lg">
      <h2 class={sectionTitle()}>{props.title}</h2>
      {props.children}
    </Panel>
  );
}

function LabeledRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class={row()}>
      <span class={rowLabel()}>{props.label}</span>
      {props.children}
    </div>
  );
}

export default function App() {
  return (
    <main class={page()}>
      <header class={header()}>
        <h1 class={title()}>Shedflare UI</h1>
        <p class={subtitle()}>Local dev playground — not shipped to apps.</p>
      </header>

      <div class={stack()}>
        <Section title="Button">
          <LabeledRow label="Variants">
            <Button variant="default">Default</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </LabeledRow>
          <LabeledRow label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </LabeledRow>
          <LabeledRow label="States">
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </LabeledRow>
        </Section>

        <Section title="Input">
          <div class={inputRow()}>
            <Input type="text" placeholder="Placeholder text" />
            <Input type="text" value="Filled value" readOnly />
            <Input type="text" placeholder="Disabled" disabled />
          </div>
        </Section>

        <Section title="Panel">
          <div class={stack()}>
            <LabeledRow label="Default">
              <Panel padding="md" style={{ width: "100%" }}>
                Default panel with medium padding.
              </Panel>
            </LabeledRow>
            <LabeledRow label="Elevated">
              <Panel padding="md" elevated style={{ width: "100%" }}>
                Elevated panel with stronger background.
              </Panel>
            </LabeledRow>
            <LabeledRow label="Padding">
              <Panel padding="none" style={{ width: "100%" }}>
                None
              </Panel>
              <Panel padding="sm" style={{ width: "100%" }}>
                Small
              </Panel>
              <Panel padding="lg" style={{ width: "100%" }}>
                Large
              </Panel>
            </LabeledRow>
          </div>
        </Section>

        <Section title="Tag">
          <LabeledRow label="Tones">
            <Tag tone="accent">Accent</Tag>
            <Tag tone="neutral">Neutral</Tag>
          </LabeledRow>
        </Section>
      </div>
    </main>
  );
}
