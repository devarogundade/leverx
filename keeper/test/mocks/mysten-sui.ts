export class Transaction {
  moveCall() {
    return [{}];
  }
  mergeCoins() {}
  transferObjects() {}
  setSender() {}
  build() {
    return Promise.resolve(new Uint8Array());
  }
  object() {}
  pure = {
    id: () => {},
    u64: () => {},
  };
}

export class SuiJsonRpcClient {
  constructor(_opts?: unknown) {}
  getChainIdentifier() {
    return Promise.resolve('testnet');
  }
  devInspectTransactionBlock() {
    return Promise.resolve({ effects: { status: { status: 'success' } } });
  }
  signAndExecuteTransaction() {
    return Promise.resolve({
      digest: 'mock',
      effects: { status: { status: 'success' } },
    });
  }
}

export function getJsonRpcFullnodeUrl() {
  return 'https://fullnode.testnet.sui.io:443';
}

export class Ed25519Keypair {
  static fromSecretKey() {
    return new Ed25519Keypair();
  }
  getPublicKey() {
    return { toSuiAddress: () => '0xmock' };
  }
}
