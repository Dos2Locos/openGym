import { useNavigate } from 'react-router-dom'
import { t } from '../../lib/i18n.js'
import { fmtDur } from '../../lib/format.js'
import { isActive } from '../../lib/console-users.js'
import { useConsole } from './ConsoleShell.jsx'
import { PageHeader, Stat, ErrorState, Loading, EmptyState, Pill } from './ui.jsx'

// The instance at a glance: how many people, who is training right now. The figures and the
// list come from the shell's user list, which polls, so a session that starts shows up here
// within one poll without a reload.
export default function Overview() {
  const nav = useNavigate()
  const { users, usersError, reloadUsers, meta } = useConsole()
  const now = Date.now()
  const list = users || []
  const live = list.filter(u => u.live)
  const active = list.filter(u => isActive(u, now)).length
  const disabled = list.filter(u => u.disabled).length

  return <>
    <PageHeader title={t('Overview')}
      sub={users ? t('{0} users · {1} active this week', list.length, active) : null} />
    {usersError && <ErrorState message={usersError} onRetry={reloadUsers} stale={!!users} />}
    {!users && !usersError && <Loading />}
    {users && <>
      <div className="con-stats">
        <Stat label={t('Users')} value={list.length} />
        <Stat label={t('Training now')} value={live.length} tone={live.length ? 'acc' : ''} />
        <Stat label={t('Active 7 days')} value={active} />
        <Stat label={t('Disabled')} value={disabled} />
      </div>
      <section className="con-panel" aria-labelledby="con-live-h">
        <div className="con-panel-h"><h2 id="con-live-h">{t('Training now')}</h2>
          {meta?.invite_only && <Pill>{t('Invite-only sign-up')}</Pill>}</div>
        <div className="con-lead">{t('Sessions running at this moment. Open one to see the account.')}</div>
        {live.length
          ? live.map(u => <button key={u.id} className="con-row" onClick={() => nav('/console/users/' + encodeURIComponent(u.id))}>
              <span className="con-live" aria-hidden="true" />
              <div className="grow">
                <div className="con-row-t">{u.name}</div>
                <div className="con-row-s">{t('{0} · exercise {1} of {2} · {3}/{4} sets', u.live.name, u.live.exIdx, u.live.exTotal, u.live.setsDone, u.live.setsTotal)}</div>
              </div>
              <Pill tone="acc">{fmtDur(now - u.live.startedAt)}</Pill>
            </button>)
          : <EmptyState icon="dumbbell">{t('Nobody is training right now.')}</EmptyState>}
      </section>
    </>}
  </>
}
