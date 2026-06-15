import {
  createContext,
  createSignal,
  useContext,
  type Accessor,
  type JSX,
  type Setter,
} from "solid-js";

type Session = { email: string } | null;

export type SessionContextValue = {
  session: Accessor<Session>;
  setSession: Setter<Session>;
  loading: Accessor<boolean>;
};

const SessionContext = createContext<SessionContextValue>();

export function SessionProvider(props: { value: SessionContextValue; children: JSX.Element }) {
  return <SessionContext.Provider value={props.value}>{props.children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export type CountsContextValue = {
  wlCount: Accessor<number | null>;
  setWlCount: Setter<number | null>;
  notifCount: Accessor<number | null>;
  setNotifCount: Setter<number | null>;
};

const CountsContext = createContext<CountsContextValue>();

export function CountsProvider(props: { children: JSX.Element }) {
  const [wlCount, setWlCount] = createSignal<number | null>(null);
  const [notifCount, setNotifCount] = createSignal<number | null>(null);
  return (
    <CountsContext.Provider value={{ wlCount, setWlCount, notifCount, setNotifCount }}>
      {props.children}
    </CountsContext.Provider>
  );
}

export function useCounts() {
  const ctx = useContext(CountsContext);
  if (!ctx) throw new Error("useCounts must be used within CountsProvider");
  return ctx;
}
