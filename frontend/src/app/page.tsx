"use client";

import {
  ShieldCheck,
  Unlock,
  Lock,
  Target,
  Users,
  Split,
  Sparkles,
  DollarSign,
  Fingerprint,
  Layers,
  Server,
  FileCode2,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Zap,
  Wallet,
  RefreshCw,
  LifeBuoy,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import GithubIcon from "@/components/GithubIcon";
import WaitlistForm from "@/components/WaitlistForm";
import Logo from "@/components/Logo";
import { useReveal } from "@/hooks/useReveal";

const coreFeatures = [
  {
    icon: ShieldCheck,
    title: "Non-custodial by design",
    desc: "Funds move only under Soroban contract rules you can read. You keep full control — always.",
  },
  {
    icon: Unlock,
    title: "Flexible savings",
    desc: "Deposit and withdraw any time, with no lock-up and no gatekeeper standing between you and your money.",
  },
  {
    icon: Lock,
    title: "Locked savings",
    desc: "Commit with deterministic, on-chain withdrawal rules that even the protocol can't override.",
  },
  {
    icon: Target,
    title: "Goal-based savings",
    desc: "Set a target and let automated on-chain milestones track your progress toward it.",
  },
  {
    icon: Users,
    title: "Group savings pools",
    desc: "Shared rules and payouts enforced by the contract — not by an organizer you have to trust.",
  },
  {
    icon: Split,
    title: "Group split savings",
    desc: "A group saves into a shared pool; the balance is split back by agreed shares, settled on-chain.",
  },
  {
    icon: Sparkles,
    title: "Opt-in yield",
    desc: "Optional yield sourced from real on-chain lending, isolated behind a swappable adapter.",
  },
  {
    icon: DollarSign,
    title: "Dollar-denominated",
    desc: "Save in USDC as a hedge against local-currency depreciation. Cash in and out via Stellar anchors.",
  },
  {
    icon: Fingerprint,
    title: "Passwordless onboarding",
    desc: "Passkey smart wallets with sponsored fees. No seed phrases, no XLM needed for your first deposit.",
  },
];

const products = [
  {
    icon: Unlock,
    name: "Flexible",
    tag: "Solo",
    desc: "Open-access savings you can top up or draw down whenever you want.",
  },
  {
    icon: Lock,
    name: "Locked",
    tag: "Solo",
    desc: "Time-locked commitments with withdrawal rules enforced deterministically on-chain.",
  },
  {
    icon: Target,
    name: "Goal-based",
    tag: "Solo",
    desc: "Save toward a target amount with automated, transparent milestone tracking.",
  },
  {
    icon: Users,
    name: "Group pool",
    tag: "Community",
    desc: "Contributions, payouts and default handling governed by the contract, not an admin.",
  },
  {
    icon: Split,
    name: "Group split",
    tag: "Community",
    desc: "A shared pool whose balance is split back among members by their agreed shares.",
  },
];

const onboarding = [
  {
    icon: Fingerprint,
    title: "Passkey smart wallets",
    desc: "Accounts are Soroban smart contracts signed with device biometrics (WebAuthn / secp256r1). No seed phrases.",
  },
  {
    icon: Zap,
    title: "Sponsored (gasless) fees",
    desc: "A relayer pays transaction fees so users don't need XLM to make their very first deposit.",
  },
  {
    icon: LifeBuoy,
    title: "Social recovery",
    desc: "Optional recovery signers so a lost device doesn't mean lost savings — disclosed as a trust trade-off.",
  },
  {
    icon: RefreshCw,
    title: "Local-currency ramps",
    desc: "SEP-24 / SEP-6 hosted deposit & withdrawal and SEP-38 quoted local-currency ↔ USDC via the SDF Anchor Platform.",
  },
];

const architecture = [
  {
    icon: Layers,
    label: "apps/web",
    title: "Frontend",
    desc: "Next.js app for creating savings accounts, depositing, tracking progress, and passkey onboarding.",
  },
  {
    icon: Server,
    label: "apps/api",
    title: "Backend",
    desc: "Node.js services: indexing contract events, notifications, user metadata, analytics, and anchor ramps.",
  },
  {
    icon: FileCode2,
    label: "contracts/",
    title: "Smart Contracts",
    desc: "Soroban contracts in Rust managing savings logic, custody, group rounds, and withdrawal rules.",
  },
];

const contractLayout = `contracts/
├── vault/          # Solo savings: flexible, locked, goal. Holds USDC.
├── group_pool/     # Group savings & split pools: contributions, payouts, splits.
├── yield_adapter/  # OPTIONAL, opt-in. Routes idle balances to an external source.
├── registry/       # Factory + directory of pools/vaults. Emits indexer events.
├── fee_collector/  # Transparent, on-chain protocol fees.
└── policy/         # Reusable auth rules (limits, timelocks) for smart wallets.`;

const roadmap = [
  {
    phase: "Current — Q1 2026",
    active: true,
    items: [
      { label: "Core savings contract", done: true },
      { label: "Basic web interface", done: true },
      { label: "Group savings pools", done: false },
      { label: "Group split savings", done: false },
      { label: "Passkey onboarding & sponsored fees", done: false },
      { label: "Security audit (mainnet gate)", done: false },
    ],
  },
  {
    phase: "Next — Q2 2026",
    active: false,
    items: [
      { label: "Opt-in yield (Tier-1 adapter, isolated)", done: false },
      { label: "Goal-based savings UI", done: false },
      { label: "Notification system", done: false },
      { label: "First local-currency anchor (SEP-24)", done: false },
      { label: "Social recovery", done: false },
      { label: "Mainnet deployment", done: false },
    ],
  },
  {
    phase: "Future",
    active: false,
    items: [
      { label: "Additional anchors & cash on/off-ramps", done: false },
      { label: "More yield venues behind the adapter", done: false },
      { label: "Mobile app (Flutter)", done: false },
      { label: "Progressive decentralization", done: false },
      { label: "Cross-chain savings", done: false },
      { label: "Advanced analytics dashboard", done: false },
    ],
  },
];

const stats = [
  { value: "USDC", label: "Dollar-denominated" },
  { value: "100%", label: "On-chain custody" },
  { value: "0", label: "Seed phrases" },
  { value: "5", label: "Savings products" },
];

function SectionHeading({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium uppercase tracking-widest text-brand">
        {eyebrow}
      </span>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {desc && <p className="mt-4 text-base leading-relaxed text-muted">{desc}</p>}
    </div>
  );
}

export default function Home() {
  const { ref: featuresRevealRef, revealed: featuresRevealed } = useReveal<HTMLDivElement>();
  const { ref: productsRevealRef, revealed: productsRevealed } = useReveal<HTMLDivElement>();
  const { ref: roadmapRevealRef, revealed: roadmapRevealed } = useReveal<HTMLDivElement>();

  return (
    <>
      <Navbar />
      <main id="top" className="flex-1">
        {/* ================= HERO ================= */}
        <section className="relative px-5 pt-36 pb-24 sm:px-8 sm:pt-44">
          <div className="mx-auto max-w-5xl text-center">
            <div className="animate-rise inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              Built on Stellar · Soroban smart contracts
            </div>

            <h1
              className="animate-rise mt-8 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
              style={{ animationDelay: "0.05s" }}
            >
              <span className="text-gradient">Decentralized savings</span>
              <br />
              you can actually verify.
            </h1>

            <p
              className="animate-rise mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted"
              style={{ animationDelay: "0.12s" }}
            >
              Stow lets individuals and communities save transparently in USDC —
              with flexible, locked, goal-based and group savings enforced fully
              on-chain. Non-custodial. Dollar-denominated. Yours.
            </p>

            <div
              className="animate-rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "0.2s" }}
              id="get-started"
            >
              <a
                href="#features"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-6 py-3.5 text-sm font-semibold text-background shadow-xl shadow-brand/25 transition-transform hover:scale-[1.03] sm:w-auto"
              >
                Start saving
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="https://github.com/stowp/Stow"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-brand/40 sm:w-auto"
              >
                <GithubIcon className="h-4 w-4" /> View on GitHub
              </a>
            </div>

            {/* Stat bar */}
            <div
              className="animate-rise mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4"
              style={{ animationDelay: "0.28s" }}
            >
              {stats.map((s) => (
                <div key={s.label} className="bg-background-elevated px-4 py-6">
                  <div className="text-2xl font-semibold text-brand">{s.value}</div>
                  <div className="mt-1 text-xs text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FEATURES ================= */}
        <section id="features" className="px-5 py-24 sm:px-8">
          <div
            ref={featuresRevealRef}
            className={`mx-auto max-w-7xl ${featuresRevealed ? "animate-rise" : "opacity-0"}`}
          >
            <SectionHeading
              eyebrow="Core Features"
              title="Save on your terms, verified by code"
              desc="Every rule that governs your money lives in an auditable Soroban contract — not in a company's database."
            />
            <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coreFeatures.map((f) => (
                <div
                  key={f.title}
                  className="card-hover rounded-2xl border border-border bg-card p-6"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand/20 to-brand-2/20 text-brand ring-1 ring-inset ring-brand/20">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= PRODUCTS ================= */}
        <section id="products" className="px-5 py-24 sm:px-8">
          <div
            ref={productsRevealRef}
            className={`mx-auto max-w-7xl ${productsRevealed ? "animate-rise" : "opacity-0"}`}
          >
            <SectionHeading
              eyebrow="Savings Products"
              title="Five ways to save, one protocol"
              desc="From solo flexibility to community pools — each product is a distinct set of on-chain rules you opt into."
            />
            <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <div
                  key={p.name}
                  className="card-hover group relative overflow-hidden rounded-2xl border border-border bg-card p-7"
                >
                  <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand/10 blur-2xl transition-opacity group-hover:opacity-100 sm:opacity-0" />
                  <div className="flex items-center justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-background-elevated text-brand ring-1 ring-inset ring-border">
                      <p.icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                      {p.tag}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{p.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{p.desc}</p>
                </div>
              ))}
              <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border bg-transparent p-7">
                <p className="text-sm leading-relaxed text-muted">
                  Full product mechanics are documented in
                </p>
                <code className="mt-2 font-mono text-sm text-brand">
                  SAVINGS_PRODUCT_REFERENCE.md
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ONBOARDING ================= */}
        <section id="onboarding" className="px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium uppercase tracking-widest text-brand">
                  Onboarding &amp; Ramps
                </span>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Built so mainstream users never touch crypto mechanics
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted">
                  Sign in with a passkey, skip the seed phrase, and fund your
                  first deposit without owning a single XLM. Local-currency
                  on/off-ramps run through the SDF Anchor Platform, keeping the
                  protocol itself permissionless.
                </p>
                <a
                  href="#architecture"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:text-foreground"
                >
                  See the architecture
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {onboarding.map((o) => (
                  <div
                    key={o.title}
                    className="card-hover rounded-2xl border border-border bg-card p-6"
                  >
                    <o.icon className="h-5 w-5 text-brand" />
                    <h3 className="mt-4 text-base font-semibold">{o.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{o.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= ARCHITECTURE ================= */}
        <section id="architecture" className="px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="Architecture"
              title="A clean split between app, services and custody"
              desc="Yield integration lives behind a swappable adapter so the custody core can be audited independently."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {architecture.map((a) => (
                <div
                  key={a.title}
                  className="card-hover rounded-2xl border border-border bg-card p-7"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-2/20 to-brand-3/20 text-brand-2 ring-1 ring-inset ring-brand-2/20">
                    <a.icon className="h-5 w-5" />
                  </div>
                  <code className="mt-5 block font-mono text-xs text-brand">{a.label}</code>
                  <h3 className="mt-1 text-lg font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{a.desc}</p>
                </div>
              ))}
            </div>

            {/* Contract layout code block */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-background-elevated">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400/70" />
                <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
                <span className="h-3 w-3 rounded-full bg-green-400/70" />
                <span className="ml-3 font-mono text-xs text-muted">Contract Layout</span>
              </div>
              <div className="overflow-x-auto">
                <pre className="p-5 font-mono text-[13px] leading-relaxed text-muted">
                  <code>{contractLayout}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ================= BUSINESS MODEL ================= */}
        <section className="px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-background-elevated to-background p-8 sm:p-12">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium uppercase tracking-widest text-brand">
                Business Model
              </span>
              <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Transparent, on-chain fees. Stow earns only when you do.
              </h2>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <DollarSign className="h-5 w-5 text-brand" />
                  <h3 className="mt-3 font-semibold">Performance fee on yield</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    A small percentage of yield earned only — never of principal.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6">
                  <Users className="h-5 w-5 text-brand" />
                  <h3 className="mt-3 font-semibold">Optional pool fee</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    An optional pool-creation / per-round fee for group savings.
                  </p>
                </div>
              </div>
              <p className="mt-6 text-sm text-muted">
                No token is required to use Stow. Any future governance would be
                introduced only after real usage exists.
              </p>
            </div>
          </div>
        </section>

        {/* ================= ROADMAP ================= */}
        <section id="roadmap" className="px-5 py-24 sm:px-8">
          <div
            ref={roadmapRevealRef}
            className={`mx-auto max-w-7xl ${roadmapRevealed ? "animate-rise" : "opacity-0"}`}
          >
            <SectionHeading
              eyebrow="Roadmap"
              title="Where Stow is headed"
              desc="Shipping the custody core first, gating mainnet on a security audit, then layering yield and ramps."
            />
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {roadmap.map((col) => (
                <div
                  key={col.phase}
                  className={`rounded-2xl border p-6 ${
                    col.active
                      ? "border-brand/40 bg-gradient-to-b from-brand/[0.07] to-transparent"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {col.active && (
                      <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_12px] shadow-brand" />
                    )}
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                      {col.phase}
                    </h3>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {col.items.map((it) => (
                      <li key={it.label} className="flex items-start gap-3 text-sm">
                        {it.done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        ) : (
                          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                        )}
                        <span className={it.done ? "text-foreground" : "text-muted"}>
                          {it.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section className="px-5 py-24 sm:px-8">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border bg-background-elevated text-center">
            <div className="relative px-6 py-16 sm:px-12 sm:py-20">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
              <Wallet className="mx-auto h-10 w-10 text-brand animate-float" />
              <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                Open, composable savings infrastructure
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
                Built for developers, contributors and financial communities on
                low-fee, fast-finality Stellar. Join the waitlist for launch
                updates, or clone the repo and start building.
              </p>

              <WaitlistForm />

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="https://github.com/stowp/Stow"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-6 py-3.5 text-sm font-semibold text-background shadow-xl shadow-brand/25 transition-transform hover:scale-[1.03] sm:w-auto"
                >
                  <GithubIcon className="h-4 w-4" /> Clone the repository
                </a>
                <a
                  href="https://developers.stellar.org/docs/build/smart-contracts"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-brand/40 sm:w-auto"
                >
                  <BookOpen className="h-4 w-4" /> Read the docs
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-border px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <div className="font-semibold text-foreground">
                <Logo />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                A decentralized savings protocol on Stellar. Non-custodial,
                transparent, dollar-denominated savings for emerging markets.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold">Product</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted">
                  <li><a href="#features" className="hover:text-foreground">Features</a></li>
                  <li><a href="#products" className="hover:text-foreground">Savings</a></li>
                  <li><a href="#roadmap" className="hover:text-foreground">Roadmap</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Resources</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted">
                  <li><a href="https://developers.stellar.org/docs/build/smart-contracts" className="hover:text-foreground">Stellar Docs</a></li>
                  <li><a href="https://developers.stellar.org/docs/build/smart-contracts" className="hover:text-foreground">Soroban</a></li>
                  <li><a href="https://github.com/stellar/passkey-kit" className="hover:text-foreground">Passkey Kit</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Community</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted">
                  <li><a href="https://github.com/stowp/Stow" className="hover:text-foreground">GitHub</a></li>
                  <li><a href="https://github.com/stowp/Stow/issues" className="hover:text-foreground">Issues</a></li>
                  <li><a href="https://discord.gg/stow" className="hover:text-foreground">Discord</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-sm text-muted sm:flex-row">
            <p>© {new Date().getFullYear()} Stow · MIT Licensed</p>
            <p className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Powered by Stellar &amp; Soroban
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
