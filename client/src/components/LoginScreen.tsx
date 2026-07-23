import { useState, type FormEvent } from 'react'
import { USERS, type UserId } from '../lib/users'
import { loginAccount, registerAccount, type AccountStatus, type Session } from '../lib/session'
import type { Lang } from '../lib/i18n'

type Props = {
  status: AccountStatus
  lang: Lang
  onLogin: (s: Session) => void
}

// Anmelde-Bildschirm für die festen Profile (Vuk/Andrijana) mit Passcode.
// Erscheint nur, wenn der Server Konten aktiv hat (Turso eingerichtet) und
// niemand angemeldet ist. Danach sind Gedächtnis + Statistik geräteübergreifend.
export default function LoginScreen({ status, lang, onLogin }: Props) {
  const ui = lang === 'en' ? 'en' : 'de'
  const [selected, setSelected] = useState<UserId | null>(null)
  const [passcode, setPasscode] = useState('')
  // Einrichtungs-Code (nur beim Registrieren; nötig, wenn der Server ihn verlangt)
  const [setupCode, setSetupCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRegistered = selected ? status.registered.includes(selected) : false
  const canSubmit = !!selected && passcode.trim().length >= 4 && !busy

  const t =
    ui === 'en'
      ? {
          title: 'Who is learning?',
          sub: 'Choose your profile and enter your passcode — your progress then syncs across all devices.',
          set: 'Set a passcode (min. 4 characters)',
          enter: 'Enter passcode',
          setup: 'Setup code (only account owners)',
          setupHint: 'Ask the account owner for the one-time setup code.',
          register: 'Create & sign in',
          login: 'Sign in',
          newHint: 'New here — pick a passcode',
          back: '← Back',
        }
      : {
          title: 'Wer lernt?',
          sub: 'Profil wählen und Passcode eingeben — dein Fortschritt gleicht sich dann auf allen Geräten ab.',
          set: 'Passcode festlegen (min. 4 Zeichen)',
          enter: 'Passcode eingeben',
          setup: 'Einrichtungs-Code (nur Kontoinhaber)',
          setupHint: 'Den einmaligen Einrichtungs-Code kennt nur der Kontoinhaber.',
          register: 'Anlegen & anmelden',
          login: 'Anmelden',
          newHint: 'Neu hier — Passcode wählen',
          back: '← Zurück',
        }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!selected || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const s = isRegistered
        ? await loginAccount(selected, passcode.trim())
        : await registerAccount(selected, passcode.trim(), setupCode.trim() || undefined)
      onLogin(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : ui === 'en' ? 'Sign-in failed.' : 'Anmeldung fehlgeschlagen.')
      setBusy(false)
    }
  }

  function pick(u: UserId) {
    setSelected(u)
    setPasscode('')
    setSetupCode('')
    setError(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 24,
          boxShadow: 'var(--shadow-lg)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div className="mark" style={{ width: 40, height: 40, fontSize: 20 }}>
            ✎
          </div>
          <div style={{ fontFamily: '"Fraunces", serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
            {t.title}
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 20px', lineHeight: 1.5 }}>{t.sub}</p>

        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: '1px solid var(--line)',
                  background: 'var(--card-2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{u.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                  {u.focus[ui]}
                  {status.registered.includes(u.id) ? '' : ` · ${t.newHint}`}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit}>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-soft)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                marginBottom: 12,
              }}
            >
              {t.back}
            </button>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>
              {USERS.find((u) => u.id === selected)?.name}
            </div>
            <label style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 700 }}>
              {isRegistered ? t.enter : t.set}
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              maxLength={64}
              placeholder="••••"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid var(--line)',
                background: 'var(--card-2)',
                color: 'var(--ink)',
                fontSize: 18,
                letterSpacing: 2,
                boxSizing: 'border-box',
              }}
            />
            {!isRegistered && status.registerCodeRequired && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 700 }}>{t.setup}</label>
                <input
                  type="password"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  maxLength={128}
                  placeholder="••••••"
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 14px',
                    borderRadius: 14,
                    border: '1px solid var(--line)',
                    background: 'var(--card-2)',
                    color: 'var(--ink)',
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{t.setupHint}</div>
              </div>
            )}
            {error && <div style={{ color: 'var(--brick)', fontSize: 13, marginTop: 10, fontWeight: 600 }}>{error}</div>}
            <button
              className="btn"
              type="submit"
              disabled={!canSubmit}
              style={{ width: '100%', marginTop: 16, opacity: canSubmit ? 1 : 0.6 }}
            >
              {busy ? '…' : isRegistered ? t.login : t.register}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
