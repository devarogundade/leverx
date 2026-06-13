import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

/** Extract the defining package ID from a fully-qualified Move struct type. */
export function packageIdFromStructType(type: string): string | null {
  const match = type.match(/^(0x[a-fA-F0-9]+)::/);
  return match?.[1] ?? null;
}

export async function fetchPackageIdForObject(
  client: SuiJsonRpcClient,
  objectId: string,
): Promise<string | null> {
  const res = await client.getObject({
    id: objectId,
    options: { showType: true },
  });
  const objectType = res.data?.type;
  if (!objectType || typeof objectType !== "string") return null;
  return packageIdFromStructType(objectType);
}

export async function fetchPackageIdsForProtocol(
  client: SuiJsonRpcClient,
  ids: { registryId: string; predictId?: string },
): Promise<{ leverxPackageId: string; predictPackageId?: string }> {
  const leverxPackageId = await fetchPackageIdForObject(client, ids.registryId);
  if (!leverxPackageId) {
    throw new Error(`Could not resolve LeverX package from registry ${ids.registryId}`);
  }

  let predictPackageId: string | undefined;
  if (ids.predictId) {
    const resolved = await fetchPackageIdForObject(client, ids.predictId);
    if (resolved) predictPackageId = resolved;
  }

  return { leverxPackageId, predictPackageId };
}

export async function objectMatchesStructType(
  client: SuiJsonRpcClient,
  objectId: string,
  expectedType: string,
): Promise<boolean> {
  const res = await client.getObject({
    id: objectId,
    options: { showType: true },
  });
  return res.data?.type === expectedType;
}
