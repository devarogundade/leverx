import { parseOracleState, parsePredictOraclesList } from './predict-oracle-parse';

describe('parsePredictOraclesList', () => {
  it('accepts bare arrays', () => {
    const rows = [{ oracle_id: '0xabc', underlying_asset: 'BTC' }];
    expect(parsePredictOraclesList(rows)).toEqual(rows);
  });

  it('accepts wrapped { oracles } payloads', () => {
    const rows = [{ oracle_id: '0xabc', underlying_asset: 'BTC' }];
    expect(parsePredictOraclesList({ oracles: rows })).toEqual(rows);
  });
});

describe('parseOracleState', () => {
  it('parses nested predict-server state with latest_price.spot', () => {
    const parsed = parseOracleState({
      oracle: {
        oracle_id: '0xbd1685ec118874dbc267ad57071a76aa3ea989d8626509184ffd226168a38e69',
        underlying_asset: 'BTC',
        expiry: 1781951400000,
        min_strike: 50000000000000,
        tick_size: 1000000000,
        status: 'active',
        settled_at: null,
      },
      latest_price: {
        spot: 63391626015095,
      },
    });

    expect(parsed).toEqual({
      spot_price: 63391626015095,
      status: 'active',
      is_settled: false,
      min_strike: 50000000000000,
      tick_size: 1000000000,
      expiry: 1781951400000,
    });
  });

  it('accepts flat legacy payloads', () => {
    expect(
      parseOracleState({
        spot_price: 63_000,
        min_strike: 50_000,
        tick_size: 1,
        expiry: 1_700_000_000_000,
        status: 'active',
      }),
    ).toMatchObject({
      spot_price: 63_000,
      min_strike: 50_000,
      status: 'active',
      is_settled: false,
    });
  });
});
