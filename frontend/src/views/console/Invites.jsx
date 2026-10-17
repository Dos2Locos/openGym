import { useEffect, useState } from 'react'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'
import { confirmSheet } from '../../sheets.jsx'
import Icon from '../../components/Icon.jsx'
import { Button } from '../../components/ui.jsx'
import { PageHeader, ErrorState, Loading, EmptyState } from './ui.jsx'

// Invite codes: one use each. On an invite-only instance they are the way in; on an open one
// they only record who invited whom.
export default function Invites() {
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)        // { invites, invite_only }
  const [err, setErr] = useState(null)
  const load = () => api('/api/admin/invites').then(r => { setD(r); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const copy = code => { navigator.clipboard?.writeText(code).catch(() => {}); toast(t('Copied {0}', code)) }
  const create = () => api('/api/admin/invites/new', { method: 'POST', body: '{}' })
    .then(({ invite }) => { navigator.clipboard?.writeText(invite.code).catch(() => {}); toast(t('Code {0} created and copied', invite.code)); load() })
    .catch(e => toast(e.message))
  const revoke = code => confirmSheet({
    title: t('Revoke code {0}?', code),
    message: t('Anyone who has it can no longer use it. People who already signed up with it are not affected.'),
    confirmText: t('Revoke'), danger: true,
    onConfirm: () => api('/api/admin/invites/revoke', { method: 'POST', body: JSON.stringify({ code }) })
      .then(() => { toast(t('Code revoked')); load() }).catch(e => toast(e.message))
  })

  const invites = d?.invites || []
  const open = invites.filter(i => !i.usedBy)
  const used = invites.filter(i => i.usedBy)

  return <>
    <PageHeader title={t('Invite codes')}
      sub={d ? (d.invite_only
        ? t('Sign-up is invite-only: someone needs one of these codes to create a profile. Each code works once.')
        : t('Sign-up is open, so codes are optional here. They only record who invited whom.')) : null}
      actions={<Button variant="primary" size="sm" icon="plus" onClick={create}>{t('New code')}</Button>} />
    {err && <ErrorState message={err} onRetry={load} stale={!!d} />}
    {!d && !err && <Loading />}
    {d && !invites.length && <EmptyState icon="key" title={t('No codes yet')}>
      {t('“New code” makes one and copies it to your clipboard.')}
    </EmptyState>}
    {open.length > 0 && <section className="con-panel" aria-labelledby="con-inv-open">
      <h2 id="con-inv-open">{t('Unused')}</h2>
      <div className="con-lead">{t('Tap a code to copy it.')}</div>
      {open.map(i => <div key={i.code} className="con-row">
        <div className="grow">
          <button className="adm-code" onClick={() => copy(i.code)} aria-label={t('Copy {0}', i.code)}>{i.code}</button>
          {i.note && <div className="con-row-s">{i.note}</div>}
        </div>
        <button className="iconbtn adm-iconbtn" onClick={() => copy(i.code)} aria-label={t('Copy {0}', i.code)}><Icon name="copy" /></button>
        <button className="iconbtn adm-iconbtn" style={{ color: 'var(--red)' }} onClick={() => revoke(i.code)} aria-label={t('Revoke {0}', i.code)}><Icon name="trash" /></button>
      </div>)}
    </section>}
    {used.length > 0 && <section className="con-panel" aria-labelledby="con-inv-used">
      <h2 id="con-inv-used">{t('Used')}</h2>
      <div className="con-lead">{t('A used code cannot be revoked: whoever signed up with it keeps their account.')}</div>
      {used.map(i => <div key={i.code} className="con-row">
        <span className="adm-code dim grow" style={{ flex: 'none' }}>{i.code}</span>
        <span className="grow con-row-s" style={{ marginTop: 0, textAlign: 'end' }}>{i.usedByName ? t('Used by {0}', i.usedByName) : t('Used')}</span>
      </div>)}
    </section>}
  </>
}
