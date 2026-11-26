// ==========================================================================
// RenewMe – LocalStorage Persistence
// ==========================================================================

const STORAGE_KEYS = {
  SUBSCRIPTIONS: 'renewme_subscriptions_v1',
  SETTINGS: 'renewme_settings_v1',
  ACTIVITY: 'renewme_activity_v1',
};

const DEFAULT_SETTINGS = {
  currency: 'INR',
  theme: 'light',
  notifications: true,
  reminderDays: 7,
};

/**
 * Reads and parses JSON safely from LocalStorage.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function safeReadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse localStorage key "${key}":`, error);
    return fallback;
  }
}

/**
 * Loads subscriptions from LocalStorage (returns an empty array if none saved).
 * @returns {Array<object>}
 */
export function loadSubscriptions() {
  const parsed = safeReadJSON(STORAGE_KEYS.SUBSCRIPTIONS, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Persists subscriptions array to LocalStorage.
 * @param {Array<object>} subscriptions
 */
export function saveSubscriptions(subscriptions) {
  localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(subscriptions));
}

/**
 * Loads user preferences merged with defaults.
 * @returns {object}
 */
export function loadSettings() {
  const saved = safeReadJSON(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
}

/**
 * Persists user preferences to LocalStorage.
 * @param {object} settings
 */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

/**
 * Loads recent activity log entries.
 * @returns {Array<object>}
 */
export function loadActivity() {
  const parsed = safeReadJSON(STORAGE_KEYS.ACTIVITY, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Persists recent activity log entries (capped at 15).
 * @param {Array<object>} activity
 */
export function saveActivity(activity) {
  localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(activity.slice(0, 15)));
}
