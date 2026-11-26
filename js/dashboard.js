// ==========================================================================
// RenewMe – Dashboard, Subscriptions Table & Upcoming Renewals Rendering
// ==========================================================================

import {
  computeSpendingSummary,
  renderBarChart,
  renderCategoryBars,
} from './analytics.js';
import {
  escapeHTML,
  filterAndSortSubscriptions,
  formatCurrency,
  formatDisplayDate,
  getDaysUntilRenewal,
} from './subscriptions.js';

/**
 * Formats a relative renewal label & badge class based on days remaining.
 * @param {number|null} days
 * @returns {{ label: string, badgeClass: string }}
 */
function getRenewalBadge(days) {
  if (days === null) return { label: '—', badgeClass: 'badge-cancelled' };
  if (days < 0) return { label: `Overdue (${Math.abs(days)}d)`, badgeClass: 'badge-urgent' };
  if (days === 0) return { label: 'Due Today', badgeClass: 'badge-urgent' };
  if (days === 1) return { label: 'Tomorrow', badgeClass: 'badge-warning' };
  if (days <= 7) return { label: `In ${days} days`, badgeClass: 'badge-warning' };
  return { label: `In ${days} days`, badgeClass: 'badge-info' };
}

/**
 * Renders an empty or populated list of upcoming renewal items.
 * @param {HTMLElement|null} listEl
 * @param {Array<object>} items
 * @param {string} emptyText
 */
function renderRenewalItems(listEl, items, emptyText) {
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = `<li class="item-row"><span class="item-meta">${escapeHTML(emptyText)}</span></li>`;
    return;
  }

  listEl.innerHTML = items
    .map((sub) => {
      const days = getDaysUntilRenewal(sub.nextRenewalDate);
      const badge = getRenewalBadge(days);
      return `
        <li class="item-row">
          <div class="item-main">
            <p class="item-title">${escapeHTML(sub.name)}</p>
            <p class="item-meta">
              ${escapeHTML(formatDisplayDate(sub.nextRenewalDate))} · ${escapeHTML(sub.paymentMethod)}
            </p>
          </div>
          <div class="item-right">
            <p class="item-amount">${escapeHTML(formatCurrency(sub.price, sub.currency))}</p>
            <span class="badge ${badge.badgeClass}">${escapeHTML(badge.label)}</span>
          </div>
        </li>
      `;
    })
    .join('');
}

/**
 * Formats an ISO timestamp into a concise local date/time string.
 * @param {string} isoTimestamp
 * @returns {string}
 */
function formatActivityTime(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Renders the Dashboard KPIs, chart, categories, upcoming renewals, and activity.
 * @param {Array<object>} subscriptions
 * @param {Array<object>} activity
 * @param {object} settings
 */
export function renderDashboardView(subscriptions, activity, settings) {
  const currency = settings.currency || 'INR';
  const summary = computeSpendingSummary(subscriptions, currency);

  const activeUpcoming = subscriptions
    .filter((sub) => sub.status === 'active')
    .map((sub) => ({ ...sub, daysUntil: getDaysUntilRenewal(sub.nextRenewalDate) }))
    .filter((sub) => sub.daysUntil !== null && sub.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const dueWithin7Days = activeUpcoming.filter((sub) => sub.daysUntil <= 7);

  const activeCountEl = document.getElementById('kpi-active-count');
  const totalCountEl = document.getElementById('kpi-total-count');
  const monthlySpendEl = document.getElementById('kpi-monthly-spend');
  const yearlySpendEl = document.getElementById('kpi-yearly-spend');
  const upcomingCountEl = document.getElementById('kpi-upcoming-count');

  if (activeCountEl) activeCountEl.textContent = String(summary.activeCount);
  if (totalCountEl) totalCountEl.textContent = `${summary.totalCount} total tracked`;
  if (monthlySpendEl) monthlySpendEl.textContent = formatCurrency(summary.monthlyTotal, currency);
  if (yearlySpendEl) yearlySpendEl.textContent = formatCurrency(summary.yearlyTotal, currency);
  if (upcomingCountEl) upcomingCountEl.textContent = String(dueWithin7Days.length);

  // Dashboard Bar Chart: Top 6 active subscriptions by normalized monthly cost
  const chartBars = summary.topSubscriptions.slice(0, 6).map((sub) => ({
    label: sub.name,
    value: sub.monthlyConverted,
  }));
  renderBarChart(
    document.getElementById('dashboard-spending-chart'),
    chartBars,
    currency,
    'Add active subscriptions to visualize your monthly spend.'
  );

  // Category Distribution
  renderCategoryBars(
    document.getElementById('dashboard-category-list'),
    summary.categoryEntries,
    currency
  );

  // Upcoming Renewals Preview
  renderRenewalItems(
    document.getElementById('dashboard-upcoming-list'),
    activeUpcoming.slice(0, 5),
    'No upcoming renewals scheduled.'
  );

  // Recent Activity
  const activityEl = document.getElementById('dashboard-activity-list');
  if (activityEl) {
    if (!activity.length) {
      activityEl.innerHTML = '<li class="item-row"><span class="item-meta">No recent activity yet.</span></li>';
    } else {
      activityEl.innerHTML = activity
        .slice(0, 5)
        .map(
          (entry) => `
            <li class="item-row">
              <div class="item-main">
                <p class="item-title">${escapeHTML(entry.message)}</p>
              </div>
              <div class="item-right">
                <span class="item-meta">${escapeHTML(formatActivityTime(entry.timestamp))}</span>
              </div>
            </li>
          `
        )
        .join('');
    }
  }
}

/**
 * Renders the My Subscriptions table with search, filters, and sort applied.
 * @param {Array<object>} subscriptions
 * @param {object} filters
 * @param {object} settings
 */
export function renderSubscriptionsView(subscriptions, filters, settings) {
  const list = filterAndSortSubscriptions(subscriptions, {
    ...filters,
    displayCurrency: settings.currency || 'INR',
  });

  const countEl = document.getElementById('subscriptions-count');
  const tbody = document.getElementById('subscriptions-tbody');
  const emptyEl = document.getElementById('subscriptions-empty');

  if (countEl) {
    countEl.textContent = `${list.length} ${list.length === 1 ? 'subscription' : 'subscriptions'} shown`;
  }

  if (!tbody || !emptyEl) return;

  if (!list.length) {
    tbody.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  tbody.innerHTML = list
    .map((sub) => {
      const days = sub.status === 'active' ? getDaysUntilRenewal(sub.nextRenewalDate) : null;
      const renewalTag =
        days !== null && days >= 0 && days <= (settings.reminderDays ?? 7)
          ? `<span class="badge ${getRenewalBadge(days).badgeClass}">${escapeHTML(getRenewalBadge(days).label)}</span>`
          : '';

      const statusBadgeClass =
        sub.status === 'active'
          ? 'badge-active'
          : sub.status === 'cancelled'
          ? 'badge-cancelled'
          : 'badge-expired';

      const nameMarkup = sub.websiteUrl
        ? `<a href="${escapeHTML(sub.websiteUrl)}" target="_blank" rel="noopener noreferrer" class="sub-name-title">${escapeHTML(sub.name)}</a>`
        : `<span class="sub-name-title">${escapeHTML(sub.name)}</span>`;

      return `
        <tr>
          <td>
            <div class="sub-name-cell">
              ${nameMarkup}
              ${sub.notes ? `<span class="sub-name-note" title="${escapeHTML(sub.notes)}">${escapeHTML(sub.notes)}</span>` : ''}
            </div>
          </td>
          <td>${escapeHTML(sub.category)}</td>
          <td><strong>${escapeHTML(formatCurrency(sub.price, sub.currency))}</strong></td>
          <td style="text-transform: capitalize;">${escapeHTML(sub.frequency)}</td>
          <td>${escapeHTML(formatDisplayDate(sub.startDate))}</td>
          <td>
            <div>${escapeHTML(formatDisplayDate(sub.nextRenewalDate))}</div>
            ${renewalTag}
          </td>
          <td>${escapeHTML(sub.paymentMethod)}</td>
          <td><span class="badge ${statusBadgeClass}">${escapeHTML(sub.status)}</span></td>
          <td class="col-actions">
            <div class="table-actions">
              <button
                type="button"
                class="icon-btn"
                data-action="edit"
                data-id="${escapeHTML(sub.id)}"
                aria-label="Edit ${escapeHTML(sub.name)}"
                title="Edit"
              >
                <i data-lucide="pencil" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-danger"
                data-action="delete"
                data-id="${escapeHTML(sub.id)}"
                aria-label="Delete ${escapeHTML(sub.name)}"
                title="Delete"
              >
                <i data-lucide="trash-2" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Renders the Upcoming Renewals view grouped into Today, Next 7 Days, and Next 30 Days.
 * @param {Array<object>} subscriptions
 */
export function renderRenewalsView(subscriptions) {
  const active = subscriptions
    .filter((sub) => sub.status === 'active')
    .map((sub) => ({ ...sub, daysUntil: getDaysUntilRenewal(sub.nextRenewalDate) }))
    .filter((sub) => sub.daysUntil !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Include overdue active renewals alongside Today so none are hidden
  const dueToday = active.filter((sub) => sub.daysUntil <= 0);
  const next7Days = active.filter((sub) => sub.daysUntil >= 1 && sub.daysUntil <= 7);
  const next30Days = active.filter((sub) => sub.daysUntil >= 8 && sub.daysUntil <= 30);

  const todayCountEl = document.getElementById('renewals-today-count');
  const weekCountEl = document.getElementById('renewals-week-count');
  const monthCountEl = document.getElementById('renewals-month-count');

  if (todayCountEl) todayCountEl.textContent = String(dueToday.length);
  if (weekCountEl) weekCountEl.textContent = String(next7Days.length);
  if (monthCountEl) monthCountEl.textContent = String(next30Days.length);

  renderRenewalItems(
    document.getElementById('renewals-today-list'),
    dueToday,
    'No renewals due today.'
  );
  renderRenewalItems(
    document.getElementById('renewals-week-list'),
    next7Days,
    'No renewals due in the next 7 days.'
  );
  renderRenewalItems(
    document.getElementById('renewals-month-list'),
    next30Days,
    'No renewals due between 8 and 30 days.'
  );
}
