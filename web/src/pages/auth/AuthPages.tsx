import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { PASSWORD_MIN } from '@reno/shared';
import {
  useAcceptInvite,
  useAuthStatus,
  useInviteCheck,
  useLogin,
  useSetup,
} from '../../api/auth.ts';
import { safeReturnPath } from '../../components/AuthGate.tsx';
import { Button, Card, ErrorBox, Spinner, TextField } from '../../components/ui.tsx';
import { useSubmit } from '../../forms/useSubmit.ts';

function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span className="text-lg font-semibold tracking-tight">Renoveringskollen</span>
        </div>
        <Card className="p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </Card>
      </div>
    </main>
  );
}

/** Namn, e-post, lösenord och upprepning – för första start och inbjudan. */
function NewAccountForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit: (v: { name: string; email: string; password: string }) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const { errors, setErrors, formError, submitting, submit } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) return setErrors({ confirm: 'Lösenorden matchar inte' });
        submit(
          () => onSubmit({ name, email, password }),
          () => navigate('/', { replace: true }),
        );
      }}
    >
      <TextField
        label="Ditt namn"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        required
        autoFocus
      />
      <TextField
        label="E-post"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        required
      />
      <TextField
        label="Lösenord"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`Minst ${PASSWORD_MIN} tecken. En mening fungerar bra.`}
        required
        minLength={PASSWORD_MIN}
      />
      <TextField
        label="Upprepa lösenordet"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      {formError && <ErrorBox error={new Error(formError)} />}
      <Button type="submit" loading={submitting} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

export function LoginPage() {
  const status = useAuthStatus();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = safeReturnPath(params.get('till'));
  const { errors, formError, submitting, submit } = useSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (status.isPending) return <Spinner />;
  if (status.data?.setupRequired) return <Navigate to="/forsta-start" replace />;
  if (status.data?.user) return <Navigate to={target} replace />;

  return (
    <AuthCard title="Logga in">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(
            () => login.mutateAsync({ email, password }),
            () => navigate(target, { replace: true }),
          );
        }}
      >
        <TextField
          label="E-post"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
          autoFocus
        />
        <TextField
          label="Lösenord"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
        {formError && <ErrorBox error={new Error(formError)} />}
        <Button type="submit" loading={submitting} className="w-full">
          Logga in
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted">
        Glömt lösenordet? Be den som äger appen om en ny inbjudan.
      </p>
    </AuthCard>
  );
}

export function SetupPage() {
  const status = useAuthStatus();
  const setup = useSetup();

  if (status.isPending) return <Spinner />;
  if (status.data && !status.data.setupRequired) return <Navigate to="/logga-in" replace />;

  return (
    <AuthCard
      title="Välkommen!"
      subtitle="Skapa ditt konto. Du blir ägare och kan sedan bjuda in resten av hushållet."
    >
      <NewAccountForm submitLabel="Skapa konto" onSubmit={(v) => setup.mutateAsync(v)} />
    </AuthCard>
  );
}

export function InvitePage() {
  const token = useParams().token ?? '';
  const status = useAuthStatus();
  const check = useInviteCheck(token);
  const accept = useAcceptInvite();

  if (status.isPending || check.isPending) return <Spinner />;
  if (status.data?.user) {
    return (
      <AuthCard title="Du är redan inloggad" subtitle={`Inloggad som ${status.data.user.name}.`}>
        <Link to="/" className="text-sm text-brand-700 hover:underline">
          Till översikten
        </Link>
      </AuthCard>
    );
  }
  if (!check.data?.valid) {
    return (
      <AuthCard
        title="Inbjudan gäller inte"
        subtitle="Länken har gått ut eller redan använts. Be om en ny inbjudan."
      >
        <Link to="/logga-in" className="text-sm text-brand-700 hover:underline">
          Har du redan ett konto? Logga in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Du är inbjuden"
      subtitle="Skapa ett konto för att se och logga hushållets renoveringar."
    >
      <NewAccountForm
        submitLabel="Skapa konto"
        onSubmit={(v) => accept.mutateAsync({ token, ...v })}
      />
    </AuthCard>
  );
}
