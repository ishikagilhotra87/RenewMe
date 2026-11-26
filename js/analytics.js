// ==========================================================================
// RenewMe – Expense Calculations, Category Breakdowns & Charts
// ==========================================================================

import {
  addMonthsClamped,
  convertCurrency,
  escapeHTML,
  formatCurrency,
  getMonthlyEquivalent,
  getYearlyEquivalent,
  parseLocalDate,
} from './subscriptions.js';

/**
 * Computes active-subscription spending totals & category breakdown.
 * @param {Array<object>} subscriptions
 * @param {string} displayCurrency
 * @returns {object}
 */
export function computeSpendingSummary(subscriptions, displayCurrency = 'INR') {
  const active = subscriptions.filter((sub) => sub.status === 'active');

  let monthlyTotal = 0;
  let yearlyTotal = 0;
  const byCategory = {};
  let highestSub = null;
  let highestMonthly = -1;

  for (const sub of active) {
    const monthly = getMonthlyEquivalent(sub, displayCurrency);
    const yearly = getYearlyEquivalent(sub, displayCurrency);
    monthlyTotal += monthly;
    yearlyTotal += yearly;

    byCategory[sub.category] = (byCategory[sub.category] || 0) + monthly;

    if (monthly > highestMonthly) {
      highestMonthly = monthly;
      highestSub = { ...sub, monthlyConverted: monthly };
    }
  }

  const categoryEntries = Object.entries(byCategory)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: monthlyTotal > 0 ? (amount / monthlyTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topSubscriptions = active
    .map((sub) => ({
      ...sub,
      monthlyConverted: getMonthlyEquivalent(sub, displayCurrency),
    }))
    .sort((a, b) => b.monthlyConverted - a.monthlyConverted);

  return {
    activeCount: active.length,
    totalCount: subscriptions.length,
    monthlyTotal,
    yearlyTotal,
    categoryEntries,
    topCategory: categoryEntries[0] || null,
    highestSub,
    topSubscriptions,
  };
}

/**
 * Renders a responsive vertical bar chart inside a container element.
 * @param {HTMLElement|null} container
 * @param {Array<{ label: string, value: number }>} bars
 * @param {string} currency
 * @param {string} emptyMessage
 */
export function renderBarChart(container, bars, currency, emptyMessage) {
  if (!container) return;

  if (!bars.length || bars.every((bar) => bar.value <= 0)) {
    container.innerHTML = `<p class="item-meta">${escapeHTML(emptyMessage)}</p>`;
    return;
  }

  const maxValue = Math.max(...bars.map((bar) => bar.value), 1);

  container.innerHTML = `
    <div class="bar-chart">
      ${bars
        .map((bar) => {
          const heightPct = Math.max(Math.round((bar.value / maxValue) * 100), 4);
          return `
            <div class="bar-col" title="${escapeHTML(bar.label)}: ${escapeHTML(formatCurrency(bar.value, currency))}">
              <span class="bar-value">${escapeHTML(formatCurrency(bar.value, currency))}</span>
              <div class="bar-fill" style="height: ${heightPct}%;"></div>
              <span class="bar-label">${escapeHTML(bar.label)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

/**
 * Renders category horizontal progress bars into the given container.
 * @param {HTMLElement|null} container
 * @param {Array<{ category: string, amount: number, percentage: number }>} entries
 * @param {string} currency
 */
export function renderCategoryBars(container, entries, currency) {
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = '<p class="item-meta">No active subscriptions to categorize.</p>';
    return;
  }

  container.innerHTML = entries
    .map(
      (entry) => `
        <div class="category-bar-item">
          <div class="category-bar-meta">
            <span class="category-bar-name">${escapeHTML(entry.category)}</span>
            <span class="category-bar-amount">
              ${escapeHTML(formatCurrency(entry.amount, currency))}/mo (${Math.round(entry.percentage)}%)
            </span>
          </div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width: ${Math.max(entry.percentage, 3).toFixed(1)}%;"></div>
          </div>
        </div>
      `
    )
    .join('');
}

/**
 * Builds a 6-month cashflow projection based on each active subscription's billing cycle.
 * @param {Array<object>} subscriptions
 * @param {string} displayCurrency
 * @returns {Array<{ label: string, value: number }>}
 */
function buildSixMonthProjection(subscriptions, displayCurrency) {
  const active = subscriptions.filter((sub) => sub.status === 'active');
  const today = new Date();
  const baseMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const months = [];

  for (let i = 0; i < 6; i += 1) {
    const monthStart = addMonthsClamped(baseMonth, i);
    const label = monthStart.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    let projected = 0;

    for (const sub of active) {
      if (sub.frequency === 'monthly' || sub.frequency === 'weekly') {
        projected += getMonthlyEquivalent(sub, displayCurrency);
      } else if (sub.frequency === 'yearly') {
        const renewal = parseLocalDate(sub.nextRenewalDate);
        if (
          renewal &&
          renewal.getMonth() === monthStart.getMonth() &&
          renewal.getFullYear() === monthStart.getFullYear()
        ) {
          projected += convertCurrency(Number(sub.price) || 0, sub.currency, displayCurrency);
        }
      }
    }

    months.push({ label, value: projected });
  }

  return months;
}

/**
 * Renders the full Expense Analytics view.
 * @param {Array<object>} subscriptions
 * @param {object} settings
 */
export function renderAnalyticsView(subscriptions, settings) {
  const currency = settings.currency || 'INR';
  const summary = computeSpendingSummary(subscriptions, currency);

  const monthlyEl = document.getElementById('analytics-monthly-total');
  const yearlyEl = document.getElementById('analytics-yearly-total');
  const topCatEl = document.getElementById('analytics-top-category');
  const highestSubEl = document.getElementById('analytics-highest-sub');

  if (monthlyEl) monthlyEl.textContent = formatCurrency(summary.monthlyTotal, currency);
  if (yearlyEl) yearlyEl.textContent = formatCurrency(summary.yearlyTotal, currency);
  if (topCatEl) {
    topCatEl.textContent = summary.topCategory ? summary.topCategory.category : '—';
  }
  if (highestSubEl) {
    highestSubEl.textContent = summary.highestSub
      ? `${summary.highestSub.name} (${formatCurrency(summary.highestSub.monthlyConverted, currency)}/mo)`
      : '—';
  }

  const trendBars = buildSixMonthProjection(subscriptions, currency);
  renderBarChart(
    document.getElementById('analytics-trend-chart'),
    trendBars,
    currency,
    'Add active subscriptions to see a 6-month projection.'
  );

  renderCategoryBars(
    document.getElementById('analytics-category-breakdown'),
    summary.categoryEntries,
    currency
  );

  const topListEl = document.getElementById('analytics-top-subscriptions');
  if (topListEl) {
    if (!summary.topSubscriptions.length) {
      topListEl.innerHTML = '<li class="item-row"><span class="item-meta">No active subscriptions yet.</span></li>';
    } else {
      topListEl.innerHTML = summary.topSubscriptions
        .slice(0, 5)
        .map(
          (sub) => `
            <li class="item-row">
              <div class="item-main">
                <p class="item-title">${escapeHTML(sub.name)}</p>
                <p class="item-meta">${escapeHTML(sub.category)} · ${escapeHTML(sub.frequency)}</p>
              </div>
              <div class="item-right">
                <p class="item-amount">${escapeHTML(formatCurrency(sub.monthlyConverted, currency))}/mo</p>
                <p class="item-meta">${escapeHTML(formatCurrency(sub.price, sub.currency))} billed</p>
              </div>
            </li>
          `
        )
        .join('');
    }
  }
}
