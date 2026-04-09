// Money utilities — single source of truth for all monetary operations in CarApp.
// All values are stored as integers (cents) in the database.
// No component should ever format or calculate money directly.

/**
 * Converts cents to display string with dollar sign and 2 decimal places.
 * Example: 1500 → "$15.00", 0 → "$0.00"
 */
export function centsToDisplay(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
}

/**
 * Strips dollar sign and commas from display string, parses to integer cents.
 * Example: "$15.00" → 1500, "$1,500.00" → 150000
 */
export function displayToCents(display: string): number {
  const cleaned = display.replace(/[$,]/g, '');
  return Math.round(parseFloat(cleaned) * 100);
}

/**
 * Returns 15% deposit in cents (floored).
 */
export function calculateDeposit(totalCents: number): number {
  return Math.floor(totalCents * 0.15);
}

/**
 * Returns platform fee in cents at the given rate (floored).
 * Example: calculatePlatformFee(10000, 0.05) → 500
 */
export function calculatePlatformFee(totalCents: number, feeRate: number): number {
  return Math.floor(totalCents * feeRate);
}

/**
 * Returns 2% customer service fee in cents (floored).
 */
export function calculateServiceFee(totalCents: number): number {
  return Math.floor(totalCents * 0.02);
}

/**
 * Returns provider payout after platform fee deduction.
 */
export function calculateProviderPayout(totalCents: number, platformFeeRate: number): number {
  return totalCents - calculatePlatformFee(totalCents, platformFeeRate);
}
