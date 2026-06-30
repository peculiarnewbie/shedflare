import {
  type Accessor,
  type JSX,
  type Resource,
  createContext,
  createResource,
  createSignal,
  useContext,
} from "solid-js";
import { apiGet } from "./api";

export interface StageList {
  stages: string[];
  currentStage: string;
}

export interface StageContextValue {
  /** The currently selected stage */
  selectedStage: Accessor<string>;
  /** Switch to a different stage */
  setStage: (stage: string) => void;
  /** All stages discovered from Cloudflare */
  availableStages: Resource<StageList>;
}

const StageContext = createContext<StageContextValue>();

const STORAGE_KEY = "shedflare-console-stage";

function loadPersistedStage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistStage(stage: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, stage);
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently ignore
  }
}

export function StageProvider(props: { children: JSX.Element }) {
  const [availableStages] = createResource(() => apiGet<StageList>("/api/stages"));

  const [selectedStage, setSelectedStage] = createSignal<string>(
    () => loadPersistedStage() ?? availableStages()?.currentStage ?? "prod",
  );

  // Sync selected stage with the API's currentStage on first load
  // (only if there's no persisted preference)
  createResource(
    () => availableStages(),
    (stages) => {
      if (!loadPersistedStage() && stages) {
        setSelectedStage(stages.currentStage);
      }
    },
  );

  const setStage = (stage: string) => {
    persistStage(stage);
    setSelectedStage(stage);
  };

  return (
    <StageContext.Provider
      value={{
        selectedStage,
        setStage,
        availableStages,
      }}
    >
      {props.children}
    </StageContext.Provider>
  );
}

export function useStage(): StageContextValue {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage() must be used within a <StageProvider>");
  return ctx;
}
