import { useEffect, useRef } from "react";
import { ExperimentResult, useExperimentHistory } from "@/lib/experimentState";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface ResultsDashboardProps {
  latestResult: ExperimentResult;
  history: ExperimentResult[];
  onRestart: () => void;
  onClearHistory: () => void;
}

export function ResultsDashboard({
  latestResult,
  history,
  onRestart,
  onClearHistory,
}: ResultsDashboardProps) {
  const isPush = latestResult.mode === "push";
  const isMood = latestResult.mode === "mood";

  const getMoodBg = (mood?: string) => {
    if (mood === "HAPPY") return "bg-leaf";
    if (mood === "SAD") return "bg-sky";
    return "bg-bubblegum";
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 p-5">
      <div className="text-center">
        <h2 className="font-display text-4xl font-extrabold uppercase text-foreground">
          {isMood ? "Potato Psych Profile" : "Experiment Complete"}
        </h2>
        <p className="mt-2 text-lg font-medium text-muted-foreground">
          {isMood
            ? "Certified tuber emotional diagnostics. Peer-reviewed by nobody."
            : "Here are the final readings from the lab."}
        </p>
      </div>

      {/* Latest Result Cards */}
      {isMood ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="sticker bg-butter p-6 rotate-[-2deg] transition-transform hover:-translate-y-1">
            <div className="font-display text-4xl font-extrabold">99.4%</div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">
              STARCH COHERENCE
            </div>
          </div>
          <div className={`sticker ${getMoodBg(latestResult.mood)} p-6 rotate-[1.5deg] transition-transform hover:-translate-y-1`}>
            <div className="font-display text-4xl font-extrabold">
              {latestResult.mood || "STABLE"}
            </div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">
              MEASURED MOOD
            </div>
          </div>
          <div className="sticker bg-mint p-6 rotate-[2deg] transition-transform hover:-translate-y-1">
            <div className="font-display text-4xl font-extrabold">100%</div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">
              DIAGNOSTIC CERTAINTY
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="sticker bg-butter p-6 rotate-[-2deg] transition-transform hover:-translate-y-1">
            <div className="font-display text-4xl font-extrabold">
              {latestResult.peakValue.toFixed(1)} {isPush ? "px/s" : "RPM"}
            </div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">
              PEAK {isPush ? "VELOCITY" : "SPEED"}
            </div>
          </div>
          <div className="sticker bg-sky p-6 rotate-[1.5deg] transition-transform hover:-translate-y-1">
            <div className="font-display text-4xl font-extrabold">
              {latestResult.error.toFixed(1)} {isPush ? "px" : "deg"}
            </div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">MISS BY</div>
          </div>
          <div className="sticker bg-bubblegum p-6 rotate-[2deg] transition-transform hover:-translate-y-1">
            <div className="font-display text-4xl font-extrabold">
              {latestResult.accuracyScore.toFixed(0)}%
            </div>
            <div className="mt-1 font-display text-xl font-extrabold uppercase">ACCURACY</div>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button
          onClick={onRestart}
          className="sticker w-full sm:w-auto min-h-[48px] bg-leaf px-8 py-6 font-display text-xl font-extrabold uppercase"
        >
          {isMood ? "Scan Another Potato" : "Run Another"}
        </Button>
      </div>

      {/* Mood or Prediction vs Actual Panel */}
      {isMood ? (
        <div className="sticker mx-auto mt-10 max-w-2xl bg-cream p-6 text-left">
          <div className="flex items-center justify-between font-bold">
            <span className="font-display text-xl uppercase">OFFICIAL EMOTIONAL VERDICT</span>
            <Badge
              className={`px-3 py-1 font-display font-extrabold uppercase border-2 border-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)] ${getMoodBg(latestResult.mood)} text-foreground`}
            >
              {latestResult.mood}
            </Badge>
          </div>
          <p className="mt-5 font-display text-2xl font-extrabold text-foreground">
            &ldquo;{latestResult.moodExplanation}&rdquo;
          </p>
          <div className="mt-6 border-t-2 border-dashed border-foreground/30 pt-4 text-sm font-medium text-muted-foreground">
            Analysis methodology: Starch density spectroscopy, blemish triangulation, and direct consultation with the Potato Council.
          </div>
        </div>
      ) : (
        <div className="sticker mx-auto mt-10 max-w-2xl bg-cream p-5 text-left">
          <div className="flex items-center justify-between font-bold">
            <span>predicted {isPush ? "stop" : "direction"}</span>
            <span>
              {latestResult.predictedValue.toFixed(1)} {isPush ? "cm" : "deg"}
            </span>
          </div>
          <div className="mt-2 h-6 w-full overflow-hidden rounded-full border-[3px] border-foreground bg-card">
            <div
              className="h-full bg-spud"
              style={{
                width: `${Math.min(100, (latestResult.predictedValue / Math.max(latestResult.predictedValue, latestResult.actualValue)) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between font-bold">
            <span>actual {isPush ? "stop" : "direction"}</span>
            <span>
              {latestResult.actualValue.toFixed(1)} {isPush ? "cm" : "deg"}
            </span>
          </div>
          <div className="mt-2 h-6 w-full overflow-hidden rounded-full border-[3px] border-foreground bg-card">
            <div
              className="h-full bg-bubblegum"
              style={{
                width: `${Math.min(100, (latestResult.actualValue / Math.max(latestResult.predictedValue, latestResult.actualValue)) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-4 text-sm font-medium">
            Verdict:{" "}
            {latestResult.accuracyScore > 90
              ? "Potato Genius."
              : latestResult.accuracyScore > 70
                ? "Close enough to brag."
                : "Physics is hard."}
          </p>
        </div>
      )}

      {/* Potato Archives */}
      <div className="mt-16 rounded-3xl border-4 border-foreground bg-cream p-8">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-display text-3xl font-extrabold uppercase">Potato Archives</h3>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearHistory}
              className="border-2 border-foreground font-bold"
            >
              Clear History
            </Button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="font-medium text-muted-foreground">
            No archives found. The table is clean.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((r, i) => (
              <Card
                key={r.id}
                className="flex flex-col justify-between border-4 border-foreground bg-background p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-4">
                  <Badge className="bg-foreground text-background text-lg font-extrabold">
                    #{history.length - i}
                  </Badge>
                  <span className="font-display text-xl font-extrabold uppercase text-foreground">
                    {r.mode === "mood" ? "MOOD POTATO" : `${r.mode} MODE`}
                  </span>
                </div>

                {r.mode === "mood" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-0">
                    <Badge
                      className={`px-3 py-1 font-display text-base font-extrabold uppercase border-2 border-foreground shadow-[2px_2px_0_0_rgba(0,0,0,1)] ${getMoodBg(r.mood)} text-foreground`}
                    >
                      {r.mood || "STABLE"}
                    </Badge>
                    <span className="text-sm font-medium text-muted-foreground max-w-xs truncate">
                      {r.moodExplanation}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-6 sm:mt-0">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase text-muted-foreground">Peak</span>
                      <span className="font-display text-lg font-bold">
                        {r.peakValue.toFixed(1)} {r.mode === "push" ? "px/s" : "RPM"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase text-muted-foreground">Error</span>
                      <span className="font-display text-lg font-bold">
                        {r.error.toFixed(1)} {r.mode === "push" ? "px" : "deg"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase text-muted-foreground">Score</span>
                      <span className="font-display text-lg font-bold text-bubblegum">
                        {r.accuracyScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
