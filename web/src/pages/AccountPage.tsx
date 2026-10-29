import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Copy, Download, LogOut, Trash2, UserPlus } from 'lucide-react';
import { PASSWORD_MIN, USER_ROLE_LABELS, type CreatedInvite, type Invite } from '@reno/shared';
import {
  useChangePassword,
  useCreateInvite,
  useCurrentUser,
  useDeleteInvite,
  useDeleteUser,
  useInvites,
  useLogout,
  useUsers,
} from '../api/auth.ts';
import { useBackups, useCreateBackup } from '../api/hooks.ts';
import { Button, Card, ErrorBox, PageHeader, QueryState, TextField } from '../components/ui.tsx';
import { useSubmit } from '../forms/useSubmit.ts';
import { formatBytes, formatDate, formatDateTime } from '../lib/format.ts';
import { THEME_LABELS, useThemePreference, type ThemePreference } from '../lib/theme.ts';

function ChangePassword() {
  const change = useChangePassword();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        if (newPassword !== confirm) return setErrors({ confirm: 'Lösenorden matchar inte' });
        submit(
          () => change.mutateAsync({ currentPassword, newPassword }),
          () => {
            setCurrent('');
            setNew('');
            setConfirm('');
            setDone(true);
          },
        );
      }}
    >
      <TextField
        label="Nuvarande lösenord"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.currentPassword}
        required
      />
      <TextField
        label="Nytt lösenord"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNew(e.target.value)}
        error={errors.newPassword}
        hint={`Minst ${PASSWORD_MIN} tecken.`}
        required
        minLength={PASSWORD_MIN}
      />
      <TextField
        label="Upprepa nytt lösenord"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      {formError && <ErrorBox error={new Error(formError)} />}
      {done && (
        <p role="status" className="flex items-center gap-1 text-sm text-brand-700">
          <Check className="size-4" aria-hidden /> Lösenordet är bytt. Andra enheter har loggats ut.
        </p>
      )}
      <Button type="submit" variant="secondary" loading={submitting}>
        Byt lösenord
      </Button>
    </form>
  );
}

function inviteState(i: Invite) {
  if (i.usedAt) return `Använd av ${i.usedByName ?? 'borttagen användare'} ${formatDate(i.usedAt)}`;
  if (i.expiresAt < new Date().toISOString()) return 'Har gått ut';
  return `Gäller till ${formatDate(i.expiresAt)}`;
}

function NewInviteLink({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/inbjudan/${invite.token}`;
  return (
    <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50 p-3">
      <p className="text-sm font-medium text-brand-700">
        Inbjudan skapad. Skicka länken till personen – den visas bara nu och gäller i 7 dagar.
      </p>
      <div className="flex gap-2">
        <label htmlFor="invite-link" className="sr-only">
          Inbjudningslänk
        </label>
        <input
          id="invite-link"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-xs"
        />
        <Button
          size="sm"
          className="h-9"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? 'Kopierad' : 'Kopiera'}
        </Button>
      </div>
    </div>
  );
}

function Household() {
  const me = useCurrentUser();
  const users = useUsers();
  const invites = useInvites();
  const create = useCreateInvite();
  const removeInvite = useDeleteInvite();
  const removeUser = useDeleteUser();
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<CreatedInvite>();

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted">Medlemmar</h3>
        <QueryState query={users}>
          {(list) => (
            <ul className="divide-y divide-line">
              {list.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {u.name}{' '}
                      {u.id === me.id && <span className="font-normal text-muted">(du)</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {u.email} · {USER_ROLE_LABELS[u.role]}
                    </p>
                  </div>
                  {u.role !== 'owner' && (
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={`Ta bort ${u.name}`}
                      onClick={() =>
                        confirm(
                          `Ta bort ${u.name}? Personen loggas ut direkt. Datan finns kvar.`,
                        ) && removeUser.mutate(u.id)
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted">Bjud in</h3>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { note: note.trim() || null },
              {
                onSuccess: (inv) => {
                  setCreated(inv);
                  setNote('');
                },
              },
            );
          }}
        >
          <label htmlFor="invite-note" className="sr-only">
            Anteckning
          </label>
          <input
            id="invite-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Vem är den till? (valfritt)"
            className="h-10 min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
          />
          <Button type="submit" loading={create.isPending}>
            <UserPlus className="size-4" aria-hidden /> Skapa inbjudan
          </Button>
        </form>
        {create.error && <ErrorBox error={create.error} />}
        {created && <NewInviteLink invite={created} />}

        <QueryState query={invites}>
          {(list) =>
            list.length > 0 && (
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{i.note ?? 'Inbjudan'}</p>
                      <p className="text-xs text-muted">
                        Skapad {formatDate(i.createdAt)} · {inviteState(i)}
                      </p>
                    </div>
                    {!i.usedAt && (
                      <Button variant="ghost" size="sm" onClick={() => removeInvite.mutate(i.id)}>
                        Återkalla
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
    </div>
  );
}

/** Ljust, mörkt eller enhetens val. Gäller bara den här webbläsaren. */
function Appearance() {
  const [pref, setPref] = useThemePreference();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Utseende">
        {(['auto', 'light', 'dark'] as ThemePreference[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => setPref(p)}
            className={`rounded-full border px-4 py-1.5 text-sm pointer-coarse:py-2.5 ${
              pref === p
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-line text-muted hover:text-ink'
            }`}
          >
            {THEME_LABELS[p]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Gäller bara den här webbläsaren.</p>
    </div>
  );
}

function Backups() {
  const backups = useBackups();
  const create = useCreateBackup();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        En kopia innehåller databasen och alla bilder och kvitton. Kopiorna sparas i mappen{' '}
        <code>backups/</code> på datorn som kör appen, så ladda ner en och spara den på en extern
        disk eller i molnet – annars försvinner de om datorn gör det. De 10 senaste sparas.
      </p>
      <Button loading={create.isPending} onClick={() => create.mutate()}>
        Säkerhetskopiera nu
      </Button>
      {create.isSuccess && !create.isPending && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-brand-700">
          <Check className="size-4" aria-hidden />
          Kopia skapad ({formatBytes(create.data.sizeBytes)}, {create.data.files} filer).
        </p>
      )}
      {create.error && <ErrorBox error={create.error} />}
      <QueryState query={backups}>
        {(list) =>
          list.length === 0 ? (
            <p className="text-sm text-muted">Inga kopior ännu.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {list.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    <span className="font-medium">{formatDateTime(b.createdAt)}</span>
                    <span className="text-muted"> · {formatBytes(b.sizeBytes)}</span>
                  </span>
                  <a
                    href={`/api/backups/${b.name}/download`}
                    download
                    aria-label={`Ladda ner kopian från ${formatDateTime(b.createdAt)}`}
                    className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    <Download className="size-4" aria-hidden /> Ladda ner
                  </a>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </div>
  );
}

export function AccountPage() {
  const me = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Konto"
        subtitle={`${me.name} · ${me.email} · ${USER_ROLE_LABELS[me.role]}`}
        actions={
          <Button
            variant="secondary"
            loading={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate('/logga-in', { replace: true }),
              })
            }
          >
            <LogOut className="size-4" aria-hidden /> Logga ut
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Byt lösenord</h2>
          <ChangePassword />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Utseende</h2>
          <Appearance />
        </Card>
        {me.role === 'owner' && (
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Hushållet</h2>
            <Household />
          </Card>
        )}
        {me.role === 'owner' && (
          <Card className="p-4 lg:col-span-2">
            <h2 className="mb-3 font-semibold">Säkerhetskopia</h2>
            <Backups />
          </Card>
        )}
      </div>
    </>
  );
}
