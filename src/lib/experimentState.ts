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
  mood?: PotatoMood | undefined;
  moodExplanation?: string | undefined;
  failed?: boolean | undefined;
  failureReason?: string | undefined;
  isTrophyWinner?: boolean | undefined;
}

export interface FastestSpinTrophy {
  id: string;
  peakRPM: number;
  timestamp: number;
  accuracyScore: number;
}

import { useState, useEffect, useCallback } from "react";

export function getFastestSpinTrophy(history?: ExperimentResult[]): FastestSpinTrophy | null {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("potato_fastest_spin_trophy");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // ignore
      }
    }
  }
  // Fallback: check history
  if (history && history.length > 0) {
    const validSpins = history.filter((r) => r.mode === "spin" && !r.failed && r.peakValue > 0);
    if (validSpins.length > 0) {
      const top = validSpins.reduce((best, cur) => (cur.peakValue > best.peakValue ? cur : best));
      return {
        id: top.id,
        peakRPM: top.peakValue,
        timestamp: top.timestamp,
        accuracyScore: top.accuracyScore,
      };
    }
  }
  return null;
}

export function saveFastestSpinTrophy(trophy: FastestSpinTrophy): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("potato_fastest_spin_trophy", JSON.stringify(trophy));
  }
}

export function useExperimentHistory() {
  const [history, setHistory] = useState<ExperimentResult[]>([]);
  const [trophy, setTrophy] = useState<FastestSpinTrophy | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("potato_archives");
    let parsedHistory: ExperimentResult[] = [];
    if (stored) {
      try {
        parsedHistory = JSON.parse(stored);
        setHistory(parsedHistory);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    setTrophy(getFastestSpinTrophy(parsedHistory));
  }, []);

  const addResult = useCallback((result: ExperimentResult) => {
    setHistory((prev) => {
      // Check for trophy winner
      if (result.mode === "spin" && !result.failed && result.peakValue > 0) {
        const currentBest = getFastestSpinTrophy(prev);
        if (!currentBest || result.peakValue > currentBest.peakRPM) {
          result.isTrophyWinner = true;
          const newTrophy: FastestSpinTrophy = {
            id: result.id,
            peakRPM: result.peakValue,
            timestamp: result.timestamp,
            accuracyScore: result.accuracyScore,
          };
          saveFastestSpinTrophy(newTrophy);
          setTrophy(newTrophy);
        }
      }

      const next = [result, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem("potato_archives", JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setTrophy(null);
    localStorage.removeItem("potato_archives");
    localStorage.removeItem("potato_fastest_spin_trophy");
  }, []);

  return { history, addResult, clearHistory, trophy };
}
