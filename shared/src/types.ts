import type {
  AttachmentKind,
  ExpenseCategory,
  MaterialSurface,
  MaterialType,
  Ore,
  ProjectKind,
  ProjectStatus,
  SearchKind,
  TaskPriority,
  UserRole,
} from './constants.ts';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthStatus {
  /** Sant tills ägarkontot skapats vid första start. */
  setupRequired: boolean;
  user: User | null;
}

export interface Invite {
  id: number;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByName: string | null;
}
/** Bara när inbjudan skapas: länken visas en gång och lagras inte i klartext. */
export interface CreatedInvite extends Invite {
  token: string;
}

// API-svar. Datum är ISO-strängar, belopp i öre.

interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface Room extends Timestamps {
  id: number;
  name: string;
  description: string | null;
  floor: string | null;
  areaM2: number | null;
}
export interface RoomListItem extends Room {
  spentOre: Ore;
}
export interface RoomDetail extends Room {
  projectIds: number[];
  measurements: Measurement[];
}

export interface Measurement extends Timestamps {
  id: number;
  roomId: number;
  label: string;
  value: number;
  unit: string;
}

export interface Contractor extends Timestamps {
  id: number;
  name: string;
  orgNumber: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Project extends Timestamps {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  kind: ProjectKind;
  startDate: string | null;
  endDate: string | null;
  budgetOre: Ore;
  contractorId: number | null;
  warrantyUntil: string | null;
}
export interface ProjectSummary extends Project {
  roomIds: number[];
  spentOre: Ore;
  taskCount: number;
  tasksDone: number;
}
export interface ProjectDetail extends ProjectSummary {
  contractor: Contractor | null;
  /** Vem som utfört arbetet: hantverkare på arbetskostnader, annars projektets hantverkare. Tom = eget arbete. */
  performedBy: string[];
}

export interface Authored {
  /** Vem som la till posten; namnet följer med först när hushållet har fler än en medlem. */
  createdBy: number | null;
  createdByName: string | null;
}

export interface Expense extends Timestamps, Authored {
  id: number;
  projectId: number;
  roomId: number | null;
  date: string;
  description: string;
  store: string | null;
  category: ExpenseCategory;
  amountOre: Ore;
  taskId: number | null;
  contractorId: number | null;
}
export interface ExpenseListItem extends Expense {
  attachmentCount: number;
}

export interface Quote extends Timestamps {
  id: number;
  projectId: number;
  contractorId: number | null;
  /** Namn när hantverkaren inte är sparad (eller har tagits bort). */
  supplierName: string | null;
  /** Det namn som visas: den sparade hantverkarens namn, annars supplierName. */
  supplier: string;
  amountOre: Ore;
  description: string | null;
  receivedOn: string | null;
  validUntil: string | null;
  chosen: boolean;
}

export interface Task extends Timestamps, Authored {
  id: number;
  projectId: number;
  roomId: number | null;
  title: string;
  done: boolean;
  priority: TaskPriority;
  budgetOre: Ore;
  dueDate: string | null;
  completedAt: string | null;
}
export interface TaskListItem extends Task {
  /** Summa av utgifter kopplade till uppgiften. */
  spentOre: Ore;
}

export interface Material extends Timestamps {
  id: number;
  roomId: number;
  surface: MaterialSurface;
  type: MaterialType;
  name: string;
  brand: string | null;
  colorCode: string | null;
  colorHex: string | null;
  finish: string | null;
  quantity: string | null;
  appliedOn: string | null;
  projectId: number | null;
  expenseId: number | null;
  notes: string | null;
}

export interface Note extends Timestamps, Authored {
  id: number;
  projectId: number | null;
  roomId: number | null;
  content: string;
}

export interface Attachment extends Timestamps {
  id: number;
  projectId: number | null;
  expenseId: number | null;
  roomId: number | null;
  quoteId: number | null;
  kind: AttachmentKind;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

export interface ExpenseSearchItem extends ExpenseListItem {
  projectTitle: string;
  roomName: string | null;
}
export interface ExpenseSearchResult {
  items: ExpenseSearchItem[];
  count: number;
  totalOre: Ore;
}

export interface Stats {
  /** Vald period; null = alla år. */
  year: number | null;
  /** År som har minst en utgift, senaste först. */
  years: number[];
  totalOre: Ore;
  expenseCount: number;
  /** Vid valt år: 12 månader (jan–dec). Vid alla år: ett värde per år, äldst först. */
  series: { label: string; key: string; amountOre: Ore }[];
  byCategory: { category: ExpenseCategory; amountOre: Ore }[];
  byRoom: { roomId: number | null; name: string; amountOre: Ore }[];
  /** Budget mot utfall gäller hela projektets livstid, oberoende av valt år. */
  projects: {
    id: number;
    title: string;
    status: ProjectStatus;
    budgetOre: Ore;
    spentOre: Ore;
    spentInPeriodOre: Ore;
  }[];
  /** Underlag för ROT: arbetskostnader i perioden, per utförare. */
  labor: {
    totalOre: Ore;
    byContractor: {
      contractorId: number | null;
      name: string;
      orgNumber: string | null;
      amountOre: Ore;
    }[];
  };
}

export interface Report {
  generatedAt: string;
  totalOre: Ore;
  rooms: Room[];
  contractors: Contractor[];
  projects: (ProjectSummary & {
    expenses: ExpenseListItem[];
    tasksCompleted: Task[];
    performedBy: string[];
  })[];
}

export interface CategoryBudgetRow {
  category: ExpenseCategory;
  /** 0 = ingen budget satt för kategorin. */
  budgetOre: Ore;
  spentOre: Ore;
}
/** Budget per kategori för ett projekt, med utfall. */
export interface ProjectBudgets {
  /** Projektets totalbudget. */
  projectBudgetOre: Ore;
  /** Summan av kategoribudgetarna. Kan vara lägre eller högre än totalbudgeten. */
  allocatedOre: Ore;
  categories: CategoryBudgetRow[];
}

/** Det som närmar sig: uppgifter med förfallodatum och garantier som löper ut. */
export interface Upcoming {
  /** Dagens datum (ÅÅÅÅ-MM-DD) enligt servern. */
  today: string;
  tasks: {
    id: number;
    title: string;
    projectId: number;
    projectTitle: string;
    priority: TaskPriority;
    dueDate: string;
    /** Negativt = så många dagar försenad. 0 = idag. */
    daysLeft: number;
  }[];
  warranties: {
    projectId: number;
    title: string;
    warrantyUntil: string;
    daysLeft: number;
    contractorName: string | null;
  }[];
  /** Återkommande underhåll som är försenat eller förfaller inom 30 dagar. */
  maintenance: {
    id: number;
    title: string;
    roomId: number | null;
    roomName: string | null;
    dueOn: string;
    daysLeft: number;
  }[];
}

/** Ett återkommande jobb i underhållsplanen. */
export interface MaintenanceItem {
  id: number;
  title: string;
  roomId: number | null;
  /** Null = hela huset. */
  roomName: string | null;
  intervalMonths: number;
  firstDueOn: string | null;
  notes: string | null;
  /** Senaste gången det gjordes, ur historiken. */
  lastDoneOn: string | null;
  /** Nästa gång: senast gjort + intervall, annars "första gången". Null om båda saknas. */
  dueOn: string | null;
  /** Dagar kvar till dueOn; negativt = försenat. */
  daysLeft: number | null;
  status: 'overdue' | 'soon' | 'later' | 'unscheduled';
  doneCount: number;
}

export interface MaintenanceLogEntry {
  id: number;
  maintenanceId: number;
  doneOn: string;
  note: string | null;
  createdAt: string;
}

/** Underlag vid försäljning av huset: för köparen och för deklarationen. */
export interface SalePhoto {
  id: number;
  caption: string | null;
}

export interface SalePhotoPair {
  before: SalePhoto;
  after: SalePhoto;
}

export interface SaleReport {
  generatedAt: string;
  totalOre: Ore;
  /** Per år och projekttyp. Arbetskostnad redovisas separat (ingår i totalen). */
  byYear: { year: number; totalOre: Ore; laborOre: Ore; byKind: Record<ProjectKind, Ore> }[];
  byRoom: { roomId: number | null; name: string; amountOre: Ore }[];
  rooms: (Room & { materials: Material[] })[];
  contractors: (Contractor & { projectTitles: string[]; laborOre: Ore })[];
  warranties: {
    projectId: number;
    title: string;
    contractorName: string | null;
    warrantyUntil: string;
    active: boolean;
  }[];
  projects: {
    id: number;
    title: string;
    kind: ProjectKind;
    status: ProjectStatus;
    startDate: string | null;
    endDate: string | null;
    spentOre: Ore;
    laborOre: Ore;
    roomNames: string[];
    performedBy: string[];
    /** Alla före/efter-par (se pairBeforeAfter), i den ordning bilderna laddades upp. */
    photoPairs: SalePhotoPair[];
  }[];
}

/** En säkerhetskopia (.tar.gz med databasen och alla uppladdade filer). */
export interface BackupInfo {
  name: string;
  sizeBytes: number;
  /** När kopian skapades (ISO). */
  createdAt: string;
}

export interface BackupResult extends BackupInfo {
  /** Antal uppladdade filer som kom med. */
  files: number;
  /** Antal äldre kopior som togs bort. */
  removed: number;
}

export interface SearchHit {
  id: number;
  title: string;
  /** Var posten hör hemma, t.ex. projektets eller rummets namn. */
  context: string | null;
  /** Utdrag ur längre text (anteckningar, beskrivningar) kring det som matchade. */
  snippet: string | null;
  date: string | null;
  amountOre: Ore | null;
  /** Sidan i appen som visar posten. */
  href: string;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
}

export interface SearchResults {
  query: string;
  total: number;
  groups: SearchGroup[];
}
