import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthStatus, CreatedInvite, Invite, User } from '@reno/shared';
import { api } from './client.ts';

export const AUTH_KEY = ['auth', 'status'] as const;

export const useAuthStatus = () =>
  useQuery({
    queryKey: AUTH_KEY,
    queryFn: () => api.get<AuthStatus>('/auth/status'),
    staleTime: 60_000,
  });

/**
 * Den inloggade användaren. Används bara bakom AuthGate.
 * Vid utloggning kan komponenter rendera om på egen hand en kort stund innan AuthGate hunnit
 * skicka vidare till inloggningen – då returneras senast kända användare i stället för null.
 */
export function useCurrentUser(): User {
  const user = useAuthStatus().data?.user ?? null;
  const [last, setLast] = useState(user);
  // Härlett tillstånd: uppdatera direkt under renderingen när en ny användare finns.
  if (user && user !== last) setLast(user);
  return (user ?? last)!;
}

/** Efter inloggning: börja om med tom cache och den nya användaren. */
function useSignedIn() {
  const qc = useQueryClient();
  return (user: User) => {
    qc.clear();
    qc.setQueryData<AuthStatus>(AUTH_KEY, { setupRequired: false, user });
  };
}

export const useLogin = () => {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<User>('/auth/login', body),
    onSuccess: signedIn,
  });
};

export const useSetup = () => {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { name: string; email: string; password: string }) =>
      api.post<User>('/auth/setup', body),
    onSuccess: signedIn,
  });
};

export const useAcceptInvite = () => {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (body: { token: string; name: string; email: string; password: string }) =>
      api.post<User>('/auth/accept-invite', body),
    onSuccess: signedIn,
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    // Rensa all hushållsdata ur minnet, så att nästa person vid datorn inte ser den.
    onSettled: () => {
      qc.clear();
      qc.setQueryData<AuthStatus>(AUTH_KEY, { setupRequired: false, user: null });
    },
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<void>('/auth/password', body),
  });

export const useInviteCheck = (token: string) =>
  useQuery({
    queryKey: ['auth', 'invite', token],
    queryFn: () => api.get<{ valid: boolean }>(`/auth/invites/${encodeURIComponent(token)}`),
  });

// Bara för ägaren
export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });
export const useInvites = () =>
  useQuery({ queryKey: ['invites'], queryFn: () => api.get<Invite[]>('/invites') });

function useOwnerMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['users'] }),
        qc.invalidateQueries({ queryKey: ['invites'] }),
      ]),
  });
}
export const useCreateInvite = () =>
  useOwnerMutation((body: { note: string | null }) => api.post<CreatedInvite>('/invites', body));
export const useDeleteInvite = () => useOwnerMutation((id: number) => api.delete(`/invites/${id}`));
export const useDeleteUser = () => useOwnerMutation((id: number) => api.delete(`/users/${id}`));
