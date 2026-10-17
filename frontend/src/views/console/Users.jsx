import { useNavigate, useSearchParams } from 'react-router-dom'
import { t } from '../../lib/i18n.js'
import { fmtDate } from '../../lib/format.js'
import { FILTERS, fmtSeen, parseSort, viewUsers } from '../../lib/console-users.js'
import Icon from '../../components/Icon.jsx'
import { SearchField, Button } from '../../components/ui.jsx'
import { useConsole } from './ConsoleShell.jsx'
import { PageHeader, DataTable, ErrorState, Loading, EmptyState, Pill } from './ui.jsx'

// Everyone with a profile on the instance. Search, filter and sort live in the URL
// (?q=&f=&s=), so going back from a user's page, a reload or a shared link keeps them.

const FILTER_LABEL = {
  all: () => t('All'),
  active: () => t('Active 7 days'),
  inactive: () => t('Inactive'),
  disabled: () => t('Disabled'),
  admins: () => t('Admins')
}

export default function Users() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { users, usersError, reloadUsers, meta } = useConsole()
  const q = params.get('q') || ''
  const f = FILTERS.includes(params.get('f')) ? params.get('f') : 'all'
  const s = params.get('s') || '-lastSync'
  // Typing replaces the history entry; a filter or a sort is a step back can undo.
  const set = (k, v, replace = false) => setParams(p => {
    const n = new URLSearchParams(p)
    if (v && !(k === 'f' && v === 'all') && !(k === 's' && v === '-lastSync')) n.set(k, v); else n.delete(k)
    return n
  }, { replace })

  const pw = !!meta?.password_login
  const rows = users ? viewUsers(users, { q, f, s }) : []
  const open = u => nav('/console/users/' + encodeURIComponent(u.id), { state: { from: params.toString() } })

  const columns = [
    {
      key: 'name', label: t('Name'), sort: true, primary: true,
      render: u => <>
        <div className="con-cell-t">
          {u.live && <span className="con-live" title={t('Training now')} />}
          <span>{u.name}</span>
          {u.admin && <Pill tone="acc">{t('admin')}</Pill>}
          {u.disabled && <Pill tone="bad">{t('disabled')}</Pill>}
        </div>
        {u.live && <div className="con-cell-s">{t('Training now · {0}', u.live.name)}</div>}
        {u.email && <div className="con-cell-s">{u.email}</div>}
      </>
    },
    { key: 'workouts', label: t('Workouts'), sort: true, align: 'end', render: u => u.workouts },
    { key: 'lastWorkout', label: t('Last workout'), sort: true, narrow: false, render: u => (u.lastWorkout ? fmtDate(u.lastWorkout, false, true) : '–') },
    { key: 'lastSync', label: t('Last sync'), sort: true, render: u => fmtSeen(u.lastSync) },
    ...(pw ? [{ key: 'password', label: t('Password'), narrow: false, render: u => (u.password ? t('Yes') : t('No')) }] : []),
    {
      key: 'push', label: t('Notifications'), narrow: false,
      render: u => (u.hasPush ? <Icon name="bell" role="img" aria-label={t('Push notifications on')} /> : <span className="dim">–</span>)
    }
  ]
  const { key: sortKey, desc } = parseSort(s)

  return <>
    <PageHeader title={t('Users')}
      sub={t('Everyone with a profile on this instance. Open one to see the account and its actions.')} />
    {usersError && <ErrorState message={usersError} onRetry={reloadUsers} stale={!!users} />}
    <div className="con-toolbar">
      <SearchField value={q} placeholder={t('Search by name or e-mail')} aria-label={t('Search users')}
        onChange={e => set('q', e.target.value, true)} onClear={() => set('q', '', true)} />
      <div className="chips" role="group" aria-label={t('Filter')}>
        {FILTERS.map(id => <button key={id} className={'chip' + (f === id ? ' on' : '')} aria-pressed={f === id}
          onClick={() => set('f', id)}>{FILTER_LABEL[id]()}</button>)}
      </div>
      {/* the column headers sort on a wide screen; a narrow one has no headers */}
      <select className="con-select con-narrow-only" aria-label={t('Sort by')} value={(desc ? '-' : '') + sortKey}
        onChange={e => set('s', e.target.value)}>
        <option value="-lastSync">{t('Last sync, newest first')}</option>
        <option value="-lastWorkout">{t('Last workout, newest first')}</option>
        <option value="-workouts">{t('Most workouts')}</option>
        <option value="name">{t('Name, A to Z')}</option>
      </select>
    </div>
    {!users && !usersError && <Loading />}
    {users && <>
      <div className="con-count">{t('{0} of {1} users', rows.length, users.length)}</div>
      {rows.length
        ? <div className="con-tablewrap">
            <DataTable columns={columns} rows={rows} rowKey={u => u.id} onRowClick={open}
              rowLabel={u => t('Open {0}', u.name)} rowClass={u => (u.disabled ? 'off' : '')}
              sort={s} onSort={v => set('s', v)} />
          </div>
        : <EmptyState icon="magnifier" title={t('No users match')}
            action={(q || f !== 'all') && <Button size="sm" onClick={() => setParams({}, { replace: true })}>{t('Clear search and filters')}</Button>}>
            {t('Try another name, or another filter.')}
          </EmptyState>}
    </>}
  </>
}
