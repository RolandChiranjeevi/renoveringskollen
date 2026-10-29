import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  type AnySQLiteColumn,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  ATTACHMENT_KINDS,
  EXPENSE_CATEGORIES,
  MATERIAL_SURFACES,
  MATERIAL_TYPES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  USER_ROLES,
} from '@reno/shared';

// Datum lagras som ISO-text (YYYY-MM-DD eller full tidsstämpel), belopp som öre (heltal).

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  floor: text('floor'),
  areaM2: real('area_m2'),
  ...timestamps,
});

export const contractors = sqliteTable('contractors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  orgNumber: text('org_number'),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  ...timestamps,
});

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('planerad'),
    // Förbättring, underhåll eller reparation – avgör hur kostnaden redovisas i försäljningsunderlaget.
    kind: text('kind', { enum: PROJECT_KINDS }).notNull().default('forbattring'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    budgetOre: integer('budget_ore').notNull().default(0),
    contractorId: integer('contractor_id').references(() => contractors.id, {
      onDelete: 'set null',
    }),
    warrantyUntil: text('warranty_until'),
    ...timestamps,
  },
  (t) => [
    index('projects_status_idx').on(t.status),
    check('projects_budget_nonneg', sql`${t.budgetOre} >= 0`),
  ],
);

export const projectRooms = sqliteTable(
  'project_rooms',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.roomId] }),
    index('project_rooms_room_idx').on(t.roomId),
  ],
);

// Valfri budget per utgiftskategori och projekt. Projektets totalbudget (projects.budget_ore)
// gäller oavsett om den fördelats här eller inte.
export const projectBudgets = sqliteTable(
  'project_budgets',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    category: text('category', { enum: EXPENSE_CATEGORIES }).notNull(),
    budgetOre: integer('budget_ore').notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.category] }),
    check('project_budgets_nonneg', sql`${t.budgetOre} >= 0`),
  ],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    // Valfri koppling till en uppgift, för budget mot utfall per uppgift.
    taskId: integer('task_id').references((): AnySQLiteColumn => tasks.id, {
      onDelete: 'set null',
    }),
    // Valfri koppling till en sparad hantverkare – ger "Utfört av" och org.nr i underlagen.
    contractorId: integer('contractor_id').references(() => contractors.id, {
      onDelete: 'set null',
    }),
    date: text('date').notNull(),
    description: text('description').notNull(),
    store: text('store'),
    category: text('category', { enum: EXPENSE_CATEGORIES }).notNull(),
    amountOre: integer('amount_ore').notNull(),
    // Vem som la till posten. Tomt för rader från före E1 och om personen tagits bort.
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('expenses_project_idx').on(t.projectId),
    index('expenses_room_idx').on(t.roomId),
    index('expenses_task_idx').on(t.taskId),
    index('expenses_contractor_idx').on(t.contractorId),
    index('expenses_date_idx').on(t.date),
    check('expenses_amount_nonneg', sql`${t.amountOre} >= 0`),
  ],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('medel'),
    budgetOre: integer('budget_ore').notNull().default(0),
    dueDate: text('due_date'),
    completedAt: text('completed_at'),
    // Vem som la till posten. Tomt för rader från före E1 och om personen tagits bort.
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('tasks_project_idx').on(t.projectId)],
);

export const measurements = sqliteTable(
  'measurements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    ...timestamps,
  },
  (t) => [index('measurements_room_idx').on(t.roomId)],
);

// Vad som sitter i rummet: färger (märke, kulörkod, glans) och material (golv, skivor m.m.).
export const materials = sqliteTable(
  'materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    surface: text('surface', { enum: MATERIAL_SURFACES }).notNull(),
    type: text('type', { enum: MATERIAL_TYPES }).notNull(),
    // T.ex. "Väggfärg", "Ekparkett 14 mm", "Gips + plywood".
    name: text('name').notNull(),
    brand: text('brand'),
    colorCode: text('color_code'),
    // Hex-färg för färgruta i gränssnittet, om användaren anger en.
    colorHex: text('color_hex'),
    finish: text('finish'),
    quantity: text('quantity'),
    appliedOn: text('applied_on'),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('materials_room_idx').on(t.roomId),
    check(
      'materials_color_hex',
      sql`${t.colorHex} IS NULL OR ${t.colorHex} GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'`,
    ),
  ],
);

export const notes = sqliteTable(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    // Vem som la till posten. Tomt för rader från före E1 och om personen tagits bort.
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('notes_project_idx').on(t.projectId),
    index('notes_room_idx').on(t.roomId),
    check('notes_has_owner', sql`${t.projectId} IS NOT NULL OR ${t.roomId} IS NOT NULL`),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    // Dokument på en offert (offerten själv, som PDF eller foto).
    quoteId: integer('quote_id').references((): AnySQLiteColumn => quotes.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind', { enum: ATTACHMENT_KINDS }).notNull(),
    originalName: text('original_name').notNull(),
    // Slumpat filnamn på disk – användarens filnamn används aldrig som sökväg.
    storedName: text('stored_name').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Valfri bildtext som visas i bildvisaren.
    caption: text('caption'),
    ...timestamps,
  },
  (t) => [
    index('attachments_project_idx').on(t.projectId),
    index('attachments_expense_idx').on(t.expenseId),
    index('attachments_quote_idx').on(t.quoteId),
    check(
      'attachments_has_owner',
      // Ett kvitto utan ägare ligger i kvittoinkorgen tills det kopplas till en utgift.
      sql`${t.projectId} IS NOT NULL OR ${t.expenseId} IS NOT NULL OR ${t.roomId} IS NOT NULL OR ${t.quoteId} IS NOT NULL OR ${t.kind} = 'kvitto'`,
    ),
  ],
);

// Underhållsplan: återkommande jobb. Nästa gång räknas från senaste posten i historiken,
// annars från first_due_on. Rummet är valfritt (tomt = hela huset) och försvinner inte med jobbet.
export const maintenanceTasks = sqliteTable(
  'maintenance_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    roomId: integer('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    intervalMonths: integer('interval_months').notNull(),
    firstDueOn: text('first_due_on'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('maintenance_tasks_room_idx').on(t.roomId),
    check('maintenance_interval', sql`${t.intervalMonths} BETWEEN 1 AND 600`),
  ],
);

export const maintenanceLog = sqliteTable(
  'maintenance_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    maintenanceId: integer('maintenance_id')
      .notNull()
      .references(() => maintenanceTasks.id, { onDelete: 'cascade' }),
    doneOn: text('done_on').notNull(),
    note: text('note'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('maintenance_log_task_idx').on(t.maintenanceId, t.doneOn)],
);

// Inloggning. All renoveringsdata delas av hushållet; roller styr bara vem som hanterar medlemmar.

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // Lagras i gemener så att inloggning inte beror på skiftläge.
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('member'),
  ...timestamps,
});

export const sessions = sqliteTable(
  'sessions',
  {
    // SHA-256 av sessionstoken i hex. Själva token finns bara i användarens cookie.
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const invites = sqliteTable(
  'invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // SHA-256 av inbjudningstoken i hex.
    tokenHash: text('token_hash').notNull().unique(),
    note: text('note'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    usedBy: integer('used_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('invites_created_by_idx').on(t.createdBy)],
);

// Offerter från hantverkare på ett projekt. Högst en kan vara vald; när den väljs sätts projektets
// hantverkare och budget efter den. Hantverkaren är antingen sparad (contractor_id) eller bara ett namn.
export const quotes = sqliteTable(
  'quotes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractorId: integer('contractor_id').references(() => contractors.id, {
      onDelete: 'set null',
    }),
    supplierName: text('supplier_name'),
    amountOre: integer('amount_ore').notNull(),
    description: text('description'),
    receivedOn: text('received_on'),
    validUntil: text('valid_until'),
    chosen: integer('chosen', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('quotes_project_idx').on(t.projectId),
    uniqueIndex('quotes_one_chosen_per_project')
      .on(t.projectId)
      .where(sql`${t.chosen} = 1`),
    check('quotes_amount_nonneg', sql`${t.amountOre} >= 0`),
  ],
);
