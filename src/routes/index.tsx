import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PotatoEyes } from "@/components/PotatoEyes";
import { ExperimentRunner } from "@/components/ExperimentRunner";
import { ExperimentMode } from "@/lib/experimentState";
import potatoHero from "@/assets/potato-hero.png";
import potatoCrew from "@/assets/potato-crew.png";
import potatoDigger from "@/assets/potato-digger.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "POTAAA.TO — Potato Physics, Predicted by Your Phone" },
      {
        name: "description",
        content:
          "POTAAA.TO films a potato sliding across a table, tracks its motion, predicts where it stops, then compares the guess with reality. Silly science, real trajectories.",
      },
      { property: "og:title", content: "POTAAA.TO — Potato Physics, Predicted by Your Phone" },
      {
        property: "og:description",
        content:
          "Push a potato. Film it. Watch POTAAA.TO predict the exact spot it stops — then check the receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Sticker({
  children,
  className = "",
  rotate = 0,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <div
      className={`sticker p-6 transition-transform duration-300 hover:-translate-y-1 ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setSeen(true);
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        seen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function Marquee({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`overflow-hidden border-y-[3px] border-foreground py-3 ${className}`}>
      <div className="marquee-track flex w-max gap-8 whitespace-nowrap font-display text-xl font-extrabold uppercase text-foreground">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="flex items-center gap-8">
            {text} <span aria-hidden>★</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Index() {
  const [tilt, setTilt] = useState(0);
  const [isExperimenting, setIsExperimenting] = useState(false);
  const [experimentMode, setExperimentMode] = useState<ExperimentMode>("push");

  useEffect(() => {
    const onScroll = () => setTilt(Math.sin(window.scrollY / 320) * 3);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isExperimenting) {
    return (
      <ExperimentRunner
        mode={experimentMode}
        onExit={(finalMode) => {
          if (finalMode) setExperimentMode(finalMode);
          setIsExperimenting(false);
        }}
      />
    );
  }

  return (
    <main className="overflow-x-hidden bg-cream">
      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b-[3px] border-foreground bg-butter">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <img
              src={potatoHero}
              alt=""
              width={1024}
              height={1024}
              className="h-8 w-8 object-contain"
            />
            POTAAA.TO
          </span>
          <div className="hidden gap-6 font-semibold sm:flex">
            <a href="#lab" className="story-link">
              the lab
            </a>
            <a href="#how" className="story-link">
              how it works
            </a>
            <a href="#results" className="story-link">
              results
            </a>
            <a href="#faq" className="story-link">
              faq
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="paper-grain relative bg-sky px-5 pb-24 pt-14 text-center">
        <span className="sticker inline-block bg-bubblegum px-4 py-1 text-sm font-bold uppercase tilt-l">
          experiment #0412 ✦ friction pending
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-6xl leading-[0.9] sm:text-8xl">
          PUSH IT.
          <br />
          WE&apos;LL PREDICT IT.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-lg font-medium">
          Point your phone. Shove a potato. POTAAA.TO watches the slide and calls the exact spot it
          stops.
        </p>

        <div
          className="relative mx-auto mt-8 w-[min(78vw,440px)] bob"
          style={{ transform: `rotate(${tilt}deg)` }}
        >
          <img
            src={potatoHero}
            alt="A big cute cartoon potato test subject with googly eyes that follow your cursor"
            width={1024}
            height={1024}
            className="w-full drop-shadow-[10px_12px_0_color-mix(in_oklab,var(--ink)_25%,transparent)]"
          />
          <PotatoEyes />
        </div>

        <div className="mt-10 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
          <div className="flex w-full sm:w-auto flex-wrap justify-center items-center gap-2 rounded-full sm:rounded-full border-[3px] border-foreground bg-cream p-1">
            <button
              onClick={() => setExperimentMode("push")}
              className={`rounded-full flex-1 sm:flex-none px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 font-display text-sm font-extrabold uppercase transition-colors ${experimentMode === "push" ? "bg-butter text-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Push Mode
            </button>
            <button
              onClick={() => setExperimentMode("spin")}
              className={`rounded-full flex-1 sm:flex-none px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 font-display text-sm font-extrabold uppercase transition-colors ${experimentMode === "spin" ? "bg-butter text-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Spin Mode
            </button>
            <button
              onClick={() => setExperimentMode("mood")}
              className={`rounded-full flex-1 sm:flex-none px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 font-display text-sm font-extrabold uppercase transition-colors ${experimentMode === "mood" ? "bg-butter text-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Mood Potato
            </button>
          </div>
          <button
            onClick={() => setIsExperimenting(true)}
            className="sticker w-full sm:w-auto min-h-[48px] bg-bubblegum px-7 py-3 font-display text-lg font-extrabold uppercase transition-transform hover:-translate-y-1 active:translate-y-1"
          >
            Run an experiment
          </button>
          <a
            href="#results"
            className="sticker flex w-full sm:w-auto min-h-[48px] items-center justify-center bg-mint px-7 py-3 font-display text-lg font-extrabold uppercase transition-transform hover:-translate-y-1 active:translate-y-1"
          >
            See the data
          </a>
        </div>

        <span className="absolute left-6 top-24 hidden text-5xl wobble sm:block" aria-hidden>
          ⌁
        </span>
        <span className="absolute right-8 top-40 hidden text-5xl wobble sm:block" aria-hidden>
          ⤳
        </span>
        <span className="absolute bottom-10 left-16 hidden text-4xl wobble sm:block" aria-hidden>
          ✦
        </span>
      </section>

      <Marquee
        text="TRACK IT  •  PREDICT IT  •  MEASURE IT  •  ARGUE ABOUT IT"
        className="bg-butter"
      />

      {/* THE LAB */}
      <section id="lab" className="paper-grain bg-bubblegum px-5 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <Reveal>
            <img
              src={potatoCrew}
              alt="Three cartoon potato scientists in lab coats with a stopwatch, a ruler and a phone camera"
              width={1024}
              height={768}
              loading="lazy"
              className="sticker w-full bg-cream p-4 tilt-l"
            />
          </Reveal>
          <Reveal delay={120}>
            <div className="sticker bg-cream p-7 tilt-r">
              <h2 className="text-4xl">THE LAB</h2>
              <p className="mt-4 font-medium leading-relaxed">
                POTAAA.TO is a very serious motion lab built on a kitchen table. A phone camera
                watches a potato get shoved, follows every wobble, and does the sliding-friction
                maths nobody asked for.
              </p>
              <p className="mt-3 font-medium leading-relaxed">
                Velocity in, deceleration out, one dotted line drawn across the tabletop. Then we
                find out how wrong we were, in centimetres, in public.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["frame-by-frame", "friction", "trajectory", "receipts"].map((t) => (
                  <span key={t} className="sticker bg-butter px-3 py-1 text-sm font-bold">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PREDICTION CARDS */}
      <section id="results" className="paper-grain bg-mint px-5 py-20">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-5xl">THE NUMBERS</h2>
          <p className="mt-3 font-medium">
            Last night&apos;s tabletop run. No potatoes complained.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              {
                pct: "1.42 m/s",
                label: "LAUNCH SPEED",
                note: "one confident thumb push",
                bg: "bg-butter",
              },
              {
                pct: "0.38 µ",
                label: "FRICTION",
                note: "slightly sticky oak table",
                bg: "bg-sky",
              },
              {
                pct: "2.1 cm",
                label: "MISS BY",
                note: "prediction vs. actual stop",
                bg: "bg-bubblegum",
              },
            ].map((c, i) => (
              <Reveal key={c.label} delay={i * 110}>
                <Sticker className={c.bg} rotate={i === 1 ? 1.5 : i === 0 ? -2 : 2}>
                  <div className="font-display text-4xl font-extrabold">{c.pct}</div>
                  <div className="mt-1 font-display text-xl font-extrabold uppercase">
                    {c.label}
                  </div>
                  <p className="mt-2 text-sm font-medium">{c.note}</p>
                </Sticker>
              </Reveal>
            ))}
          </div>

          <Reveal delay={220}>
            <div className="sticker mx-auto mt-10 max-w-2xl bg-cream p-5 text-left">
              <div className="flex items-center justify-between font-bold">
                <span>predicted stop</span>
                <span>84 cm</span>
              </div>
              <div className="mt-2 h-6 w-full overflow-hidden rounded-full border-[3px] border-foreground bg-card">
                <div className="h-full w-[84%] bg-spud" />
              </div>
              <div className="mt-4 flex items-center justify-between font-bold">
                <span>actual stop</span>
                <span>86.1 cm</span>
              </div>
              <div className="mt-2 h-6 w-full overflow-hidden rounded-full border-[3px] border-foreground bg-card">
                <div className="h-full w-[86%] bg-bubblegum" />
              </div>
              <p className="mt-4 text-sm font-medium">
                Verdict: close enough to brag, far enough to run it again.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="paper-grain bg-butter px-5 py-20">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
          <Reveal>
            <div>
              <h2 className="text-5xl">THE METHOD</h2>
              <p className="mt-3 max-w-xs font-medium">
                Four steps, scribbled on a napkin, peer-reviewed by nobody.
              </p>
              <img
                src={potatoDigger}
                alt="Cartoon potato scientist in a lab coat and goggles holding a clipboard"
                width={768}
                height={768}
                loading="lazy"
                className="mt-6 w-56 wobble"
              />
            </div>
          </Reveal>
          <div className="space-y-5">
            {[
              {
                n: "01",
                t: "PROP THE PHONE",
                d: "Camera on the table edge. Potato in frame. Deep breath.",
              },
              {
                n: "02",
                t: "GIVE IT A SHOVE",
                d: "One push. No spin tricks. The tuber does the rest.",
              },
              {
                n: "03",
                t: "TRACK THE SLIDE",
                d: "Every frame measured: speed, drag, wobble, vibes.",
              },
              {
                n: "04",
                t: "CALL THE STOP",
                d: "A dotted line lands on the spot. Then reality answers.",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div
                  className="sticker flex gap-4 bg-cream p-5"
                  style={{ transform: `rotate(${i % 2 ? 1.2 : -1.2}deg)` }}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-foreground bg-spud font-display font-extrabold">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-xl">{s.t}</h3>
                    <p className="text-sm font-medium">{s.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="paper-grain bg-sky px-5 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-5xl">FAQ</h2>
          <Accordion type="single" collapsible className="mt-8 space-y-4">
            {[
              {
                q: "Is this real physics?",
                a: "Embarrassingly, yes. Speed, friction and deceleration are all real. The potato is the only unserious part.",
              },
              {
                q: "Why do the eyes follow me?",
                a: "Every potato has eyes. Ours are calibrated. Consider it live camera tracking, but emotional.",
              },
              {
                q: "How accurate is the prediction?",
                a: "Usually within a few centimetres. Rolling potatoes are chaos; lumps are basically a random number generator.",
              },
              {
                q: "Can I use a sweet potato?",
                a: "Please do. Different mass, different drag, same absurd dotted line across your kitchen table.",
              },
            ].map((f, i) => (
              <AccordionItem
                key={f.q}
                value={`item-${i}`}
                className="sticker border-b-[3px] bg-cream px-5"
                style={{ transform: `rotate(${i % 2 ? 0.8 : -0.8}deg)` }}
              >
                <AccordionTrigger className="text-left font-display text-lg font-extrabold hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="font-medium">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <Marquee
        text="POTAAA.TO  •  TABLETOP PHYSICS DIVISION  •  KEEP IT LUMPY"
        className="bg-bubblegum"
      />

      <footer className="bg-cream px-5 py-14 text-center">
        <img
          src={potatoHero}
          alt=""
          width={1024}
          height={1024}
          loading="lazy"
          className="bob mx-auto h-24 w-24 object-contain"
        />
        <p className="mt-4 font-display text-2xl font-extrabold uppercase">
          measured with love &amp; a ruler
        </p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          POTAAA.TO — no potatoes were harmed, several were mildly startled.
        </p>
      </footer>
    </main>
  );
}
