"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import SEEDS from "../../data/decision_seeds.json";

// The two wires that turn four separate pages into one closed loop:
//  - `outlook`   : Scenario Studio sets it (carrying the exact composed
//                  frontier), Policy Builder optimizes on it.
//  - `policies`  : Policy Builder adopts into it, Decision Log reads it.
//                  Seeded with four real engine-computed decisions on first
//                  load, then persisted to localStorage across sessions.

export type FrontierRow = {
  t: number; profit: number; approval: number; capital: number;
  loss_rate: number; default_rate: number; eg_share: number | null;
};

export type Outlook = { key: string; label: string; frontier?: FrontierRow[] } | null;

export interface PolicyResult {
  cutline: number;
  profit: number;
  approval: number;
  loss_rate: number;
  capital: number;
  binding?: { label: string; gain: number; unit: string; relax: string }[];
}

export interface AdoptedPolicy {
  version: number;
  ts: number;
  objective: string;
  constraints: Record<string, number | null>;
  outlook: string;
  result: PolicyResult;
  rationale: string;
  restoredFrom?: number | null;
}

interface Store {
  outlook: Outlook;
  setOutlook: (o: Outlook) => void;
  policies: AdoptedPolicy[];
  policiesReady: boolean;
  adoptPolicy: (p: Omit<AdoptedPolicy, "version" | "ts">) => void;
  restorePolicy: (version: number) => void;
  resetPolicies: () => void;
}

const LS_KEY = "bts:policies:v1";
const seedPolicies = (SEEDS as any).policies as AdoptedPolicy[];

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [outlook, setOutlook] = useState<Outlook>(null);
  const [policies, setPolicies] = useState<AdoptedPolicy[]>([]);
  const [policiesReady, setPoliciesReady] = useState(false);
  const loaded = useRef(false);

  // hydration-safe load: seeds or localStorage, only on the client after mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      const parsed = raw ? (JSON.parse(raw) as AdoptedPolicy[]) : null;
      setPolicies(parsed && parsed.length ? parsed : seedPolicies);
    } catch {
      setPolicies(seedPolicies);
    }
    loaded.current = true;
    setPoliciesReady(true);
  }, []);

  // persist after the initial load
  useEffect(() => {
    if (!loaded.current) return;
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(policies)); } catch {}
  }, [policies]);

  const adoptPolicy: Store["adoptPolicy"] = (p) =>
    setPolicies((prev) => [
      ...prev,
      { ...p, version: prev.length + 1, ts: Date.now() },
    ]);

  const restorePolicy: Store["restorePolicy"] = (version) =>
    setPolicies((prev) => {
      const src = prev.find((x) => x.version === version);
      if (!src) return prev;
      return [
        ...prev,
        {
          ...src,
          version: prev.length + 1,
          ts: Date.now(),
          restoredFrom: version,
          rationale: `Restored from v${version} as a working draft.`,
        },
      ];
    });

  const resetPolicies = () => setPolicies(seedPolicies);

  return (
    <Ctx.Provider
      value={{ outlook, setOutlook, policies, policiesReady, adoptPolicy, restorePolicy, resetPolicies }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used within StoreProvider");
  return c;
}
