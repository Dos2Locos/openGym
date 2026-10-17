// The console's user table (views/console/Users.jsx): search, filter and sort over the rows
// GET /api/admin/users answers with. Pure, so the rules the table promises are pinned by a test
// rather than by clicking through it.

import { t } from './i18n-core.js'
import { fmtAgo } from './format.js'

const DAY = 86400000
export const ACTIVE_DAYS = 7

// Lower case, accents off: "José" is found by "jose", "Ana" by "ANA". Local rather than
// exercises.js's normalizeStr, which would pull the whole catalogue into the console.
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Does `u` match the search box? An empty query matches everyone. */
export function matchUser(u, q) {
  const needle = fold(q).trim()
  if (!needle) return true
  return fold(u?.name).includes(needle) || fold(u?.email).includes(needle)
}

export const isActive = (u, now = Date.now()) => !!u?.lastSync && now - u.lastSync < ACTIVE_DAYS * DAY

export const FILTERS = ['all', 'active', 'inactive', 'disabled', 'admins']

const KEEP = {
  all: () => true,
  active: (u, now) => isActive(u, now),
  // Inactive is "could be training and isn't": a disabled account has its own filter.
  inactive: (u, now) => !u.disabled && !isActive(u, now),
  disabled: u => !!u.disabled,
  admins: u => !!u.admin
}

/** The rows the filter `f` keeps (an unknown filter keeps them all). */
export function filterUsers(users, f = 'all', now = Date.now()) {
  const keep = KEEP[f] || KEEP.all
  return (users || []).filter(u => u && keep(u, now))
}

// `-` in front means descending: `-lastSync` is the default, most recent first.
export const SORTS = ['name', 'workouts', 'lastWorkout', 'lastSync']

const KEYS = {
  name: u => fold(u.name),
  workouts: u => (Number.isFinite(u.workouts) ? u.workouts : null),
  lastWorkout: u => u.lastWorkout || null,   // ISO date: compares as a string
  lastSync: u => u.lastSync || null
}

export function parseSort(s) {
  const desc = typeof s === 'string' && s.startsWith('-')
  const key = desc ? s.slice(1) : s
  return KEYS[key] ? { key, desc } : { key: 'lastSync', desc: true }
}

/** A sorted copy. A missing value (never synced, no workout yet) sorts last either way. */
export function sortUsers(users, s) {
  const { key, desc } = parseSort(s)
  const get = KEYS[key]
  return [...(users || [])].sort((a, b) => {
    const x = get(a), y = get(b)
    if (x == null && y == null) return fold(a.name) < fold(b.name) ? -1 : 1
    if (x == null) return 1
    if (y == null) return -1
    if (x === y) return fold(a.name) < fold(b.name) ? -1 : 1
    return (x < y ? -1 : 1) * (desc ? -1 : 1)
  })
}

/** Search, filter and sort in one go, the order the table applies them. */
export const viewUsers = (users, { q = '', f = 'all', s } = {}, now = Date.now()) =>
  sortUsers(filterUsers(users, f, now).filter(u => matchUser(u, q)), s)

/** "5 minutes ago" in the app's language, or "Never" for a timestamp that is not there. */
export const fmtSeen = (ts, now = Date.now()) => (ts ? fmtAgo(ts, now) : t('Never'))
