import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { t, tn } from '../../lib/i18n.js'
import { auditCat, auditLine, fmtWhen } from '../../lib/audit.js'
import { confirmSheet } from '../../sheets.jsx'
import { Button } from '../../components/ui.jsx'
import { PageHeader, ErrorState, Loading, EmptyState, Pill } from './ui.jsx'

// Who signed in, who tried and failed, what an admin changed. Paging follows Library.jsx's
// house style — "Show more", not page numbers.

const CATS = [['', () => t('All')], ['auth', () => t('Sign-ins')], ['admin', () => t('Admin')], ['fail', () => t('Failed')]]

export default function Activity() {
  const toast = useUI(s => s.toast)
  const [meta, setMeta] = useState(null)      // last response minus the rows: total, retention, …
  const [rows, setRows] = useState([])
  const [cat, setCat] = useState('')
  const [err, setErr] = useState(null)

  const load = (c, before) => api('/api/admin/audit?limit=50&cat=' + c + (before ? '&before=' + before : ''))
    .then(r => { setMeta(r); setErr(null); setRows(x => (before ? x.concat(r.events) : r.events)) })
    .catch(e => setErr(e.message))
  const pick = c => { setCat(c); setRows([]); setMeta(null); load(c) }
  useEffect(() => { load('') }, [])

  const clear = () => confirmSheet({
    title: t('Clear the activity log?'),
    message: t('Every recorded event is deleted. The clear itself is logged, so the gap stays visible.'),
    confirmText: t('Clear'), danger: true,
    onConfirm: () => api('/api/admin/audit/clear', { method: 'POST', body: '{}' })
      .then(() => { toast(t('Activity log cleared')); pick(cat) }).catch(e => toast(e.message))
  })

  // AUDIT_LOG=0: the section is not offered, and a deep link here goes back to the overview.
  if (meta && !meta.enabled) return <Navigate to="/console" replace />

  const facts = meta ? [
    tn('{0} event', '{0} events', meta.total),
    ...(meta.retention?.days ? [tn('kept for {0} day', 'kept for {0} days', meta.retention.days)] : []),
    ...(meta.ip_mode === 'off' ? [t('without IP addresses')] : [])
  ].join(' · ') : null

  return <>
    <PageHeader title={t('Activity log')}
      sub={<>{t('Who signed in, what failed, and what an admin changed.')}{facts ? ' ' + facts + '.' : ''}</>}
      actions={<>
        <Button size="sm" icon="reset" onClick={() => pick(cat)}>{t('Refresh')}</Button>
        <Button size="sm" variant="danger" icon="trash" onClick={clear}>{t('Clear')}</Button>
      </>} />
    <div className="con-toolbar">
      <div className="chips" role="group" aria-label={t('Filter')}>
        {CATS.map(([v, l]) => <button key={v} className={'chip' + (cat === v ? ' on' : '')} aria-pressed={cat === v}
          onClick={() => pick(v)}>{l()}</button>)}
      </div>
    </div>
    {err && <ErrorState message={err} onRetry={() => load(cat)} stale={rows.length > 0} />}
    {!meta && !err && <Loading />}
    {meta && !rows.length && <EmptyState icon="list">{t('Nothing logged yet.')}</EmptyState>}
    {rows.length > 0 && <section className="con-panel">
      {rows.map(e => {
        const line = auditLine(e)
        return <div key={e.id} className="con-row">
          <div className="grow">
            <div className="con-row-t">{line.title}
              {/* a red pill, not a red row: twenty fumbled Face IDs in a row shouldn't read as an incident */}
              {!e.ok && <> <Pill tone="bad">{t('failed')}</Pill></>}
              {auditCat(e.ev) === 'admin' && <> <Pill tone="acc">{t('admin')}</Pill></>}</div>
            {line.sub && <div className="con-row-s">{line.sub}</div>}
          </div>
          <span className="con-row-s" style={{ flex: 'none', marginTop: 0 }}>{fmtWhen(e.ts, meta?.now)}</span>
        </div>
      })}
    </section>}
    {meta?.nextBefore && <Button size="sm" onClick={() => load(cat, meta.nextBefore)}>{t('Show more')}</Button>}
  </>
}
