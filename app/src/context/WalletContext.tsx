import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getWallets,
  SUI_TESTNET_CHAIN,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";
import { suiClient } from "@/lib/sui/client";
import { getWalletAccount, listSuiWallets } from "@/lib/sui/wallets";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const STORAGE_KEY = "leverx:last-wallet";

/** Read-only sender for dev-inspect when no wallet is connected. */
export const READONLY_SENDER =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

interface WalletContextValue {
  client: SuiJsonRpcClient;
  wallets: WalletWithRequiredFeatures[];
  wallet: WalletWithRequiredFeatures | null;
  account: WalletAccount | null;
  address: string | null;
  isWalletConnected: boolean;
  simulationSender: string;
  connecting: boolean;
  error: string | null;
  connect: (wallet: WalletWithRequiredFeatures) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshWallets: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function readStoredWalletName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function writeStoredWalletName(name: string | null) {
  if (typeof window === "undefined") return;
  if (name) localStorage.setItem(STORAGE_KEY, name);
  else localStorage.removeItem(STORAGE_KEY);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletWithRequiredFeatures[]>([]);
  const [wallet, setWallet] = useState<WalletWithRequiredFeatures | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoConnectInFlight = useRef(false);

  const refreshWallets = useCallback(() => {
    setWallets(listSuiWallets());
  }, []);

  useEffect(() => {
    refreshWallets();
    const api = getWallets();
    const offRegister = api.on("register", refreshWallets);
    const offUnregister = api.on("unregister", refreshWallets);
    return () => {
      offRegister();
      offUnregister();
    };
  }, [refreshWallets]);

  const syncAccount = useCallback((w: WalletWithRequiredFeatures | null) => {
    if (!w) {
      setAccount(null);
      return;
    }
    setAccount(getWalletAccount(w));
  }, []);

  useEffect(() => {
    if (!wallet) return;
    const events = wallet.features["standard:events"];
    const off = events.on("change", (props) => {
      if (props.accounts) syncAccount(wallet);
    });
    return () => off();
  }, [wallet, syncAccount]);

  const connect = useCallback(async (target: WalletWithRequiredFeatures) => {
    setConnecting(true);
    setError(null);
    try {
      const result = await target.features["standard:connect"].connect({
        silent: false,
      });
      setWallet(target);
      setAccount(result.accounts[0] ?? getWalletAccount(target));
      writeStoredWalletName(target.name);

      if ("sui:changeNetwork" in target.features) {
        try {
          await (
            target.features as unknown as {
              "sui:changeNetwork": { changeNetwork: (input: { chain: string }) => Promise<void> };
            }
          )["sui:changeNetwork"].changeNetwork({ chain: SUI_TESTNET_CHAIN });
        } catch {
          /* wallet may already be on testnet */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect wallet");
      setWallet(null);
      setAccount(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    if (wallet?.features["standard:disconnect"]) {
      try {
        await wallet.features["standard:disconnect"].disconnect();
      } catch {
        /* wallet may already be disconnected */
      }
    }
    setWallet(null);
    setAccount(null);
    writeStoredWalletName(null);
  }, [wallet]);

  useEffect(() => {
    if (wallet || wallets.length === 0 || autoConnectInFlight.current) return;
    const stored = readStoredWalletName();
    if (!stored) return;
    const match = wallets.find((w) => w.name === stored);
    if (!match) return;

    let cancelled = false;
    autoConnectInFlight.current = true;
    (async () => {
      setConnecting(true);
      try {
        const result = await match.features["standard:connect"].connect({ silent: true });
        if (cancelled) return;
        setWallet(match);
        setAccount(result.accounts[0] ?? getWalletAccount(match));
      } catch {
        writeStoredWalletName(null);
      } finally {
        autoConnectInFlight.current = false;
        setConnecting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallets, wallet]);

  const address = account?.address ?? null;
  const isWalletConnected = Boolean(address);
  const simulationSender = address ?? READONLY_SENDER;

  const value = useMemo<WalletContextValue>(
    () => ({
      client: suiClient,
      wallets,
      wallet,
      account,
      address,
      isWalletConnected,
      simulationSender,
      connecting,
      error,
      connect,
      disconnect,
      refreshWallets,
    }),
    [
      wallets,
      wallet,
      account,
      address,
      isWalletConnected,
      simulationSender,
      connecting,
      error,
      connect,
      disconnect,
      refreshWallets,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
