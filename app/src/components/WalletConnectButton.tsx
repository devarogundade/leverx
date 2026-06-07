import { useState } from "react";
import { ChevronDown, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWallet } from "@/context/WalletContext";
import { formatSuiAddress } from "@/lib/sui/wallets";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";

interface Props {
  className?: string;
  fullWidth?: boolean;
  large?: boolean;
  onMenuClose?: () => void;
}

export function WalletConnectButton({ className, fullWidth, large, onMenuClose }: Props) {
  const { wallets, wallet, address, connecting, error, connect, disconnect, refreshWallets } =
    useWallet();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) refreshWallets();
  };

  const handlePick = async (w: WalletWithRequiredFeatures) => {
    setOpen(false);
    onMenuClose?.();
    await connect(w);
  };

  if (address && wallet) {
    return (
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "btn-connect gap-2 text-xs",
              fullWidth && "w-full justify-between",
              large && "btn-connect-lg",
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {wallet.icon && (
                <img src={wallet.icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
              )}
              <span className="truncate">{formatSuiAddress(address)}</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
                open && "rotate-180",
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn("min-w-[12rem]", fullWidth && "w-[var(--radix-dropdown-menu-trigger-width)]")}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {wallet.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onMenuClose?.();
              void disconnect();
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={connecting}
          className={cn("btn-connect", fullWidth && "w-full", large && "btn-connect-lg", className)}
        >
          {connecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Connecting…
            </>
          ) : large ? (
            "Connect Wallet"
          ) : (
            "Connect Wallet"
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("w-56", fullWidth && "w-[var(--radix-dropdown-menu-trigger-width)]")}
      >
        {error ? (
          <>
            <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {wallets.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs leading-relaxed text-muted-foreground">
            No Sui wallet detected. Install{" "}
            <a
              href="https://suiwallet.com/"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Sui Wallet
            </a>{" "}
            or another Wallet Standard extension, then refresh.
          </p>
        ) : (
          wallets.map((w) => (
            <DropdownMenuItem key={w.name} onClick={() => void handlePick(w)}>
              {w.icon ? (
                <img src={w.icon} alt="" className="h-6 w-6 rounded-md" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold">
                  {w.name.slice(0, 1)}
                </span>
              )}
              <span className="font-medium">{w.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
