import { cn } from "@/lib/utils";

type MockTweet = {
  handle: string;
  text: string;
};

const MOCK_BTC_TWEETS: MockTweet[] = [
  { handle: "@Bitcoin", text: "Bitcoin hashrate hits another ATH as miners rotate to cheaper power." },
  { handle: "@saylor", text: "BTC is digital capital. Stack sats, stay humble." },
  { handle: "@whale_alert", text: "1,842 BTC transferred from unknown wallet to Coinbase." },
  { handle: "@CryptoCapo_", text: "BTC holding $98k support — range high still in play this week." },
  { handle: "@DocumentingBTC", text: "El Salvador adds 7 BTC to strategic reserve." },
  { handle: "@WuBlockchain", text: "Spot BTC ETFs see $412M net inflow, highest since March." },
  { handle: "@lookonchain", text: "A dormant wallet woke up after 11 years, moved 500 BTC." },
  { handle: "@BitcoinMagazine", text: "Lightning capacity crosses 5,500 BTC on public channels." },
  { handle: "@tier10k", text: "MicroStrategy buys another 12,000 BTC." },
  { handle: "@Ashcryptoreal", text: "BTC dominance 58.2% — alts lagging while BTC absorbs flows." },
  { handle: "@CoinDesk", text: "Fed speakers today: traders watch DXY for BTC correlation." },
  { handle: "@Bitcoin", text: "Block 872,401 mined. Reward: 3.125 BTC + fees." },
];

function profileInitial(handle: string) {
  const slug = handle.replace(/^@/, "");
  return slug.charAt(0).toUpperCase() || "?";
}

function TweetItem({ tweet }: { tweet: MockTweet }) {
  return (
    <span className="inline-flex max-w-[min(18rem,70vw)] shrink-0 items-center gap-1.5">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
        aria-hidden
      >
        {profileInitial(tweet.handle)}
      </span>
      <span className="min-w-0 truncate text-xs text-foreground/90">
        <span className="font-medium text-foreground">{tweet.handle}</span>{" "}
        <span className="text-muted-foreground">{tweet.text}</span>
      </span>
    </span>
  );
}

interface Props {
  className?: string;
}

/** Single-line mock X timeline strip above the BTC price chart. */
export function BtcTweetMarquee({ className }: Props) {
  const loop = [...MOCK_BTC_TWEETS, ...MOCK_BTC_TWEETS];

  return (
    <div className={cn("chart-tweet-marquee", className)} aria-hidden>
      <div className="chart-tweet-marquee-track">
        {loop.map((tweet, i) => (
          <span key={`${tweet.handle}-${i}`} className="inline-flex shrink-0 items-center">
            <TweetItem tweet={tweet} />
            <span className="mx-3 text-muted-foreground/60" aria-hidden>
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
