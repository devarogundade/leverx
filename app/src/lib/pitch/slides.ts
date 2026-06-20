export type PitchPattern =
  | "grid"
  | "dots"
  | "diagonal"
  | "cross"
  | "rings"
  | "mesh"
  | "stripes"
  | "diamond"
  | "wave"
  | "frame";

export type PitchIllustration =
  | "cover"
  | "problem"
  | "layers"
  | "chart"
  | "vault"
  | "jarvis"
  | "pillars"
  | "flow"
  | "personas"
  | "roadmap";

export type PitchSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  items?: string[];
  links?: { label: string; href: string }[];
  pattern: PitchPattern;
  illustration: PitchIllustration;
};

export const PITCH_SLIDES: PitchSlide[] = [
  {
    id: "cover",
    eyebrow: "DeepBook Predict · Sui testnet",
    title: "LeverX",
    body: "Trade prediction markets with leverage — on DeepBook Predict.",
    pattern: "grid",
    illustration: "cover",
  },
  {
    id: "problem",
    eyebrow: "The gap",
    title: "Yes or no isn't enough",
    items: [
      "No leverage on conviction",
      "No pro terminal — just raw calls",
      "Can't earn unless you're the house",
    ],
    pattern: "dots",
    illustration: "problem",
  },
  {
    id: "solution",
    eyebrow: "The pitch",
    title: "LeverX changes that",
    body: "The missing layer on top of DeepBook Predict.",
    items: [
      "Bet where BTC lands — UP, DOWN, or RANGE",
      "Up to 10× leverage with limit prices",
      "Deposit into a pool and earn from borrowers",
    ],
    pattern: "diagonal",
    illustration: "layers",
  },
  {
    id: "trade",
    eyebrow: "Trade with conviction",
    title: "UP · DOWN · RANGE",
    items: [
      "From 0.1 dUSDC, scale to 10× leverage",
      "Live chart and PnL before expiry",
      "Market orders for speed, limits for price",
    ],
    pattern: "cross",
    illustration: "chart",
  },
  {
    id: "vault",
    eyebrow: "Earn without trading",
    title: "Vault LP yield",
    items: [
      "Add dUSDC to the shared pool",
      "Traders borrow when they use leverage",
      "Withdraw anytime from the Vault page",
    ],
    pattern: "rings",
    illustration: "vault",
  },
  {
    id: "automation",
    eyebrow: "Hands-free",
    title: "Jarvis & Telegram",
    items: [
      "Jarvis scans positions every few minutes",
      "Set max leverage, size, and risk rules",
      "Trade from chat — /up 70k 5x 10, /markets, /balance",
    ],
    pattern: "mesh",
    illustration: "jarvis",
  },
  {
    id: "why",
    eyebrow: "Why we built it",
    title: "Four missing pieces",
    items: [
      "Leverage — size a view without full premium",
      "Real UI — charts, portfolio, order flow",
      "Vault liquidity backing borrowed margin",
      "Keepers — limits, risk, system health",
    ],
    pattern: "stripes",
    illustration: "pillars",
  },
  {
    id: "how",
    eyebrow: "How it works",
    title: "Live on-chain today",
    items: [
      "Connect wallet · create account · deposit dUSDC",
      "Pick a market, direction, size, and leverage",
      "Watch live — close early or hold to settlement",
      "Or skip trading — earn in the Vault",
    ],
    pattern: "diamond",
    illustration: "flow",
  },
  {
    id: "who",
    eyebrow: "Who it's for",
    title: "Built for every lane",
    items: [
      "Crypto traders → leveraged exchange terminal",
      "DeFi users → LP yield from borrow demand",
      "Busy traders → Jarvis or Telegram",
      "Builders → open-source contracts + indexer",
    ],
    pattern: "wave",
    illustration: "personas",
  },
  {
    id: "next",
    eyebrow: "What's next",
    title: "Mainnet day one",
    items: [
      "Vault shares as collateral across Sui DeFi",
      "Vol-arb between Predict and other venues",
      "Mobile social — streaks, leaderboards, group trades",
    ],
    links: [
      { label: "suileverx.xyz", href: "https://suileverx.xyz" },
      { label: "GitHub", href: "https://github.com/devarogundade/leverx" },
      { label: "Get dUSDC", href: "https://tally.so/r/Xx102L" },
    ],
    pattern: "frame",
    illustration: "roadmap",
  },
];

export const PITCH_SLIDE_COUNT = PITCH_SLIDES.length;
