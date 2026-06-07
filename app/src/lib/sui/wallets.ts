import {
  getWallets,
  isWalletWithRequiredFeatureSet,
  SUI_TESTNET_CHAIN,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";
import type { WalletAccount } from "@wallet-standard/core";

export function listSuiWallets(): WalletWithRequiredFeatures[] {
  return getWallets()
    .get()
    .filter((wallet) => isWalletWithRequiredFeatureSet(wallet));
}

export function getWalletAccount(wallet: WalletWithRequiredFeatures): WalletAccount | null {
  const account =
    wallet.accounts.find((a) => a.chains.includes(SUI_TESTNET_CHAIN)) ?? wallet.accounts[0];
  return account ?? null;
}

export function formatSuiAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
