import { describeLeverxAbort, parseMoveAbort } from './leverx-abort-messages';

const SLIPPAGE_SAMPLE = `ExecutionError { inner: ExecutionErrorInner { kind: MoveAbort(MoveLocation { module: ModuleId { address: 912790a57285b00507a2a7086fdb8695bf4df40ed693d718a00186b162fd5a1f, name: Identifier("predict_client") }, function: 15, instruction: 13, function_name: Some("assert_market_slippage") }, 26)`;

describe('leverx-abort-messages', () => {
  it('parses sub_status abort codes', () => {
    expect(parseMoveAbort(SLIPPAGE_SAMPLE)?.code).toBe(26);
  });

  it('maps slippage aborts to a clear message', () => {
    const message = describeLeverxAbort(SLIPPAGE_SAMPLE);
    expect(message).toMatch(/slippage/i);
  });

  it('distinguishes predict_manager insufficient contracts from not_owner', () => {
    const predict = describeLeverxAbort(
      'predict_manager::decrease_position sub_status: Some(1)',
    );
    expect(predict).toMatch(/enough contracts/i);

    const owner = describeLeverxAbort(
      'user_proxy::withdraw_quote sub_status: Some(1)',
    );
    expect(owner).toMatch(/owns this trading account/i);
  });

  it('maps trading_paused by code', () => {
    expect(describeLeverxAbort('trade::mint sub_status: Some(2)')).toMatch(
      /paused/i,
    );
  });
});
