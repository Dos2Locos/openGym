// @vitest-environment happy-dom
// The console (/console/*) end to end, on the real router: who gets in, what the navigation
// offers, and each section against a mocked API. Carries over the cases of the old Admin.test.jsx
// and Admin.password.test.jsx (a failed user list, the reset-code flow, the sign-in e-mail).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  answers: {}, calls: [], posts: [], sheets: [], confirm: null, toasts: [],
  store: { user: { id: 'adm', name: 'Admin', admin: true }, config: {}, guest: false }
}))
vi.mock('../../lib/api.js', () => ({
  api: (path, init) => {
    mocks.calls.push(path)
    if (init?.method === 'POST') mocks.posts.push({ path, body: JSON.parse(init.body) })
    const key = path.split('?')[0]
    const a = mocks.answers[key]
    if (typeof a === 'function') return a(path)
    if (a instanceof Error) return Promise.reject(a)
    return key in mocks.answers ? Promise.resolve(a) : Promise.reject(Object.assign(new Error('not found'), { status: 404 }))
  }
}))
vi.mock('../../store/useStore.js', () => {
  const snap = () => ({ user: mocks.store.user, config: mocks.store.config, isGuest: () => mocks.store.guest, S: {} })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../../store/useUI.js', () => {
  const snap = () => ({ toast: m => mocks.toasts.push(m), openSheet: (render, opts) => mocks.sheets.push({ render, opts }) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirm(...a) }))
vi.mock('../AdminCoach.jsx', () => ({ default: () => <div>COACH SETUP</div> }))
vi.mock('../../lib/instance-equipment.js', () => ({ refreshInstanceEquipment: () => {} }))

const { default: ConsoleRoutes } = await import('./ConsoleRoutes.jsx')

let where = null
function Probe() { where = useLocation(); return null }

const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
const settle = async (n = 3) => { for (let i = 0; i < n; i++) await act(() => new Promise(r => setTimeout(r, 0))) }
function open(path) {
  return render(<MemoryRouter initialEntries={[path]}>
    <ConsoleRoutes />
    <Routes><Route path="*" element={<Probe />} /></Routes>
  </MemoryRouter>)
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const navLabels = host => [...host.querySelectorAll('.con-nav-list .con-nav-link')].map(a => a.textContent.trim())
const rowNames = host => [...host.querySelectorAll('.con-table tbody tr')].map(tr => tr.querySelector('td.primary span:not(.con-live)')?.textContent)

const NOW = Date.now()
const DAY = 86400000
const USERS = [
  { id: 'u1', name: 'Mallory', workouts: 2, lastWorkout: '2026-09-10', lastSync: NOW - 2 * DAY, disabled: false },
  { id: 'u2', name: 'Ana', workouts: 40, lastWorkout: '2026-10-16', lastSync: NOW - 3600000, disabled: false, hasPush: true },
  { id: 'u3', name: 'Olga', workouts: 12, lastWorkout: '2026-10-01', lastSync: NOW - 20 * DAY, disabled: true },
  { id: 'adm', name: 'Admin', workouts: 0, lastWorkout: null, lastSync: null, admin: true }
]
const detail = extra => ({
  user: { id: 'u1', name: 'Mallory', created: '2026-09-01T00:00:00Z', disabled: false, admin: false, invitedBy: null, ...extra },
  unit: 'kg', lastSync: null, counts: { workouts: 2, bodyweight: 1, measurements: 0, routines: 3 },
  workouts: [], bodyweight: [], routines: []
})

beforeEach(() => {
  document.body.innerHTML = ''
  where = null
  mocks.calls.length = 0; mocks.posts.length = 0; mocks.sheets.length = 0; mocks.toasts.length = 0
  mocks.confirm = vi.fn()
  mocks.store = { user: { id: 'adm', name: 'Admin', admin: true }, config: {}, guest: false }
  mocks.answers = {
    '/api/admin/users': { users: USERS, invite_only: false, audit: true, now: NOW },
    '/api/admin/user': detail(),
    '/api/admin/invites': { invites: [], invite_only: false },
    '/api/admin/audit': { events: [], total: 0, enabled: true, retention: { days: 90 }, ip_mode: 'off' },
    '/api/admin/user/disable': { ok: true },
    '/api/admin/user/delete': { ok: true },
    '/api/admin/user/password-reset': { ok: true, name: 'Mallory', code: 'K7WQ-2MZP-4HXA', expires: NOW + DAY }
  }
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('who gets into the console', () => {
  it('an admin lands on the overview', async () => {
    const page = open('/console')
    await settle()
    expect(page.querySelector('h1').textContent).toBe('Overview')
    expect(where.pathname).toBe('/console')
  })

  it('a user who is not an admin goes home, and nothing is asked of /api/admin', async () => {
    mocks.store.user = { id: 'u1', name: 'Mallory', admin: false }
    const page = open('/console/users')
    await settle()
    expect(where.pathname).toBe('/home')
    expect(page.querySelector('.con')).toBeNull()
    expect(mocks.calls.filter(p => p.startsWith('/api/admin'))).toEqual([])
  })

  it('a guest goes home', async () => {
    mocks.store.user = null
    mocks.store.guest = true
    open('/console')
    await settle()
    expect(where.pathname).toBe('/home')
    expect(mocks.calls).toEqual([])
  })

  it('an unknown console path shows the overview', async () => {
    const page = open('/console/nowhere')
    await settle()
    expect(where.pathname).toBe('/console')
    expect(page.querySelector('h1').textContent).toBe('Overview')
  })
})

describe('navigation', () => {
  it('lists the admin sections and marks the current one', async () => {
    const page = open('/console/invites')
    await settle()
    expect(navLabels(page)).toEqual(['Overview', 'Users', 'Invite codes', 'Equipment', 'Activity log'])
    expect(page.querySelector('.con-nav-link.on').textContent.trim()).toBe('Invite codes')
    expect(page.querySelector('.con-nav-link.on').getAttribute('aria-current')).toBe('page')
  })

  it('offers the AI Coach only where the instance does', async () => {
    mocks.store.config = { coach: { enabled: true } }
    const page = open('/console/coach')
    await settle()
    expect(navLabels(page)).toContain('AI Coach')
    expect(page.textContent).toContain('COACH SETUP')
  })

  it('has no Coach and no activity log where the instance has neither', async () => {
    mocks.answers['/api/admin/users'] = { users: USERS, audit: false, now: NOW }
    const page = open('/console/coach')
    await settle()
    expect(navLabels(page)).not.toContain('AI Coach')
    expect(navLabels(page)).not.toContain('Activity log')
    expect(where.pathname).toBe('/console')
  })
})

describe('overview', () => {
  it('shows the figures and who is training now', async () => {
    mocks.answers['/api/admin/users'] = { users: [...USERS, { id: 'u9', name: 'Lifter', workouts: 5, lastSync: NOW, live: { name: 'Push', exIdx: 2, exTotal: 5, setsDone: 6, setsTotal: 15, startedAt: NOW - 25 * 60000 } }], audit: true, now: NOW }
    const page = open('/console')
    await settle()
    const stats = [...page.querySelectorAll('.con-stat')].map(s => s.textContent)
    expect(stats).toEqual(['Users5', 'Training now1', 'Active 7 days3', 'Disabled1'])
    expect(page.textContent).toContain('Push · exercise 2 of 5 · 6/15 sets')
    act(() => page.querySelector('button.con-row').click())
    expect(where.pathname).toBe('/console/users/u9')
  })

  it('says when nobody is training', async () => {
    const page = open('/console')
    await settle()
    expect(page.textContent).toContain('Nobody is training right now.')
  })
})

describe('users', () => {
  it('lists everyone, most recent sync first by default', async () => {
    const page = open('/console/users')
    await settle()
    expect(rowNames(page)).toEqual(['Ana', 'Mallory', 'Olga', 'Admin'])
    expect(page.querySelector('.con-count').textContent).toBe('4 of 4 users')
  })

  it('sorts from a column header, and flips on a second click', async () => {
    const page = open('/console/users')
    await settle()
    const header = [...page.querySelectorAll('th')].find(th => th.textContent.startsWith('Name'))
    act(() => header.querySelector('button').click())
    expect(rowNames(page)).toEqual(['Admin', 'Ana', 'Mallory', 'Olga'])
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    act(() => header.querySelector('button').click())
    expect(rowNames(page)).toEqual(['Olga', 'Mallory', 'Ana', 'Admin'])
    expect(header.getAttribute('aria-sort')).toBe('descending')
  })

  it('opens a user with Enter', async () => {
    const page = open('/console/users')
    await settle()
    const row = page.querySelector('.con-table tbody tr')
    act(() => row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(where.pathname).toBe('/console/users/u2')
  })

  it('keeps search, filter and sort in the URL and brings them back from a user', async () => {
    const page = open('/console/users?q=a&f=active&s=name')
    await settle()
    expect(rowNames(page)).toEqual(['Ana', 'Mallory'])
    expect(page.querySelector('.chip.on').textContent).toBe('Active 7 days')
    act(() => page.querySelector('.con-table tbody tr').click())
    await settle()
    expect(where.pathname).toBe('/console/users/u2')
    act(() => page.querySelector('[aria-label="Back to users"]').click())
    await settle()
    expect(where.pathname).toBe('/console/users')
    expect(where.search).toBe('?q=a&f=active&s=name')
    expect(rowNames(page)).toEqual(['Ana', 'Mallory'])
  })

  it('a search with no match says so and offers to clear it', async () => {
    const page = open('/console/users?q=zzz')
    await settle()
    expect(page.textContent).toContain('No users match')
    act(() => button(page, 'Clear search and filters').click())
    await settle()
    expect(rowNames(page)).toHaveLength(4)
  })

  it('shows e-mail and password columns only on a password instance', async () => {
    let page = open('/console/users')
    await settle()
    expect([...page.querySelectorAll('th')].map(th => th.textContent)).not.toContain('Password')
    act(() => { mounted.splice(0).forEach(r => r.unmount()) })
    mocks.answers['/api/admin/users'] = { users: [{ ...USERS[0], password: true, email: 'mallory@example.com' }], password_login: true, audit: true }
    page = open('/console/users')
    await settle()
    expect([...page.querySelectorAll('th')].map(th => th.textContent)).toContain('Password')
    expect(page.textContent).toContain('mallory@example.com')
  })

  // The users call failing, or answering without a list, used to leave "Loading…" up for good.
  it('an answer without a list is an error, not an endless "Loading…"', async () => {
    mocks.answers['/api/admin/users'] = {}
    const page = open('/console/users')
    await settle()
    expect(page.textContent).not.toContain('Loading…')
    expect(page.querySelector('[role="alert"]').textContent).toContain('The server answered without a list of users.')
  })

  it('a failed call says why, and "Try again" loads the list once the server answers', async () => {
    delete mocks.answers['/api/admin/users']
    const page = open('/console/users')
    await settle()
    expect(page.querySelector('[role="alert"]').textContent).toContain('not found')
    mocks.answers['/api/admin/users'] = { users: USERS, audit: true }
    act(() => button(page, 'Try again').click())
    await settle()
    expect(page.querySelector('[role="alert"]')).toBeNull()
    expect(rowNames(page)).toHaveLength(4)
  })

  it('a list that loaded stays up when a later update fails, marked as possibly out of date', async () => {
    const page = open('/console/users')
    await settle()
    mocks.answers['/api/admin/users'] = new Error('offline')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await settle()
    expect(page.querySelector('[role="alert"]').textContent).toContain('The last update failed')
    expect(rowNames(page)).toHaveLength(4)
  })
})

describe('a user\'s page', () => {
  it('shows the account and its counts, and no training data', async () => {
    const page = open('/console/users/u1')
    await settle()
    expect(page.querySelector('h1').textContent).toBe('Mallory')
    expect([...page.querySelectorAll('.con-stat')].map(s => s.textContent)).toEqual(['Workouts2', 'Weigh-ins1', 'Measurements0', 'Routines3'])
    expect(button(page, 'Disable account')).toBeTruthy()
  })

  it('offers no download of the user\'s data, and asks twice before deleting', async () => {
    const page = open('/console/users/u1')
    await settle()
    expect([...page.querySelectorAll('button')].some(b => /download/i.test(b.textContent))).toBe(false)
    act(() => button(page, 'Delete account').click())
    const first = mocks.confirm.mock.calls[0][0]
    expect(first.title).toBe('Delete Mallory?')
    expect(first.message).toMatch(/export a backup from Settings/)
    act(() => first.onConfirm())
    const second = mocks.confirm.mock.calls[1][0]
    expect(second.title).toBe('Delete Mallory for good?')
    expect(mocks.posts).toEqual([])
    await act(async () => { await second.onConfirm() })
    await settle()
    expect(mocks.posts).toEqual([{ path: '/api/admin/user/delete', body: { id: 'u1' } }])
    expect(where.pathname).toBe('/console/users')
  })

  it('disables after a confirm, and enables without one', async () => {
    const page = open('/console/users/u1')
    await settle()
    act(() => button(page, 'Disable account').click())
    expect(mocks.posts).toEqual([])
    // the page reloads the account after the change: it comes back disabled
    mocks.answers['/api/admin/user'] = detail({ disabled: true })
    await act(async () => { await mocks.confirm.mock.calls[0][0].onConfirm() })
    expect(mocks.posts).toEqual([{ path: '/api/admin/user/disable', body: { id: 'u1', disabled: true } }])
    await settle()
    act(() => button(page, 'Enable account').click())
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/admin/user/disable', body: { id: 'u1', disabled: false } })
  })

  it('offers neither disable nor delete on an admin', async () => {
    mocks.answers['/api/admin/user'] = detail({ admin: true })
    const page = open('/console/users/u1')
    await settle()
    expect(button(page, 'Disable account')).toBeUndefined()
    expect(button(page, 'Delete account')).toBeUndefined()
  })

  it('says the user does not exist for an unknown id', async () => {
    mocks.answers['/api/admin/user'] = () => Promise.reject(Object.assign(new Error('no such user'), { status: 404 }))
    const page = open('/console/users/gone')
    await settle()
    expect(page.textContent).toContain('This user does not exist')
    act(() => [...page.querySelectorAll('button')].find(b => b.textContent === 'Back to users').click())
    expect(where.pathname).toBe('/console/users')
  })

  // An older server, or one whose answer predates `counts`, must not blank the page.
  it('opens with no counts at all', async () => {
    const d = detail(); delete d.counts
    mocks.answers['/api/admin/user'] = d
    const page = open('/console/users/u1')
    await settle()
    expect([...page.querySelectorAll('.con-stat-v')].map(s => s.textContent)).toEqual(['0', '0', '0', '0'])
  })
})

describe('reset password', () => {
  it('is not there on an instance without password sign-in', async () => {
    const page = open('/console/users/u1')
    await settle()
    expect(button(page, 'Reset password')).toBeUndefined()
  })

  it('asks first, then shows the one-time code once, on a sheet that stays until "Done"', async () => {
    mocks.answers['/api/admin/user'] = detail({ password: true, email: 'mallory@example.com', resetUntil: null })
    const page = open('/console/users/u1')
    await settle()
    act(() => button(page, 'Reset password').click())
    const opts = mocks.confirm.mock.calls[0][0]
    expect(opts.confirmText).toBe('Create reset code')
    expect(opts.message).toMatch(/current password stops working/)
    expect(mocks.posts).toEqual([])
    await act(async () => { await opts.onConfirm() })
    await settle()
    expect(mocks.posts).toEqual([{ path: '/api/admin/user/password-reset', body: { id: 'u1' } }])
    const shown = mocks.sheets.find(s => s.opts?.locked)
    const code = render(shown.render(() => {}))
    expect(code.textContent).toContain('K7WQ-2MZP-4HXA')
    expect(code.textContent).toContain('or their sign-in e-mail mallory@example.com')
    expect(button(code, 'Done')).toBeTruthy()
  })

  it('offers it to a profile with no password too, and shows a pending code', async () => {
    mocks.answers['/api/admin/user'] = detail({ password: false, resetUntil: NOW + 3600000 })
    const page = open('/console/users/u1')
    await settle()
    expect(button(page, 'Reset password')).toBeTruthy()
    expect(page.textContent).toMatch(/lets them set one/)
    expect(page.textContent).toMatch(/reset code until/)
  })
})

describe('invite codes', () => {
  it('creates, lists unused and used codes, and revokes after a confirm', async () => {
    mocks.answers['/api/admin/invites'] = { invite_only: true, invites: [
      { code: 'AAAA1111BBBB2222', created: '2026-10-01' },
      { code: 'CCCC3333DDDD4444', usedBy: 'u2', usedByName: 'Ana' }
    ] }
    mocks.answers['/api/admin/invites/new'] = { invite: { code: 'EEEE5555FFFF6666' } }
    mocks.answers['/api/admin/invites/revoke'] = { ok: true }
    const page = open('/console/invites')
    await settle()
    expect(page.textContent).toContain('Sign-up is invite-only')
    expect(page.textContent).toContain('Used by Ana')
    expect(page.querySelector('[aria-label="Revoke CCCC3333DDDD4444"]')).toBeNull()
    act(() => page.querySelector('[aria-label="Revoke AAAA1111BBBB2222"]').click())
    await act(async () => { await mocks.confirm.mock.calls[0][0].onConfirm() })
    expect(mocks.posts).toEqual([{ path: '/api/admin/invites/revoke', body: { code: 'AAAA1111BBBB2222' } }])
    act(() => button(page, 'New code').click())
    await settle()
    expect(mocks.posts.at(-1).path).toBe('/api/admin/invites/new')
    expect(mocks.toasts).toContain('Code EEEE5555FFFF6666 created and copied')
  })

  it('explains how to make one when there are none', async () => {
    const page = open('/console/invites')
    await settle()
    expect(page.textContent).toContain('No codes yet')
  })
})

describe('activity log', () => {
  const ev = (id, ev, ok = true) => ({ id, ev, ok, ts: NOW - id * 1000, name: 'Ana' })
  it('filters by category and loads more at the end', async () => {
    mocks.answers['/api/admin/audit'] = path => Promise.resolve(path.includes('before=')
      ? { events: [ev(3, 'auth.logout')], total: 3, enabled: true, retention: {}, nextBefore: null }
      : path.includes('cat=fail')
        ? { events: [ev(9, 'auth.login.fail', false)], total: 1, enabled: true, retention: {} }
        : { events: [ev(1, 'auth.login.ok'), ev(2, 'admin.user.disable')], total: 3, enabled: true, retention: {}, nextBefore: 2 })
    const page = open('/console/activity')
    await settle()
    expect([...page.querySelectorAll('.con-row-t')].map(r => r.textContent)).toEqual(['Signed in', 'Disabled an account admin'])
    act(() => button(page, 'Show more').click())
    await settle()
    expect(page.querySelectorAll('.con-row')).toHaveLength(3)
    act(() => button(page, 'Failed').click())
    await settle()
    expect(mocks.calls.at(-1)).toContain('cat=fail')
    expect([...page.querySelectorAll('.con-row-t')].map(r => r.textContent)).toEqual(['Sign-in failed failed'])
  })
})
