import { z } from 'zod';
import {
  ATTACHMENT_KINDS,
  EXPENSE_CATEGORIES,
  MATERIAL_SURFACES,
  MATERIAL_TYPES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  SEARCH_MIN_LENGTH,
  TASK_PRIORITIES,
} from './constants.ts';

// Valideringsscheman för API:t. Delas med webben så att formulären följer samma regler.

// Zods inbyggda felmeddelanden på svenska.
z.config(z.locales.sv());

const text = (max: number) => z.string().trim().min(1, 'Får inte vara tomt').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();
const isoDate = z.iso.date('Ogiltigt datum (ÅÅÅÅ-MM-DD)');
const optionalDate = isoDate.nullable().optional();
const ore = z.number().int('Belopp måste anges i hela öre').min(0, 'Belopp får inte vara negativt');
const id = z.number().int().positive();

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// Rum
export const roomCreateSchema = z.object({
  name: text(100),
  description: optionalText(2000),
  floor: optionalText(50),
  areaM2: z.number().positive().max(10_000).nullable().optional(),
});
export const roomUpdateSchema = roomCreateSchema.partial();
export type RoomCreate = z.infer<typeof roomCreateSchema>;

// Mått
export const measurementCreateSchema = z.object({
  label: text(100),
  value: z.number().finite(),
  unit: text(20),
});
export const measurementUpdateSchema = measurementCreateSchema.partial();

// Hantverkare
export const contractorCreateSchema = z.object({
  name: text(200),
  orgNumber: optionalText(20),
  phone: optionalText(30),
  email: z.email('Ogiltig e-postadress').nullable().optional(),
  notes: optionalText(2000),
});
export const contractorUpdateSchema = contractorCreateSchema.partial();

// Offerter. Hantverkaren är antingen sparad (contractorId) eller bara ett namn (supplierName).
const quoteFields = {
  contractorId: id.nullable().optional(),
  supplierName: optionalText(200),
  amountOre: ore,
  description: optionalText(2000),
  receivedOn: optionalDate,
  validUntil: optionalDate,
};
export const quoteCreateSchema = z
  .object(quoteFields)
  .refine((q) => q.contractorId != null || !!q.supplierName, {
    message: 'Ange vem offerten kommer från',
    path: ['supplierName'],
  });
export const quoteUpdateSchema = z
  .object(quoteFields)
  .partial()
  .refine((q) => Object.keys(q).length > 0, { message: 'Inget att ändra' });

// Projekt
const projectFields = {
  title: text(200),
  description: optionalText(5000),
  status: z.enum(PROJECT_STATUSES).optional(),
  kind: z.enum(PROJECT_KINDS).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  budgetOre: ore.optional(),
  contractorId: id.nullable().optional(),
  warrantyUntil: optionalDate,
  roomIds: z.array(id).max(100).optional(),
};
const endAfterStart = (p: { startDate?: string | null; endDate?: string | null }) =>
  !p.startDate || !p.endDate || p.endDate >= p.startDate;
const endAfterStartIssue = { message: 'Slutdatum måste vara efter startdatum', path: ['endDate'] };
export const projectCreateSchema = z
  .object(projectFields)
  .refine(endAfterStart, endAfterStartIssue);
export const projectUpdateSchema = z
  .object(projectFields)
  .partial()
  .refine(endAfterStart, endAfterStartIssue);
export const projectListQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  roomId: z.coerce.number().int().positive().optional(),
});

// Utgifter
export const expenseCreateSchema = z.object({
  date: isoDate,
  description: text(500),
  store: optionalText(200),
  category: z.enum(EXPENSE_CATEGORIES),
  amountOre: ore,
  roomId: id.nullable().optional(),
  taskId: id.nullable().optional(),
  contractorId: id.nullable().optional(),
});
export const expenseUpdateSchema = expenseCreateSchema.partial();

// Budget per kategori för ett projekt. En kategori som saknas eller har 0 i budget har ingen budget.
// Sparas som en helhet: det som skickas ersätter tidigare fördelning.
export const projectBudgetsSchema = z.object({
  budgets: z.partialRecord(z.enum(EXPENSE_CATEGORIES), ore),
});

// Uppgifter
export const taskCreateSchema = z.object({
  title: text(300),
  done: z.boolean().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  budgetOre: ore.optional(),
  dueDate: optionalDate,
  roomId: id.nullable().optional(),
});
export const taskUpdateSchema = taskCreateSchema.partial();

// Material och färger i ett rum
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Ange färgen som #RRGGBB, t.ex. #F2EFE8')
  .or(z.literal('').transform(() => null))
  .nullable()
  .optional();
export const materialCreateSchema = z.object({
  surface: z.enum(MATERIAL_SURFACES),
  type: z.enum(MATERIAL_TYPES),
  name: text(200),
  brand: optionalText(100),
  colorCode: optionalText(60),
  colorHex: hexColor,
  finish: optionalText(60),
  quantity: optionalText(60),
  appliedOn: optionalDate,
  projectId: id.nullable().optional(),
  expenseId: id.nullable().optional(),
  notes: optionalText(2000),
});
export const materialUpdateSchema = materialCreateSchema.partial();

// Underhållsplan: återkommande jobb för hela huset eller ett rum.
// Nästa gång räknas från när jobbet senast gjordes, annars från "första gången".
const intervalMonths = z
  .number()
  .int('Ange hela månader')
  .min(1, 'Minst 1 månad')
  .max(600, 'Högst 600 månader');
export const maintenanceCreateSchema = z
  .object({
    title: text(200),
    roomId: id.nullable().optional(),
    intervalMonths,
    lastDoneOn: optionalDate,
    firstDueOn: optionalDate,
    notes: optionalText(2000),
  })
  .refine((m) => !!m.lastDoneOn || !!m.firstDueOn, {
    message: 'Ange när det senast gjordes, eller när det ska göras första gången',
    path: ['firstDueOn'],
  });
export const maintenanceUpdateSchema = z
  .object({
    title: text(200),
    roomId: id.nullable().optional(),
    intervalMonths,
    firstDueOn: optionalDate,
    notes: optionalText(2000),
  })
  .partial();
export const maintenanceDoneSchema = z.object({
  /** Utelämnas = idag. Får inte ligga i framtiden. */
  doneOn: isoDate.optional(),
  note: optionalText(500),
});

// Anteckningar
export const noteCreateSchema = z
  .object({
    content: text(10_000),
    projectId: id.nullable().optional(),
    roomId: id.nullable().optional(),
  })
  .refine((n) => n.projectId != null || n.roomId != null, {
    message: 'Anteckningen måste höra till ett projekt eller ett rum',
    path: ['projectId'],
  });
export const noteUpdateSchema = z.object({ content: text(10_000) });
export const noteListQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  roomId: z.coerce.number().int().positive().optional(),
});

// Bilagor (multipart-fält kommer som strängar)
const formId = z.coerce.number().int().positive().optional();
export const attachmentFieldsSchema = z
  .object({
    kind: z.enum(ATTACHMENT_KINDS),
    projectId: formId,
    expenseId: formId,
    roomId: formId,
    quoteId: formId,
  })
  // Ett kvitto får sakna ägare: det hamnar då i kvittoinkorgen.
  .refine(
    (a) =>
      a.kind === 'kvitto' ||
      a.projectId != null ||
      a.expenseId != null ||
      a.roomId != null ||
      a.quoteId != null,
    {
      message: 'Bilagan måste höra till ett projekt, en utgift, ett rum eller en offert',
      path: ['projectId'],
    },
  )
  // Typen "offert" är till för dokument på en offert, och bara för dem.
  .refine((a) => (a.kind === 'offert') === (a.quoteId != null), {
    message: 'Offertdokument måste ha typen offert och höra till en offert',
    path: ['quoteId'],
  });
export const attachmentUpdateSchema = z
  .object({
    caption: z.string().trim().max(300).nullable(),
    kind: z.enum(ATTACHMENT_KINDS),
    // Kopplar ett kvitto i inkorgen till en utgift.
    expenseId: z.number().int().positive(),
  })
  .partial()
  .refine((a) => Object.keys(a).length > 0, { message: 'Inget att ändra' });
export const attachmentListQuerySchema = noteListQuerySchema.extend({
  expenseId: z.coerce.number().int().positive().optional(),
  quoteId: z.coerce.number().int().positive().optional(),
  // 1 = kvitton som inte hör till någon utgift än.
  inbox: z.enum(['1']).optional(),
});

// Global sökning över projekt, rum, utgifter, uppgifter, anteckningar m.m.
export const globalSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(SEARCH_MIN_LENGTH, 'Skriv minst två tecken')
    .max(100, 'Sökningen är för lång'),
});

// Sök/filter över alla utgifter (även för CSV-export)
const optionalQueryId = z.coerce.number().int().positive().optional();
export const expenseSearchSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    roomId: optionalQueryId,
    projectId: optionalQueryId,
    sort: z.enum(['date', 'amount']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'Från-datum måste vara före till-datum',
    path: ['to'],
  });
/** Filter som klienten kan skicka; alla fält valfria. */
export type ExpenseSearch = Partial<z.output<typeof expenseSearchSchema>>;

export const statsQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
});

// Inloggning
const emailField = z.email('Ogiltig e-postadress').trim().toLowerCase().max(254);
// Långa lösenfraser uppmuntras; övre gräns skyddar mot onödigt dyr hashning.
export const PASSWORD_MIN = 10;
const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Lösenordet måste ha minst ${PASSWORD_MIN} tecken`)
  .max(200, 'Lösenordet får ha högst 200 tecken');

export const setupSchema = z.object({
  name: text(100),
  email: emailField,
  password: passwordField,
});
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Ange lösenord').max(200),
});
export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: text(100),
  email: emailField,
  password: passwordField,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ange nuvarande lösenord').max(200),
  newPassword: passwordField,
});
export const inviteCreateSchema = z.object({ note: optionalText(200) });
