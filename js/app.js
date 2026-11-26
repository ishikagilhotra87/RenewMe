// ==========================================================================
// RenewMe – Application Entry Point & UI Controller
// ==========================================================================

import { renderAnalyticsView } from './analytics.js';
import {
  renderDashboardView,
  renderRenewalsView,
  renderSubscriptionsView,
} from './dashboard.js';
import {
  loadActivity,
  loadSettings,
  loadSubscriptions,
  saveActivity,
  saveSettings,
  saveSubscriptions,
} from './storage.js';
import {
  buildSubscriptionRecord,
  calculateNextRenewalDate,
  formatISODate,
  getDaysUntilRenewal,
  validateSubscription,
} from './subscriptions.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  subscriptions: 'My Subscriptions',
  'add-subscription': 'Add Subscription',
  renewals: 'Upcoming Renewals',
  analytics: 'Expense Analytics',
  settings: 'Settings',
};

const state = {
  subscriptions: [],
  settings: {},
  activity: [],
  activeView: 'dashboard',
  editingId: null,
  filters: {
    search: '',
    category: 'all',
    status: 'all',
    sortBy: 'renewal-asc',
  },
};

/**
 * Re-renders Lucide SVG icons safely after dynamic DOM updates.
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Displays a temporary toast message in the bottom-right container.
 * @param {string} message
 * @param {'info'|'success'|'error'} [type]
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

/**
 * Logs a short user action message into recent activity & persists it.
 * @param {string} message
 */
function recordActivity(message) {
  state.activity.unshift({
    id: `act-${Date.now()}`,
    message,
    timestamp: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 15);
  saveActivity(state.activity);
}

/**
 * Opens or closes the mobile slide-over sidebar drawer.
 * @param {boolean} isOpen
 */
function toggleMobileSidebar(isOpen) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const menuToggle = document.getElementById('menu-toggle');

  if (!sidebar || !backdrop || !menuToggle) return;

  sidebar.classList.toggle('open', isOpen);
  backdrop.hidden = !isOpen;
  menuToggle.setAttribute('aria-expanded', String(isOpen));
}

/**
 * Applies the selected theme (`light` or `dark`) to the document root.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

/**
 * Re-renders all views from the current application state.
 */
function renderAllViews() {
  renderDashboardView(state.subscriptions, state.activity, state.settings);
  renderSubscriptionsView(state.subscriptions, state.filters, state.settings);
  renderRenewalsView(state.subscriptions);
  renderAnalyticsView(state.subscriptions, state.settings);
  refreshIcons();
}

/**
 * Switches the visible view section and updates navigation state.
 * @param {string} viewName
 */
function navigateTo(viewName) {
  if (!(viewName in VIEW_TITLES)) return;
  state.activeView = viewName;

  document.querySelectorAll('#app-views .view').forEach((section) => {
    const isTarget = section.id === `view-${viewName}`;
    section.hidden = !isTarget;
    section.classList.toggle('active', isTarget);
  });

  document.querySelectorAll('.sidebar-nav .nav-item').forEach((btn) => {
    const isTarget = btn.dataset.view === viewName;
    btn.classList.toggle('active', isTarget);
    if (isTarget) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent =
      viewName === 'add-subscription' && state.editingId
        ? 'Edit Subscription'
        : VIEW_TITLES[viewName];
  }

  toggleMobileSidebar(false);
}

/**
 * Clears inline validation error messages and error styling on the form.
 */
function clearFormErrors() {
  document.querySelectorAll('#subscription-form .error-message').forEach((el) => {
    el.textContent = '';
  });
  document.querySelectorAll('#subscription-form .input-error').forEach((el) => {
    el.classList.remove('input-error');
  });
}

/**
 * Displays validation error messages next to matching form fields.
 * @param {Record<string, string>} errors
 */
function showFormErrors(errors) {
  const fieldToInputId = {
    name: 'sub-name',
    category: 'sub-category',
    price: 'sub-price',
    currency: 'sub-currency',
    frequency: 'sub-frequency',
    paymentMethod: 'sub-payment',
    startDate: 'sub-start-date',
    nextRenewalDate: 'sub-renewal-date',
    websiteUrl: 'sub-url',
  };

  Object.entries(errors).forEach(([field, message]) => {
    const inputId = fieldToInputId[field];
    if (!inputId) return;
    const inputEl = document.getElementById(inputId);
    const errorEl = document.getElementById(`error-${inputId}`);
    if (inputEl) inputEl.classList.add('input-error');
    if (errorEl) errorEl.textContent = message;
  });
}

/**
 * Resets the Add/Edit form back to clean "Add Subscription" defaults.
 */
function resetSubscriptionForm() {
  const form = document.getElementById('subscription-form');
  if (!form) return;

  form.reset();
  clearFormErrors();
  state.editingId = null;

  const todayStr = formatISODate(new Date());
  const startInput = document.getElementById('sub-start-date');
  const renewalInput = document.getElementById('sub-renewal-date');
  const currencyInput = document.getElementById('sub-currency');
  const heading = document.getElementById('heading-add-subscription');
  const submitBtn = document.getElementById('submit-sub-btn');

  document.getElementById('sub-id').value = '';
  if (currencyInput) currencyInput.value = state.settings.currency || 'INR';
  if (startInput) startInput.value = todayStr;
  if (renewalInput) {
    renewalInput.value = calculateNextRenewalDate(todayStr, 'monthly');
  }
  if (heading) heading.textContent = 'Add Subscription';
  if (submitBtn) submitBtn.textContent = 'Save Subscription';
}

/**
 * Populates the form with an existing subscription's data for editing.
 * @param {string} id
 */
function startEditingSubscription(id) {
  const sub = state.subscriptions.find((item) => item.id === id);
  if (!sub) return;

  clearFormErrors();
  state.editingId = sub.id;

  document.getElementById('sub-id').value = sub.id;
  document.getElementById('sub-name').value = sub.name;
  document.getElementById('sub-category').value = sub.category;
  document.getElementById('sub-price').value = String(sub.price);
  document.getElementById('sub-currency').value = sub.currency;
  document.getElementById('sub-frequency').value = sub.frequency;
  document.getElementById('sub-payment').value = sub.paymentMethod;
  document.getElementById('sub-start-date').value = sub.startDate;
  document.getElementById('sub-renewal-date').value = sub.nextRenewalDate;
  document.getElementById('sub-status').value = sub.status;
  document.getElementById('sub-url').value = sub.websiteUrl || '';
  document.getElementById('sub-notes').value = sub.notes || '';

  const heading = document.getElementById('heading-add-subscription');
  const submitBtn = document.getElementById('submit-sub-btn');
  if (heading) heading.textContent = `Edit Subscription: ${sub.name}`;
  if (submitBtn) submitBtn.textContent = 'Update Subscription';

  navigateTo('add-subscription');
}

/**
 * Handles Add / Update subscription form submission.
 * @param {SubmitEvent} event
 */
function handleFormSubmit(event) {
  event.preventDefault();
  clearFormErrors();

  const payload = {
    name: document.getElementById('sub-name').value,
    category: document.getElementById('sub-category').value,
    price: document.getElementById('sub-price').value,
    currency: document.getElementById('sub-currency').value,
    frequency: document.getElementById('sub-frequency').value,
    paymentMethod: document.getElementById('sub-payment').value,
    startDate: document.getElementById('sub-start-date').value,
    nextRenewalDate: document.getElementById('sub-renewal-date').value,
    status: document.getElementById('sub-status').value,
    websiteUrl: document.getElementById('sub-url').value,
    notes: document.getElementById('sub-notes').value,
  };

  const { valid, errors } = validateSubscription(payload);
  if (!valid) {
    showFormErrors(errors);
    showToast('Please fix the highlighted form errors.', 'error');
    return;
  }

  if (state.editingId) {
    const index = state.subscriptions.findIndex((item) => item.id === state.editingId);
    if (index !== -1) {
      const existing = state.subscriptions[index];
      state.subscriptions[index] = {
        ...existing,
        ...buildSubscriptionRecord(payload),
        id: existing.id,
        createdAt: existing.createdAt,
      };
      saveSubscriptions(state.subscriptions);
      recordActivity(`Updated ${payload.name.trim()}`);
      showToast(`Updated "${payload.name.trim()}".`, 'success');
    }
  } else {
    const newSub = buildSubscriptionRecord(payload);
    state.subscriptions.unshift(newSub);
    saveSubscriptions(state.subscriptions);
    recordActivity(`Added ${newSub.name}`);
    showToast(`Added "${newSub.name}" to your subscriptions.`, 'success');
  }

  resetSubscriptionForm();
  renderAllViews();
  navigateTo('subscriptions');
}

/**
 * Deletes a subscription after user confirmation.
 * @param {string} id
 */
function handleDeleteSubscription(id) {
  const sub = state.subscriptions.find((item) => item.id === id);
  if (!sub) return;

  const confirmed = window.confirm(`Delete "${sub.name}"? This cannot be undone.`);
  if (!confirmed) return;

  state.subscriptions = state.subscriptions.filter((item) => item.id !== id);
  saveSubscriptions(state.subscriptions);
  recordActivity(`Deleted ${sub.name}`);
  renderAllViews();
  showToast(`Deleted "${sub.name}".`, 'info');
}

/**
 * Syncs Settings form controls with loaded state.settings.
 */
function syncSettingsUI() {
  const currencyEl = document.getElementById('setting-currency');
  const themeEl = document.getElementById('setting-theme');
  const notifEl = document.getElementById('setting-notifications');
  const reminderEl = document.getElementById('setting-reminder-days');

  if (currencyEl) currencyEl.value = state.settings.currency;
  if (themeEl) themeEl.value = state.settings.theme;
  if (notifEl) notifEl.checked = Boolean(state.settings.notifications);
  if (reminderEl) reminderEl.value = String(state.settings.reminderDays);
}

/**
 * Checks for upcoming renewals on startup and shows a reminder toast if enabled.
 */
function checkStartupRenewalAlerts() {
  if (!state.settings.notifications) return;

  const leadDays = Number(state.settings.reminderDays) || 7;
  const upcoming = state.subscriptions.filter((sub) => {
    if (sub.status !== 'active') return false;
    const days = getDaysUntilRenewal(sub.nextRenewalDate);
    return days !== null && days >= 0 && days <= leadDays;
  });

  if (upcoming.length > 0) {
    showToast(
      `Reminder: ${upcoming.length} subscription${upcoming.length > 1 ? 's' : ''} renewing within ${leadDays} days.`,
      'info'
    );
  }
}

/**
 * Attaches all DOM event listeners.
 */
function bindEvents() {
  // Global [data-view] navigation delegation
  document.addEventListener('click', (event) => {
    const viewTrigger = event.target.closest('[data-view]');
    if (!viewTrigger) return;

    const targetView = viewTrigger.dataset.view;
    if (targetView === 'add-subscription' && viewTrigger.id === 'quick-add-btn') {
      resetSubscriptionForm();
    } else if (
      targetView === 'add-subscription' &&
      viewTrigger.classList.contains('nav-item') &&
      state.editingId
    ) {
      resetSubscriptionForm();
    }
    navigateTo(targetView);
  });

  // Mobile sidebar drawer controls
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    toggleMobileSidebar(!sidebar?.classList.contains('open'));
  });
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    toggleMobileSidebar(false);
  });

  // Subscription Form submit & cancel
  document.getElementById('subscription-form')?.addEventListener('submit', handleFormSubmit);
  document.getElementById('cancel-sub-btn')?.addEventListener('click', () => {
    resetSubscriptionForm();
    navigateTo('subscriptions');
  });

  // Auto-calculate Next Renewal Date when Start Date or Billing Frequency changes
  const autoRecalcRenewal = () => {
    const startVal = document.getElementById('sub-start-date')?.value;
    const freqVal = document.getElementById('sub-frequency')?.value;
    const renewalInput = document.getElementById('sub-renewal-date');
    if (startVal && freqVal && renewalInput) {
      const calculated = calculateNextRenewalDate(startVal, freqVal);
      if (calculated) renewalInput.value = calculated;
    }
  };
  document.getElementById('sub-start-date')?.addEventListener('change', autoRecalcRenewal);
  document.getElementById('sub-frequency')?.addEventListener('change', autoRecalcRenewal);

  // Table Edit / Delete delegation
  document.getElementById('subscriptions-tbody')?.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;

    const { action, id } = actionBtn.dataset;
    if (action === 'edit') startEditingSubscription(id);
    if (action === 'delete') handleDeleteSubscription(id);
  });

  // Search, Filter & Sort listeners
  document.getElementById('search-input')?.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderSubscriptionsView(state.subscriptions, state.filters, state.settings);
    refreshIcons();
  });

  document.getElementById('filter-category')?.addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    renderSubscriptionsView(state.subscriptions, state.filters, state.settings);
    refreshIcons();
  });

  document.getElementById('filter-status')?.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderSubscriptionsView(state.subscriptions, state.filters, state.settings);
    refreshIcons();
  });

  document.getElementById('sort-by')?.addEventListener('change', (event) => {
    state.filters.sortBy = event.target.value;
    renderSubscriptionsView(state.subscriptions, state.filters, state.settings);
    refreshIcons();
  });

  // Settings preferences
  document.getElementById('settings-form')?.addEventListener('change', () => {
    state.settings = {
      currency: document.getElementById('setting-currency').value,
      theme: document.getElementById('setting-theme').value,
      notifications: document.getElementById('setting-notifications').checked,
      reminderDays: Number(document.getElementById('setting-reminder-days').value),
    };
    saveSettings(state.settings);
    applyTheme(state.settings.theme);
    renderAllViews();
    showToast('Settings saved.', 'success');
  });
}

/**
 * Bootstraps the application on startup.
 */
function init() {
  state.settings = loadSettings();
  state.subscriptions = loadSubscriptions();
  state.activity = loadActivity();

  applyTheme(state.settings.theme);
  syncSettingsUI();
  resetSubscriptionForm();
  bindEvents();
  renderAllViews();
  navigateTo('dashboard');
  checkStartupRenewalAlerts();
}

init();
