import { Bell, ExternalLink } from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { Badge } from "@/components/ui/badge";
import { LabelWithInfo } from "@/components/leverx/InfoPopover";
import { leverxInfo } from "@/lib/leverx/info-copy";
import {
  isTelegramConfigured,
  useConnectTelegram,
  useTelegramSubscription,
} from "@/hooks/useTelegramSubscription";
import {
  labelCaps,
  pillToggleBtn,
  pillToggleIdle,
  tradeSurface,
} from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

type Props = {
  owner: string;
  accountId: string;
  className?: string;
};

function formatSubDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function PortfolioTelegramPanel({ owner, accountId, className }: Props) {
  const { data, isLoading, isError } = useTelegramSubscription(owner, accountId);
  const connect = useConnectTelegram(owner, accountId);

  const configured = isTelegramConfigured(data);
  const subscribed = Boolean(data?.subscribed);
  const botUsername = data?.bot_username?.replace(/^@/, "") ?? null;

  return (
    <section className={cn(tradeSurface, "overflow-hidden", className)}>
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
          <LabelWithInfo
            label="Telegram alerts"
            labelClassName={labelCaps}
            info={leverxInfo.telegramAlerts}
            infoTitle="Telegram alerts"
          />
          {subscribed ? (
            <Badge
              variant="outline"
              className="border-success/30 bg-success/10 text-[10px] text-success"
            >
              Active
            </Badge>
          ) : null}
        </div>
        <button
          type="button"
          className={cn(pillToggleBtn, pillToggleIdle, "gap-1.5 text-sm")}
          disabled={
            !configured ||
            connect.isPending ||
            isLoading ||
            isError
          }
          onClick={() => connect.mutate()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {connect.isPending ? "Opening…" : subscribed ? "Add another chat" : "Connect Telegram"}
        </button>
      </div>

      <div className="space-y-2 px-4 py-3 text-sm text-muted-foreground">
        {isLoading ? (
          <LoadingState label="Checking Telegram…" compact />
        ) : isError || !configured ? (
          <p>Telegram alerts are not configured on this keeper yet.</p>
        ) : (
          <>
            <p>
              Get notified when limit orders fill, liquidation risk rises, or a position is
              liquidated.
            </p>
            {botUsername ? (
              <p>
                Bot:{" "}
                <a
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{botUsername}
                </a>
              </p>
            ) : null}
            {subscribed && data?.subscriptions?.length ? (
              <ul className="space-y-1 pt-1 text-xs">
                {data.subscriptions.map((sub) => (
                  <li key={`${sub.chat_id}:${sub.account_id}`}>
                    Chat {sub.chat_id.slice(-4)} · since {formatSubDate(sub.subscribed_at_ms)}
                    {sub.telegram_username ? ` · @${sub.telegram_username}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs">
                Tap Connect Telegram, then press Start in the bot chat to subscribe this trading
                account.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
