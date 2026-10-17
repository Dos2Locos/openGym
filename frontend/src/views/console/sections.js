import { t } from '../../lib/i18n.js'

// Every section of the console in one list: the navigation, the route guard and the default
// route are all read off it, so they cannot drift apart. A section belongs to an area (the
// group heading in the navigation); `visible(ctx)` decides whether this user, on this instance,
// gets it at all. The professional sections (docs/dev/PROFESSIONAL_PLATFORM.md, B3/B4) plug in
// here with an area of their own.
//
// ctx = { admin, config, audit }: whether the user is an admin, GET /api/config, and whether the
// instance keeps an activity log (null until GET /api/admin/users has answered).
//
// Labels are functions so each t() call is a literal check-source-strings.mjs can see.

export const AREAS = [
  { id: 'admin', label: () => t('Administration') }
]

export const SECTIONS = [
  { id: 'overview', path: '', area: 'admin', icon: 'house', label: () => t('Overview'), visible: ctx => ctx.admin },
  { id: 'users', path: 'users', area: 'admin', icon: 'person', label: () => t('Users'), visible: ctx => ctx.admin },
  { id: 'invites', path: 'invites', area: 'admin', icon: 'key', label: () => t('Invite codes'), visible: ctx => ctx.admin },
  { id: 'equipment', path: 'equipment', area: 'admin', icon: 'dumbbell', label: () => t('Equipment'), visible: ctx => ctx.admin },
  // GET /api/config carries `coach` only when the instance offers the Coach.
  { id: 'coach', path: 'coach', area: 'admin', icon: 'sparkles', label: () => t('AI Coach'), visible: ctx => ctx.admin && !!ctx.config?.coach },
  { id: 'activity', path: 'activity', area: 'admin', icon: 'list', label: () => t('Activity log'), visible: ctx => ctx.admin && ctx.audit === true }
]

export const visibleSections = ctx => SECTIONS.filter(s => s.visible(ctx))

/** Can this user open the console at all? Only if some section is theirs. */
export const hasConsole = ctx => visibleSections(ctx).length > 0

export const sectionHref = s => '/console' + (s.path ? '/' + s.path : '')

/** The section a console path belongs to (a detail page belongs to its list). */
export function sectionOf(pathname) {
  const rest = String(pathname || '').replace(/^\/console\/?/, '')
  const first = rest.split('/')[0]
  return SECTIONS.find(s => s.path === first) || null
}
