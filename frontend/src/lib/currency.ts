/**
 * Locale-aware currency and number display.
 *
 * Stow moves two kinds of amounts around:
 *  - "stroops" — the on-chain integer base unit (1 XLM = 10,000,000 stroops),
 *    always carried as a string to avoid JS number precision loss on large
 *    i128 values (see the `savings` entities' comments on this repo).
 *  - plain decimal amounts for off-chain/anchor currencies (e.g. USDC, or a
 *    user's local fiat currency during a ramp deposit/withdrawal).
 *
 * All display formatting here goes through `Intl.NumberFormat` so grouping
 * separators, decimal marks, and currency symbol placement match the
 * viewer's locale instead of being hardcoded to `en-US`. Parsing (turning a
 * user-typed or formatted string back into a number) is kept locale-safe by
 * normalizing the locale's actual group/decimal separators rather than
 * assuming "," and ".".
 */

/** Stroops per XLM (Stellar's on-chain base unit): 1 XLM = 10,000,000 stroops. */
export const STROOPS_PER_XLM = 10_000_000;

/** Falls back to the runtime default when no explicit locale is given. */
function resolveLocale(locale?: string): string | undefined {
  return locale ?? undefined;
}

/**
 * Formats a plain number as a locale-aware decimal string (no currency
 * symbol), e.g. `formatNumber(1234.5)` -> "1,234.5" in en-US or "1.234,5" in
 * de-DE.
 *
 * Falls back to a safe default if `locale` isn't recognized by the runtime's
 * ICU data, and to `"0"` for non-finite input, rather than throwing.
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions & { locale?: string },
): string {
  const { locale, ...rest } = options ?? {};
  if (!Number.isFinite(value)) return "0";

  try {
    return new Intl.NumberFormat(resolveLocale(locale), rest).format(value);
  } catch {
    // Unrecognized locale/options (e.g. an invalid BCP 47 tag) — fall back
    // to the runtime default rather than crashing the render.
    return new Intl.NumberFormat(undefined, rest).format(value);
  }
}

export interface FormatCurrencyOptions {
  /** BCP 47 locale tag, e.g. "en-US", "de-DE". Defaults to the runtime locale. */
  locale?: string;
  /** Minimum fraction digits to display. Defaults to `currency`'s minor unit (2 for most, 0 for JPY, etc). */
  minimumFractionDigits?: number;
  /** Maximum fraction digits to display. */
  maximumFractionDigits?: number;
}

/**
 * Formats `value` as a currency amount using `Intl.NumberFormat`, honoring
 * the active locale's grouping, decimal separator, and symbol placement.
 *
 * `currency` must be a valid ISO 4217 code (e.g. "USD", "EUR"). Stellar/
 * Soroban assets like "XLM" or "USDC" are not ISO 4217 currencies, so for
 * those use `formatAssetAmount` instead.
 */
export function formatCurrency(
  value: number,
  currency: string,
  options?: FormatCurrencyOptions,
): string {
  if (!Number.isFinite(value)) value = 0;

  const { locale, ...rest } = options ?? {};
  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    ...rest,
  };

  try {
    return new Intl.NumberFormat(resolveLocale(locale), formatOptions).format(
      value,
    );
  } catch {
    // Unknown/invalid currency code or locale tag — fall back to a plain
    // "CODE amount" rendering so display never throws on bad input.
    const amount = new Intl.NumberFormat(resolveLocale(locale), {
      minimumFractionDigits: rest.minimumFractionDigits,
      maximumFractionDigits: rest.maximumFractionDigits,
    }).format(value);
    return `${currency} ${amount}`;
  }
}

/**
 * Formats a non-ISO 4217 asset amount (e.g. XLM, USDC) with locale-aware
 * grouping, since `Intl.NumberFormat`'s `style: "currency"` only accepts
 * ISO 4217 codes.
 */
export function formatAssetAmount(
  value: number,
  assetCode: string,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const { locale, maximumFractionDigits = 7 } = options ?? {};
  const amount = formatNumber(value, {
    locale,
    maximumFractionDigits,
  });
  return `${amount} ${assetCode}`;
}

/**
 * Converts a stroop amount (as carried by the API/entities, a string to
 * avoid precision loss) to a plain, locale-grouped number string with no
 * asset code suffix, e.g. `formatStroopsAmount("25000000000")` -> "2,500".
 *
 * Useful when a single asset-code suffix is shared across multiple amounts
 * in the same line (e.g. "2.5 / 10 XLM") — see `formatStroops` for the
 * common case of one amount plus its suffix together.
 */
export function formatStroopsAmount(
  stroops: string,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const { locale, maximumFractionDigits = 7 } = options ?? {};
  const value = Number(stroops) / STROOPS_PER_XLM;
  return formatNumber(value, { locale, maximumFractionDigits });
}

/**
 * Converts a stroop amount (as carried by the API/entities, a string to
 * avoid precision loss) into a display string for the given asset, e.g.
 * `formatStroops("25000000000", "XLM")` -> "2,500 XLM".
 */
export function formatStroops(
  stroops: string,
  assetCode = "XLM",
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const value = Number(stroops) / STROOPS_PER_XLM;
  return formatAssetAmount(value, assetCode, options);
}

/**
 * Locale-safe parsing of a user-typed or formatted numeric string back into
 * a `number`. Detects the active locale's actual group and decimal
 * separators (via a probe format of `Intl.NumberFormat`) instead of
 * assuming "," is always the group separator and "." the decimal point —
 * that assumption breaks for locales like de-DE ("1.234,56") or fr-FR
 * ("1 234,56").
 *
 * Returns `NaN` for input that isn't parseable as a number, mirroring
 * `Number()`/`parseFloat()` semantics so callers can validate with
 * `Number.isNaN`.
 */
export function parseLocaleNumber(input: string, locale?: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return NaN;

  const parts = new Intl.NumberFormat(resolveLocale(locale)).formatToParts(
    1234.5,
  );
  const groupSeparator = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimalSeparator =
    parts.find((p) => p.type === "decimal")?.value ?? ".";

  // Strip anything that isn't a digit, the locale's decimal separator, or a
  // leading minus sign, then normalize the decimal separator to ".".
  const isNegative = /^\s*-/.test(trimmed);
  const groupPattern = new RegExp(
    `[${groupSeparator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s]`,
    "g",
  );
  const cleaned = trimmed
    .replace(groupPattern, "")
    .replace(decimalSeparator, ".")
    .replace(/[^\d.-]/g, "");

  const value = Number(cleaned);
  if (Number.isNaN(value)) return NaN;

  return isNegative && value > 0 ? -value : value;
}

/**
 * Formats yield amounts (position value, harvest history, APR) using
 * locale-aware number formatting to match the rest of the app's monetary
 * value display.
 *
 * Use this for all yield UI surfaces to ensure consistent formatting
 * across supported locales.
 */
export function formatYieldAmount(
  value: number,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const { locale, maximumFractionDigits = 7 } = options ?? {};
  return formatNumber(value, { locale, maximumFractionDigits });
}

/**
 * Formats APR (annual percentage rate) as a locale-aware percentage.
 *
 * Use this for all APR displays in yield-related UI.
 */
export function formatAPR(
  value: number,
  options?: { locale?: string; maximumFractionDigits?: number },
): string {
  const { locale, maximumFractionDigits = 2 } = options ?? {};
  const amount = formatNumber(value, { locale, maximumFractionDigits });
  return `${amount}%`;
}
