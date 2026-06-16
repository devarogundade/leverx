export type GasSponsorBody = {
  sender: string;
  /** Base64-encoded transaction kind bytes (`onlyTransactionKind: true`). */
  transactionKindBytes: string;
};

export type GasSponsorResponse = {
  bytes: string;
  digest: string;
};

export type GasExecuteBody = {
  digest: string;
  signature: string;
};

export type GasExecuteResponse = {
  digest: string;
};
