export type ExperimentMode = "push" | "spin" | "mood";
export type ExperimentStatus =
  | "idle"
  | "calibrating"
  | "ready"
  | "tracking"
  | "predicting"
  | "scanning"
  | "stopped";

export type PotatoMood = "HAPPY" | "SAD" | "RAGEBAITED";

export interface ExperimentResult {
  id: string;
  timestamp: number;
  mode: ExperimentMode;
  peakValue: number; // m/s or RPM
  predictedValue: number; // cm or degrees
  actualValue: number; // cm or degrees
  error: number; // difference
  accuracyScore: number; // 0-100
  mood?: PotatoMood;
  moodExplanation?: string;
}

import { useState, useEffect } from "react";

export function useExperimentHistory() {
  const [history, setHistory] = useState<ExperimentResult[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("potato_archives");
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const addResult = (result: ExperimentResult) => {
    setHistory((prev) => {
      const next = [result, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem("potato_archives", JSON.stringify(next));
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("potato_archives");
  };

  return { history, addResult, clearHistory };
}
