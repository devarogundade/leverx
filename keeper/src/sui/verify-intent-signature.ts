import { SuiGraphQLClient } from '@mysten/sui/graphql';
import type { SuiClientTypes } from '@mysten/sui/client';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

const GRAPHQL_URLS: Record<string, string> = {
  mainnet: 'https://graphql.mainnet.sui.io/graphql',
  testnet: 'https://graphql.testnet.sui.io/graphql',
  devnet: 'https://graphql.devnet.sui.io/graphql',
};

function normalizeNetwork(network: string): SuiClientTypes.Network {
  const key = network.trim().toLowerCase();
  if (key === 'mainnet' || key === 'devnet' || key === 'localnet') return key;
  return 'testnet';
}

function graphqlClientForNetwork(network: string): SuiGraphQLClient {
  const resolved = normalizeNetwork(network);
  const url = GRAPHQL_URLS[resolved] ?? GRAPHQL_URLS.testnet;
  return new SuiGraphQLClient({ url, network: resolved });
}

/** Verify a wallet-standard personal-message signature (incl. zkLogin on testnet). */
export async function verifyIntentPersonalMessageSignature(
  messageBytes: Uint8Array,
  signature: string,
  address: string,
  network = 'testnet',
): Promise<void> {
  await verifyPersonalMessageSignature(messageBytes, signature, {
    address: address.trim().toLowerCase(),
    client: graphqlClientForNetwork(network),
  });
}
