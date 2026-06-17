jest.mock('@mysten/sui/transactions', () => ({
  Transaction: class Transaction {
    pure = {
      id: (value: unknown) => value,
      u64: (value: unknown) => value,
      u8: (value: unknown) => value,
      bool: (value: unknown) => value,
      address: (value: unknown) => value,
    };

    object() {
      return this;
    }

    moveCall() {
      return this;
    }
  },
}));

import { PtbBuilderService } from './ptb-builder.service';

describe('PtbBuilderService', () => {
  const cfg = {
    packageId: '0x' + '1'.repeat(64),
    predictPackageId: '0x' + '2'.repeat(64),
    registryId: '0x' + '3'.repeat(64),
    vaultId: '0x' + '4'.repeat(64),
    feeCollectorId: '0x' + '5'.repeat(64),
    predictId: '0x' + '6'.repeat(64),
    quoteType: '0x2::coin::COIN' as const,
  } as any;

  const basePosition = {
    account_id: '0x' + 'a'.repeat(64),
    position_key: 'k',
    owner: '0x' + 'b'.repeat(64),
    predict_manager_id: '0x' + 'c'.repeat(64),
    oracle_id: '0x' + 'd'.repeat(64),
    expiry_ms: 1_700_000_000_000,
    strike: 100,
    higher_strike: 0,
    is_up: true,
    is_range: false,
    open_quantity: 1,
    margin_quote: 0,
    borrow_quote: 0,
    leverage_bps: 10_000,
    mint_cost: 0,
    last_order_type: null,
    status: 'open',
    opened_at_ms: null,
    closed_at_ms: null,
    realized_payout: 0,
    entry_mark: null,
    closing_mark: null,
    close_debt_repaid: 0,
    close_interest_paid: 0,
    close_surplus_quote: 0,
  } as any;

  it('builds transactions for safe u64 inputs', () => {
    const ptb = new PtbBuilderService();
    expect(() => ptb.buildIsLiquidatable(cfg, basePosition)).not.toThrow();
  });

  it('throws for unsafe u64 numeric inputs (>2^53-1)', () => {
    const ptb = new PtbBuilderService();
    const unsafe = { ...basePosition, open_quantity: Number.MAX_SAFE_INTEGER + 2 };
    expect(() => ptb.buildIsLiquidatable(cfg, unsafe)).toThrow('unsafe_u64:position.open_quantity');
  });
});

