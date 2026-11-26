// ==========================================================================
// RenewMe – Business Logic: Date Math, Expense Normalization, CRUD & Filters
// ==========================================================================

export const CURRENCY_META = {
  INR: { symbol: '₹', locale: 'en-IN', rateToINR: 1 },
  USD: { symbol: '$', locale: 'en-US', rateToINR: 84 },
  EUR: { symbol: '€', locale: 'de-DE', rateToINR: 91 },
  GBP: { symbol: '£', locale: 'en-GB', rateToINR: 106 },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Escapes HTML special characters to prevent XSS when inserting into templates.
 * @param {string} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parses a YYYY-MM-DD string into a local-midnight Date object (avoids UTC drift).
 * @param {string} isoDateStr
 * @returns {Date|null}
 */
export function parseLocalDate(isoDateStr) {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateStr)) return null;
  const [year, month, day] = isoDateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Formats a Date object as YYYY-MM-DD in local time.
 * @param {Date} date
 * @returns {string}
 */
export function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a YYYY-MM-DD date into a readable label (e.g., "26 Nov 2026").
 * @param {string} isoDateStr
 * @returns {string}
 */
export function formatDisplayDate(isoDateStr) {
  const date = parseLocalDate(isoDateStr);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Adds `months` to a Date while clamping to the last valid day of the target month.
 * Example: Jan 31 + 1 month -> Feb 28 (or Feb 29 in a leap year).
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
export function addMonthsClamped(date, months) {
  const originalDay = date.getDate();
  const targetFirst = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth() + 1,
    0
  ).getDate();

  return new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth(),
    Math.min(originalDay, daysInTargetMonth)
  );
}

/**
 * Advances a Date by one billing cycle (`weekly`, `monthly`, or `yearly`).
 * @param {Date} date
 * @param {'weekly'|'monthly'|'yearly'} frequency
 * @returns {Date}
 */
export function advanceOneCycle(date, frequency) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (frequency === 'weekly') {
    copy.setDate(copy.getDate() + 7);
    return copy;
  }
  if (frequency === 'yearly') {
    return addMonthsClamped(copy, 12);
  }
  return addMonthsClamped(copy, 1);
}

/**
 * Calculates the next upcoming renewal date from a start date & billing cycle.
 * If startDate is today or in the past, advances cycle-by-cycle until >= today.
 * If startDate is in the future, returns startDate as the first upcoming charge.
 * @param {string} startDateStr
 * @param {'weekly'|'monthly'|'yearly'} frequency
 * @returns {string}
 */
export function calculateNextRenewalDate(startDateStr, frequency) {
  const start = parseLocalDate(startDateStr);
  if (!start) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start > today) {
    return formatISODate(start);
  }

  let candidate = advanceOneCycle(start, frequency);
  let guard = 0;
  while (candidate < today && guard < 1000) {
    candidate = advanceOneCycle(candidate, frequency);
    guard += 1;
  }
  return formatISODate(candidate);
}

/**
 * Returns whole days from local today until `nextRenewalDateStr`.
 * 0 = today, positive = future days, negative = overdue days.
 * @param {string} nextRenewalDateStr
 * @returns {number|null}
 */
export function getDaysUntilRenewal(nextRenewalDateStr) {
  const target = parseLocalDate(nextRenewalDateStr);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Converts an amount from `fromCurrency` into `toCurrency`.
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @returns {number}
 */
export function convertCurrency(amount, fromCurrency, toCurrency) {
  const fromRate = CURRENCY_META[fromCurrency]?.rateToINR ?? 1;
  const toRate = CURRENCY_META[toCurrency]?.rateToINR ?? 1;
  if (fromCurrency === toCurrency) return amount;
  return (amount * fromRate) / toRate;
}

/**
 * Returns the normalized monthly equivalent cost in the subscription's native currency
 * (or converted into `targetCurrency` if provided).
 * @param {object} sub
 * @param {string} [targetCurrency]
 * @returns {number}
 */
export function getMonthlyEquivalent(sub, targetCurrency) {
  const price = Number(sub.price) || 0;
  let monthly = price;
  if (sub.frequency === 'yearly') {
    monthly = price / 12;
  } else if (sub.frequency === 'weekly') {
    monthly = (price * 52) / 12;
  }
  return targetCurrency ? convertCurrency(monthly, sub.currency, targetCurrency) : monthly;
}

/**
 * Returns the annualized yearly cost (monthly equivalent * 12).
 * @param {object} sub
 * @param {string} [targetCurrency]
 * @returns {number}
 */
export function getYearlyEquivalent(sub, targetCurrency) {
  return getMonthlyEquivalent(sub, targetCurrency) * 12;
}

/**
 * Formats a numeric amount using the currency's locale and symbol.
 * @param {number} amount
 * @param {string} currencyCode
 * @returns {string}
 */
export function formatCurrency(amount, currencyCode = 'INR') {
  const meta = CURRENCY_META[currencyCode] || CURRENCY_META.INR;
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(meta.locale, {
    style: 'currency',
    currency: currencyCode in CURRENCY_META ? currencyCode : 'INR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

/**
 * Validates subscription form payload and returns field-level error messages.
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateSubscription(data) {
  const errors = {};

  if (!data.name || !data.name.trim()) {
    errors.name = 'Subscription name is required.';
  } else if (data.name.trim().length > 80) {
    errors.name = 'Name must be 80 characters or fewer.';
  }

  if (!data.category) {
    errors.category = 'Please choose a category.';
  }

  const parsedPrice = Number(data.price);
  if (data.price === '' || data.price === null || Number.isNaN(parsedPrice)) {
    errors.price = 'Please enter a valid price.';
  } else if (parsedPrice <= 0) {
    errors.price = 'Price must be greater than 0.';
  }

  if (!data.currency || !(data.currency in CURRENCY_META)) {
    errors.currency = 'Select a valid currency.';
  }

  if (!['monthly', 'yearly', 'weekly'].includes(data.frequency)) {
    errors.frequency = 'Select a valid billing frequency.';
  }

  if (!data.paymentMethod) {
    errors.paymentMethod = 'Select a payment method.';
  }

  const startDate = parseLocalDate(data.startDate);
  if (!startDate) {
    errors.startDate = 'Enter a valid start date.';
  }

  const renewalDate = parseLocalDate(data.nextRenewalDate);
  if (!renewalDate) {
    errors.nextRenewalDate = 'Enter a valid next renewal date.';
  } else if (startDate && renewalDate < startDate) {
    errors.nextRenewalDate = 'Next renewal date cannot be earlier than start date.';
  }

  if (data.websiteUrl && data.websiteUrl.trim()) {
    try {
      const url = new URL(data.websiteUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.websiteUrl = 'URL must start with http:// or https://';
      }
    } catch {
      errors.websiteUrl = 'Enter a valid URL (e.g., https://netflix.com).';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Creates a new subscription object with generated ID & timestamps.
 * @param {object} data
 * @returns {object}
 */
export function buildSubscriptionRecord(data) {
  const nowIso = new Date().toISOString();
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `sub-${crypto.randomUUID()}`
      : `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    name: data.name.trim(),
    category: data.category,
    price: Number(Number(data.price).toFixed(2)),
    currency: data.currency,
    frequency: data.frequency,
    startDate: data.startDate,
    nextRenewalDate: data.nextRenewalDate,
    paymentMethod: data.paymentMethod,
    status: data.status || 'active',
    websiteUrl: data.websiteUrl ? data.websiteUrl.trim() : '',
    notes: data.notes ? data.notes.trim() : '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Filters and sorts subscriptions according to search text, category, status, and sort mode.
 * @param {Array<object>} subscriptions
 * @param {{ search: string, category: string, status: string, sortBy: string, displayCurrency: string }} options
 * @returns {Array<object>}
 */
export function filterAndSortSubscriptions(subscriptions, options) {
  const query = (options.search || '').trim().toLowerCase();
  const category = options.category || 'all';
  const status = options.status || 'all';
  const sortBy = options.sortBy || 'renewal-asc';
  const displayCurrency = options.displayCurrency || 'INR';

  const filtered = subscriptions.filter((sub) => {
    if (category !== 'all' && sub.category !== category) return false;
    if (status !== 'all' && sub.status !== status) return false;
    if (query) {
      const haystack = `${sub.name} ${sub.category} ${sub.paymentMethod} ${sub.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (sortBy === 'renewal-asc') {
      return a.nextRenewalDate.localeCompare(b.nextRenewalDate);
    }
    if (sortBy === 'renewal-desc') {
      return b.nextRenewalDate.localeCompare(a.nextRenewalDate);
    }
    const monthlyA = getMonthlyEquivalent(a, displayCurrency);
    const monthlyB = getMonthlyEquivalent(b, displayCurrency);
    if (sortBy === 'price-desc') return monthlyB - monthlyA;
    if (sortBy === 'price-asc') return monthlyA - monthlyB;
    return 0;
  });
}
