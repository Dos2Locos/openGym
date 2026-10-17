import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { api } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'
import Icon from '../../components/Icon.jsx'
import ErrorBoundary from '../../components/ErrorBoundary.jsx'
import { AREAS, sectionHref, sectionOf, visibleSections } from './sections.js'
import '../../console.css'

// The console (/console/*): a workspace of its own, outside #app, with no tab bar. The shell
// owns the navigation and the one piece of data several sections read — the user list from
// GET /api/admin/users, polled while the page is visible — so "training now", the user table
// and the overview figures always agree with each other.

const ConsoleContext = createContext(null)
export const useConsole = () => useContext(ConsoleContext)

const POLL_MS = 15000

function useUserList(enabled) {
  const [data, setData] = useState(null)     // the last answer that carried a list
  const [error, setError] = useState(null)   // why the last load failed, until one succeeds
  const load = useCallback(() => api('/api/admin/users')
    .then(d => {
      if (!Array.isArray(d?.users)) throw new Error(t('The server answered without a list of users.'))
      setData(d); setError(null)
    })
    .catch(e => setError(e.message || t('Could not load')))
  , [])
  useEffect(() => {
    if (!enabled) return
    load()
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const iv = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick) }
  }, [enabled, load])
  return { data, error, reload: load }
}

function Nav({ sections, onPick }) {
  return <nav className="con-nav-list" aria-label={t('Console')}>
    {AREAS.map(area => {
      const list = sections.filter(s => s.area === area.id)
      if (!list.length) return null
      return <div key={area.id} className="con-nav-group">
        <div className="con-nav-area">{area.label()}</div>
        {list.map(s => <NavLink key={s.id} to={sectionHref(s)} end={!s.path}
          className={({ isActive }) => 'con-nav-link' + (isActive ? ' on' : '')} onClick={onPick}>
          <Icon name={s.icon} /><span>{s.label()}</span>
        </NavLink>)}
      </div>
    })}
  </nav>
}

export default function ConsoleShell() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const isGuest = useStore(s => s.isGuest())
  const nav = useNavigate()
  const loc = useLocation()
  const admin = !!user?.admin && !isGuest
  const users = useUserList(admin)
  const ctx = { admin, config, audit: users.data ? users.data.audit === true : null }
  const sections = visibleSections(ctx)
  const [menu, setMenu] = useState(false)
  const menuBtn = useRef(null)

  // The menu (narrow screens) closes on a pick, on a route change and on Escape.
  useEffect(() => { setMenu(false) }, [loc.pathname])
  useEffect(() => {
    if (!menu) return
    const onKey = e => { if (e.key === 'Escape') { setMenu(false); menuBtn.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])
  useEffect(() => {
    document.body.classList.add('in-console')
    return () => document.body.classList.remove('in-console')
  }, [])

  // Nobody without a section gets in: no request to /api/admin/* has been made by then, the
  // hook above only loads for an admin.
  if (!sections.length) return <Navigate to="/home" replace />

  const current = sectionOf(loc.pathname)
  return <ConsoleContext.Provider value={{ ...ctx, users: users.data?.users || null, meta: users.data, usersError: users.error, reloadUsers: users.reload }}>
    <div className={'con' + (menu ? ' menu-open' : '')}>
      <aside className="con-side" id="con-side">
        <div className="con-brand"><Icon name="dumbbell" /><span>openGym</span></div>
        <Nav sections={sections} onPick={() => setMenu(false)} />
        <button className="con-nav-link con-back" onClick={() => nav('/settings/account')}>
          <Icon name="chevronLeft" /><span>{t('Back to the app')}</span>
        </button>
      </aside>
      {menu && <div className="con-scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
      <div className="con-main">
        <header className="con-top">
          <button ref={menuBtn} className="iconbtn" onClick={() => setMenu(m => !m)}
            aria-label={t('Menu')} aria-expanded={menu} aria-controls="con-side"><Icon name="list" /></button>
          <div className="con-top-t">{current ? current.label() : t('Console')}</div>
        </header>
        <main className="con-body">
          {/* keyed on the route, like the app's: a section that throws is contained and a
              click elsewhere in the navigation clears it */}
          <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  </ConsoleContext.Provider>
}

/** Wraps a section's route: one this user may not see sends them to the overview. */
export function SectionGate({ id, children }) {
  const c = useConsole()
  const s = visibleSections(c).find(x => x.id === id)
  // The activity log's switch is only known once the user list answered: wait rather than
  // bounce a deep link to /console/activity while it is still on its way. If the list failed,
  // the section asks for itself: the log's own answer says whether it is on.
  if (!s && id === 'activity' && c.admin && c.audit === null) return c.usersError ? children : null
  if (!s) return <Navigate to="/console" replace />
  return children
}
