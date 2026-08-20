// Fixture: Violation of Rule 5 (money arithmetic and scaling outside lib/domain/money)
export function calculateTax(amountMinor: number) {
  const scaled = amountMinor * 100;
  const divided = scaled / 100;
  return divided;
}
