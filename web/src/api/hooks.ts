import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Attachment,
  AttachmentKind,
  BackupInfo,
  BackupResult,
  Contractor,
  Expense,
  ExpenseListItem,
  ExpenseSearch,
  ExpenseSearchResult,
  MaintenanceItem,
  MaintenanceLogEntry,
  Material,
  Measurement,
  Note,
  ProjectBudgets,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  Quote,
  Report,
  SearchResults,
  RoomDetail,
  RoomListItem,
  SaleReport,
  Stats,
  Task,
  TaskListItem,
  Upcoming,
} from '@reno/shared';
import { SEARCH_MIN_LENGTH } from '@reno/shared';
import { api } from './client.ts';

// Frågor
export const useRooms = () =>
  useQuery({ queryKey: ['rooms'], queryFn: () => api.get<RoomListItem[]>('/rooms') });

export const useRoom = (id: number) =>
  useQuery({ queryKey: ['rooms', id], queryFn: () => api.get<RoomDetail>(`/rooms/${id}`) });

export const useProjects = (filters: { status?: ProjectStatus; roomId?: number } = {}) =>
  useQuery({
    queryKey: ['projects', filters],
    queryFn: () => {
      const q = new URLSearchParams();
      if (filters.status) q.set('status', filters.status);
      if (filters.roomId) q.set('roomId', String(filters.roomId));
      const qs = q.toString();
      return api.get<ProjectSummary[]>(`/projects${qs ? `?${qs}` : ''}`);
    },
  });

export const useProject = (id: number) =>
  useQuery({
    queryKey: ['projects', 'detail', id],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
  });

export const useExpenses = (projectId: number) =>
  useQuery({
    queryKey: ['expenses', projectId],
    queryFn: () => api.get<ExpenseListItem[]>(`/projects/${projectId}/expenses`),
  });

export const useTasks = (projectId: number) =>
  useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get<TaskListItem[]>(`/projects/${projectId}/tasks`),
  });

export const useMaterials = (roomId: number) =>
  useQuery({
    queryKey: ['materials', roomId],
    queryFn: () => api.get<Material[]>(`/rooms/${roomId}/materials`),
  });

type Owner = { projectId?: number; roomId?: number; expenseId?: number; quoteId?: number };
const ownerQuery = (o: Owner) =>
  new URLSearchParams(
    Object.entries(o)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

export const useNotes = (owner: { projectId?: number; roomId?: number }) =>
  useQuery({
    queryKey: ['notes', owner],
    queryFn: () => api.get<Note[]>(`/notes?${ownerQuery(owner)}`),
  });

export const useAttachments = (owner: Owner, enabled = true) =>
  useQuery({
    queryKey: ['attachments', owner],
    queryFn: () => api.get<Attachment[]>(`/attachments?${ownerQuery(owner)}`),
    enabled,
  });

/** Kvitton som är fotade men ännu inte kopplade till någon utgift. */
export const useReceiptInbox = () =>
  useQuery({
    queryKey: ['attachments', 'inbox'],
    queryFn: () => api.get<Attachment[]>('/attachments?inbox=1'),
  });

/** Filter → querystring; tomma värden utelämnas. */
export function searchQuery(f: ExpenseSearch): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== '' && v !== null) q.set(k, String(v));
  return q.toString();
}

export const useExpenseSearch = (filters: ExpenseSearch) =>
  useQuery({
    queryKey: ['expenses', 'search', filters],
    queryFn: () => api.get<ExpenseSearchResult>(`/expenses?${searchQuery(filters)}`),
    placeholderData: (prev) => prev,
  });

export const useStats = (year?: number) =>
  useQuery({
    queryKey: ['stats', year ?? 'alla'],
    queryFn: () => api.get<Stats>(`/stats${year ? `?year=${year}` : ''}`),
    placeholderData: (prev) => prev,
  });

export const useReport = () =>
  useQuery({ queryKey: ['report'], queryFn: () => api.get<Report>('/report') });

export const useSaleReport = () =>
  useQuery({ queryKey: ['sale-report'], queryFn: () => api.get<SaleReport>('/sale-report') });

export const useUpcoming = () =>
  useQuery({ queryKey: ['upcoming'], queryFn: () => api.get<Upcoming>('/upcoming') });

// Underhållsplan
export const useMaintenance = () =>
  useQuery({
    queryKey: ['maintenance'],
    queryFn: () => api.get<MaintenanceItem[]>('/maintenance'),
  });

export const useMaintenanceHistory = (id: number, enabled: boolean) =>
  useQuery({
    queryKey: ['maintenance', id, 'history'],
    queryFn: () => api.get<MaintenanceLogEntry[]>(`/maintenance/${id}/history`),
    enabled,
  });

export const useSaveMaintenance = () =>
  useApiMutation(({ id, ...body }: { id?: number } & Record<string, unknown>) =>
    id
      ? api.patch<MaintenanceItem>(`/maintenance/${id}`, body)
      : api.post<MaintenanceItem>('/maintenance', body),
  );
export const useMarkMaintenanceDone = () =>
  useApiMutation(({ id, ...body }: { id: number; doneOn?: string; note?: string | null }) =>
    api.post<MaintenanceItem>(`/maintenance/${id}/done`, body),
  );

// Global sökning (kräver minst SEARCH_MIN_LENGTH tecken)
export const useGlobalSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= SEARCH_MIN_LENGTH,
    placeholderData: (previous) => previous,
  });

// Säkerhetskopior (bara ägaren)
export const useBackups = () =>
  useQuery({ queryKey: ['backups'], queryFn: () => api.get<BackupInfo[]>('/backups') });
export const useCreateBackup = () => useApiMutation(() => api.post<BackupResult>('/backups'));

// Offerter
export const useQuotes = (projectId: number) =>
  useQuery({
    queryKey: ['quotes', projectId],
    queryFn: () => api.get<Quote[]>(`/projects/${projectId}/quotes`),
  });

export const useSaveQuote = () =>
  useApiMutation(
    ({ id, projectId, ...body }: { id?: number; projectId: number } & Record<string, unknown>) =>
      id
        ? api.patch<Quote>(`/quotes/${id}`, body)
        : api.post<Quote>(`/projects/${projectId}/quotes`, body),
  );
export const useChooseQuote = () =>
  useApiMutation((id: number) => api.post<Quote>(`/quotes/${id}/choose`));
export const useUnchooseQuote = () =>
  useApiMutation((id: number) => api.post<Quote>(`/quotes/${id}/unchoose`));

export const useProjectBudgets = (projectId: number) =>
  useQuery({
    queryKey: ['budgets', projectId],
    queryFn: () => api.get<ProjectBudgets>(`/projects/${projectId}/budgets`),
  });

export const useContractors = () =>
  useQuery({ queryKey: ['contractors'], queryFn: () => api.get<Contractor[]>('/contractors') });

// Ändringar. Datamängden är liten, så efter en ändring laddas allt om –
// enkelt och utan risk för inaktuella summor på andra sidor.
function useApiMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useSaveRoom = () =>
  useApiMutation(({ id, ...body }: { id?: number } & Record<string, unknown>) =>
    id ? api.patch<RoomDetail>(`/rooms/${id}`, body) : api.post<RoomDetail>('/rooms', body),
  );
export const useDeleteRoom = () => useApiMutation((id: number) => api.delete(`/rooms/${id}`));

export const useSaveMeasurement = () =>
  useApiMutation(
    ({ id, roomId, ...body }: { id?: number; roomId: number } & Record<string, unknown>) =>
      id
        ? api.patch<Measurement>(`/measurements/${id}`, body)
        : api.post<Measurement>(`/rooms/${roomId}/measurements`, body),
  );

export const useSaveMaterial = () =>
  useApiMutation(
    ({ id, roomId, ...body }: { id?: number; roomId: number } & Record<string, unknown>) =>
      id
        ? api.patch<Material>(`/materials/${id}`, body)
        : api.post<Material>(`/rooms/${roomId}/materials`, body),
  );

export const useSaveProject = () =>
  useApiMutation(({ id, ...body }: { id?: number } & Record<string, unknown>) =>
    id
      ? api.patch<ProjectDetail>(`/projects/${id}`, body)
      : api.post<ProjectDetail>('/projects', body),
  );
export const useDeleteProject = () => useApiMutation((id: number) => api.delete(`/projects/${id}`));

/** Ersätter hela kategorifördelningen; belopp i öre, kategori utan värde = ingen budget. */
export const useSaveProjectBudgets = () =>
  useApiMutation(({ projectId, budgets }: { projectId: number; budgets: Record<string, number> }) =>
    api.put<ProjectBudgets>(`/projects/${projectId}/budgets`, { budgets }),
  );

export const useSaveExpense = () =>
  useApiMutation(
    ({ id, projectId, ...body }: { id?: number; projectId: number } & Record<string, unknown>) =>
      id
        ? api.patch<Expense>(`/expenses/${id}`, body)
        : api.post<Expense>(`/projects/${projectId}/expenses`, body),
  );

export const useSaveTask = () =>
  useApiMutation(
    ({ id, projectId, ...body }: { id?: number; projectId: number } & Record<string, unknown>) =>
      id
        ? api.patch<Task>(`/tasks/${id}`, body)
        : api.post<Task>(`/projects/${projectId}/tasks`, body),
  );

export const useSaveNote = () =>
  useApiMutation(({ id, ...body }: { id?: number } & Record<string, unknown>) =>
    id
      ? api.patch<Note>(`/notes/${id}`, { content: body.content })
      : api.post<Note>('/notes', body),
  );

export const useSaveContractor = () =>
  useApiMutation(({ id, ...body }: { id?: number } & Record<string, unknown>) =>
    id
      ? api.patch<Contractor>(`/contractors/${id}`, body)
      : api.post<Contractor>('/contractors', body),
  );

export const useUploadAttachment = () =>
  useApiMutation(({ file, kind, ...owner }: Owner & { file: File; kind: AttachmentKind }) => {
    const form = new FormData();
    form.set('kind', kind);
    for (const [k, v] of Object.entries(owner)) if (v != null) form.set(k, String(v));
    form.set('file', file);
    return api.post<Attachment>('/attachments', form);
  });
export const useUpdateAttachment = () =>
  useApiMutation(
    ({
      id,
      ...body
    }: {
      id: number;
      caption?: string | null;
      kind?: AttachmentKind;
      expenseId?: number;
    }) => api.patch<Attachment>(`/attachments/${id}`, body),
  );
