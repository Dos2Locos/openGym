import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'
import { fmtDate } from '../../lib/format.js'
import { fmtSeen } from '../../lib/console-users.js'
import { confirmSheet } from '../../sheets.jsx'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'
import { useConsole } from './ConsoleShell.jsx'
import { PageHeader, Pill, Stat, ErrorState, Loading, EmptyState } from './ui.jsx'

// One account: who it is, how much it holds, and what an admin can do to it. Never what it
// holds: the server answers with counts only (GET /api/admin/user), the training and health
// data are the user's own (docs/dev/PROFESSIONAL_PLATFORM.md, decision 9).

// The one time a reset code is visible. Locked, so a tap beside the sheet cannot lose it before
// it has been copied or written down.
export function ResetCodeSheet({ name, email, code, expires, close }) {
  const toast = useUI(s => s.toast)
  const copy = () => { navigator.clipboard?.writeText(code).catch(() => {}); toast(t('Copied')) }
  return <>
    <h3>{t('Reset code for {0}', name)}</h3>
    <div className="adm-lead">
      {email
        ? t('Give them this code. They choose “Sign in with password” → “Have a reset code from your admin?”, enter their name {0} (or their sign-in e-mail {1}), the code and a new password.', name, email)
        : t('Give them this code. They choose “Sign in with password” → “Have a reset code from your admin?”, enter their name {0}, the code and a new password.', name)}
      {' '}{t('It works once, until {0}, and will not be shown again.', new Date(expires).toLocaleString())}
    </div>
    <button className="adm-code" style={{ fontSize: 22, width: '100%', padding: '14px 0' }} onClick={copy} aria-label={t('Copy code')}>{code}</button>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}

const NUM = n => (Number.isFinite(n) ? n : 0)

export default function UserPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const { reloadUsers } = useConsole()
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)   // { missing } for a 404, else { message }

  const load = () => api('/api/admin/user?id=' + encodeURIComponent(id))
    .then(r => { setD(r); setErr(null) })
    .catch(e => setErr(e.status === 404 ? { missing: true } : { message: e.message }))
  useEffect(() => { setD(null); setErr(null); load() }, [id])

  // Back to the list as it was left: its search, filter and sort came along in the state.
  const from = loc.state?.from
  const toList = () => nav('/console/users' + (from ? '?' + from : ''))
  const back = <button className="iconbtn con-ph-back" onClick={toList} aria-label={t('Back to users')}><Icon name="chevronLeft" /></button>

  if (err?.missing) return <>
    <PageHeader back={back} title={t('User not found')} />
    <EmptyState icon="person" title={t('This user does not exist')}
      action={<Button size="sm" onClick={toList}>{t('Back to users')}</Button>}>
      {t('The account may have been deleted.')}
    </EmptyState>
  </>
  if (!d) return <>
    <PageHeader back={back} title={t('User')} />
    {err ? <ErrorState message={err.message} onRetry={load} /> : <Loading />}
  </>

  const u = d.user
  const counts = d.counts || {}
  const changed = () => { load(); reloadUsers() }

  const setDisabled = disabled => api('/api/admin/user/disable', { method: 'POST', body: JSON.stringify({ id: u.id, disabled }) })
    .then(() => { toast(disabled ? t('Account disabled') : t('Account enabled')); changed() })
    .catch(e => toast(e.message))
  const askDisable = () => confirmSheet({
    title: t('Disable {0}?', u.name),
    message: t('They are signed out everywhere and can no longer sync or sign in until re-enabled. Their data stays.'),
    confirmText: t('Disable'), danger: true, onConfirm: () => setDisabled(true)
  })

  // The one destructive action (issue #107): it asks twice, naming the account both times,
  // because the first sheet can be dismissed by anyone who was not reading. No download is
  // offered: the operator does not get the user's data, the user exports it from Settings.
  const doDelete = () => api('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ id: u.id }) })
    .then(() => { toast(t('Account deleted')); reloadUsers(); toList() })
    .catch(e => toast(e.message))
  const askDelete = () => confirmSheet({
    title: t('Delete {0}?', u.name),
    message: t('Everything goes: their workouts, weigh-ins, routines, passkeys and notifications. This cannot be undone, and the invite code they joined with stays used. If they want to keep their history, ask them to export a backup from Settings first.'),
    confirmText: t('Continue'), danger: true,
    onConfirm: () => confirmSheet({
      title: t('Delete {0} for good?', u.name),
      message: t('Last chance. There’s no undo and no backup of this on the server.'),
      confirmText: t('Delete account'), danger: true, onConfirm: doDelete
    })
  })

  // Password sign-in (#118): the server sends `password` only when the instance offers it. The
  // code comes back once, is shown once, and is never stored anywhere but as a hash.
  const pwInstance = typeof u.password === 'boolean'
  const askReset = () => confirmSheet({
    title: t('Reset {0}’s password?', u.name),
    message: t('You get a one-time code to hand them. Their current password stops working now and they are signed out everywhere; their passkeys keep working. They set a new password with the code under “Sign in with password”. It is shown once and is valid for 24 hours.'),
    confirmText: t('Create reset code'), danger: true,
    onConfirm: () => api('/api/admin/user/password-reset', { method: 'POST', body: JSON.stringify({ id: u.id }) })
      .then(r => { changed(); openSheet(done => <ResetCodeSheet name={r.name} email={u.email} code={r.code} expires={r.expires} close={done} />, { locked: true }) })
      .catch(e => toast(e.message))
  })

  return <>
    <PageHeader back={back} title={<span className="capitalize">{u.name}</span>}
      sub={<span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {u.admin && <Pill tone="acc">{t('admin')}</Pill>}
        {u.disabled && <Pill tone="bad">{t('disabled')}</Pill>}
        {u.resetUntil && <Pill tone="warn">{t('reset code until {0}', new Date(u.resetUntil).toLocaleString())}</Pill>}
      </span>} />

    <div className="con-stats">
      <Stat label={t('Workouts')} value={NUM(counts.workouts)} />
      <Stat label={t('Weigh-ins')} value={NUM(counts.bodyweight)} />
      <Stat label={t('Measurements')} value={NUM(counts.measurements)} />
      <Stat label={t('Routines')} value={NUM(counts.routines)} />
    </div>

    <div className="con-cols">
      <section className="con-panel" aria-labelledby="con-acc-h">
        <h2 id="con-acc-h">{t('Account')}</h2>
        <div className="con-lead">{t('Only the account and how much it holds. Their training and health data stay theirs.')}</div>
        <dl className="con-dl">
          <dt>{t('Joined')}</dt><dd>{u.created ? fmtDate(u.created.slice(0, 10), false, true) : '–'}</dd>
          <dt>{t('Last sync')}</dt><dd>{fmtSeen(d.lastSync)}</dd>
          <dt>{t('Invite code')}</dt><dd>{u.invitedBy ? <span className="adm-code">{u.invitedBy}</span> : '–'}</dd>
          {pwInstance && <>
            <dt>{t('Sign-in e-mail')}</dt><dd>{u.email || '–'}</dd>
            <dt>{t('Password')}</dt><dd>{u.password ? t('Yes') : t('No')}</dd>
          </>}
        </dl>
      </section>

      <section className="con-panel" aria-labelledby="con-act-h">
        <h2 id="con-act-h">{t('Actions')}</h2>
        {u.admin
          ? <div className="con-lead">{t('An admin account cannot be disabled or deleted from here.')}</div>
          : <>
            <div className="con-action">
              <div className="grow">
                <div className="con-action-t">{u.disabled ? t('Enable account') : t('Disable account')}</div>
                <div className="con-action-s">{u.disabled
                  ? t('Lets them sign in and sync again.')
                  : t('Signs them out everywhere and blocks sign-in. Nothing is deleted.')}</div>
              </div>
              {u.disabled
                ? <Button variant="primary" onClick={() => setDisabled(false)}>{t('Enable account')}</Button>
                : <Button variant="danger" onClick={askDisable}>{t('Disable account')}</Button>}
            </div>
            {pwInstance && <div className="con-action">
              <div className="grow">
                <div className="con-action-t">{t('Reset password')}</div>
                <div className="con-action-s">{u.password
                  ? t('For a forgotten password: a one-time code lets them choose a new one. Their current password stops working at once.')
                  : t('No password yet. A one-time code lets them set one. That’s the way back in after losing their only passkey.')}</div>
              </div>
              <Button variant="tinted" onClick={askReset}>{t('Reset password')}</Button>
            </div>}
            <div className="con-action">
              <div className="grow">
                <div className="con-action-t">{t('Delete account')}</div>
                <div className="con-action-s">{t('Removes the account and every trace of its training history from this server.')}</div>
              </div>
              <Button variant="danger" onClick={askDelete}>{t('Delete account')}</Button>
            </div>
          </>}
      </section>
    </div>
  </>
}
