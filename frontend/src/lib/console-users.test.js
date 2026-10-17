import { describe, expect, it } from 'vitest'
import { matchUser, filterUsers, sortUsers, parseSort, viewUsers, fmtSeen } from './console-users.js'

const NOW = Date.UTC(2026, 9, 17, 12)
const DAY = 86400000
const ana = { id: 'a', name: 'Ana', email: 'ana@example.com', workouts: 40, lastWorkout: '2026-10-16', lastSync: NOW - DAY }
const jose = { id: 'j', name: 'José', workouts: 3, lastWorkout: '2026-09-01', lastSync: NOW - 20 * DAY }
const root = { id: 'r', name: 'root', admin: true, workouts: 0, lastWorkout: null, lastSync: null }
const off = { id: 'o', name: 'Olga', disabled: true, workouts: 12, lastWorkout: '2026-10-15', lastSync: NOW - 2 * DAY }
const ALL = [ana, jose, root, off]
const ids = list => list.map(u => u.id)

describe('matchUser', () => {
  it('matches name or e-mail, ignoring case and accents', () => {
    expect(matchUser(ana, 'ANA')).toBe(true)
    expect(matchUser(ana, 'example')).toBe(true)
    expect(matchUser(jose, 'jose')).toBe(true)
    expect(matchUser(jose, 'JOSÉ')).toBe(true)
    expect(matchUser(jose, 'ana')).toBe(false)
  })
  it('an empty or blank query matches everyone', () => {
    expect(matchUser(root, '')).toBe(true)
    expect(matchUser(root, '   ')).toBe(true)
  })
  it('a user without an e-mail is searched by name only', () => {
    expect(matchUser(root, 'example')).toBe(false)
  })
})

describe('filterUsers', () => {
  it('all keeps everyone, an unknown filter too', () => {
    expect(ids(filterUsers(ALL, 'all', NOW))).toEqual(['a', 'j', 'r', 'o'])
    expect(ids(filterUsers(ALL, 'nope', NOW))).toEqual(['a', 'j', 'r', 'o'])
  })
  it('active is a sync in the last 7 days', () => {
    expect(ids(filterUsers(ALL, 'active', NOW))).toEqual(['a', 'o'])
  })
  it('inactive leaves disabled accounts out', () => {
    expect(ids(filterUsers(ALL, 'inactive', NOW))).toEqual(['j', 'r'])
  })
  it('disabled and admins', () => {
    expect(ids(filterUsers(ALL, 'disabled', NOW))).toEqual(['o'])
    expect(ids(filterUsers(ALL, 'admins', NOW))).toEqual(['r'])
  })
  it('skips holes in the list', () => {
    expect(ids(filterUsers([null, ana], 'all', NOW))).toEqual(['a'])
  })
})

describe('sortUsers', () => {
  it('defaults to the most recent sync first, never-synced last', () => {
    expect(parseSort(undefined)).toEqual({ key: 'lastSync', desc: true })
    expect(ids(sortUsers(ALL))).toEqual(['a', 'o', 'j', 'r'])
  })
  it('a missing value sorts last in both directions', () => {
    expect(ids(sortUsers(ALL, 'lastSync'))).toEqual(['j', 'o', 'a', 'r'])
    expect(ids(sortUsers(ALL, 'lastWorkout'))).toEqual(['j', 'o', 'a', 'r'])
    expect(ids(sortUsers(ALL, '-lastWorkout'))).toEqual(['a', 'o', 'j', 'r'])
  })
  it('by name, ignoring case and accents', () => {
    expect(ids(sortUsers(ALL, 'name'))).toEqual(['a', 'j', 'o', 'r'])
    expect(ids(sortUsers(ALL, '-name'))).toEqual(['r', 'o', 'j', 'a'])
  })
  it('by workouts', () => {
    expect(ids(sortUsers(ALL, '-workouts'))).toEqual(['a', 'o', 'j', 'r'])
    expect(ids(sortUsers(ALL, 'workouts'))).toEqual(['r', 'j', 'o', 'a'])
  })
  it('does not reorder the list it was given', () => {
    const list = [...ALL]
    sortUsers(list, 'name')
    expect(ids(list)).toEqual(['a', 'j', 'r', 'o'])
  })
})

describe('viewUsers', () => {
  it('searches, filters and sorts together', () => {
    expect(ids(viewUsers(ALL, { q: 'o', f: 'all', s: 'name' }, NOW))).toEqual(['a', 'j', 'o', 'r'])   // Ana by her e-mail
    expect(ids(viewUsers(ALL, { q: 'o', f: 'inactive', s: 'name' }, NOW))).toEqual(['j', 'r'])
  })
})

describe('fmtSeen', () => {
  it('reads relative time through Intl, and Never for a missing timestamp', () => {
    expect(fmtSeen(NOW, NOW)).toBe('now')
    expect(fmtSeen(NOW - 5 * 60000, NOW)).toBe('5 minutes ago')
    expect(fmtSeen(NOW - 3 * 3600000, NOW)).toBe('3 hours ago')
    expect(fmtSeen(NOW - DAY, NOW)).toBe('yesterday')
    expect(fmtSeen(NOW - 4 * DAY, NOW)).toBe('4 days ago')
    expect(fmtSeen(null, NOW)).toBe('Never')
    expect(fmtSeen(0, NOW)).toBe('Never')
  })
})
