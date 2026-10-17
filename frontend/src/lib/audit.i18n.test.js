// @vitest-environment happy-dom
/* The activity log is part of the console, which is translated like the rest of the app (it was
 * English-only while it lived on the old admin page). Every event label, reason and action the
 * server can emit reads in the operator's language: each pack has its own sentence for it, and
 * auditLine follows a language picked after audit.js loaded, which a table translated once at
 * load time would not. setLang sets the page's lang and dir, so this runs with a DOM. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLabel, auditLine, fmtWhen } from './audit.js'
import { setLang } from './i18n.js'

// vitest runs from frontend/; under happy-dom import.meta.url is not a file: URL.
const SERVER = readFileSync(resolve(process.cwd(), '../api/server.js'), 'utf8')
const EVENTS = [...new Set([...SERVER.matchAll(/['"`]((?:auth|admin|media)\.[a-z0-9.-]+)['"`]/g)].map(m => m[1]))]
const PACKS = Object.fromEntries(Object.entries(import.meta.glob('../locales/*.js', { eager: true }))
  .map(([path, mod]) => [path.match(/([^/]+)\.js$/)[1], mod.default]))

afterEach(async () => { await setLang('en') })

describe('the activity log in every language', () => {
  it('every pack has its own sentence for every event the server emits', () => {
    for (const [lang, pack] of Object.entries(PACKS)) {
      for (const ev of EVENTS) {
        const en = auditLabel(ev)
        expect(pack[en], `${lang}: ${ev} (${en})`).toBeTruthy()
      }
    }
  })

  it('follows a language picked after the module loaded', async () => {
    const line = { ev: 'auth.login.fail', ok: false, msg: 'unknown-credential' }
    expect(auditLine(line)).toEqual({ title: 'Sign-in failed', sub: 'unknown caller · unknown passkey' })
    await setLang('es')
    const es = auditLine(line)
    expect(es.title).toBe(PACKS.es['Sign-in failed'])
    expect(es.sub).toBe(PACKS.es['unknown caller'] + ' · ' + PACKS.es['unknown passkey'])
    const now = Date.now()
    const [before, after] = PACKS.es['today {0}'].split('{0}')
    const when = fmtWhen(now - 60000, now)
    expect(when.startsWith(before) && when.endsWith(after)).toBe(true)
  })
})
