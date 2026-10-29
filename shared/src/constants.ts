// Domänkonstanter som delas mellan server och webb.
// Koderna lagras i databasen; etiketterna visas i gränssnittet.

export const PROJECT_STATUSES = ['planerad', 'pagaende', 'klar'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planerad: 'Planerad',
  pagaende: 'Pågående',
  klar: 'Klar',
};

// Typ av projekt. Skiljer förbättringar från underhåll och reparationer i försäljningsunderlaget.
export const PROJECT_KINDS = ['forbattring', 'underhall', 'reparation'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  forbattring: 'Förbättring',
  underhall: 'Underhåll',
  reparation: 'Reparation',
};

export const MATERIAL_SURFACES = ['golv', 'vagg', 'tak', 'snickerier', 'ovrigt'] as const;
export type MaterialSurface = (typeof MATERIAL_SURFACES)[number];
export const MATERIAL_SURFACE_LABELS: Record<MaterialSurface, string> = {
  golv: 'Golv',
  vagg: 'Väggar',
  tak: 'Tak',
  snickerier: 'Snickerier',
  ovrigt: 'Övrigt',
};

export const MATERIAL_TYPES = ['farg', 'material'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  farg: 'Färg',
  material: 'Material',
};

export const EXPENSE_CATEGORIES = ['material', 'verktyg', 'arbete', 'ovrigt'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  material: 'Material',
  verktyg: 'Verktyg',
  arbete: 'Arbetskostnad',
  ovrigt: 'Övrigt',
};

export const TASK_PRIORITIES = ['lag', 'medel', 'hog'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  lag: 'Låg',
  medel: 'Medel',
  hog: 'Hög',
};

export const ATTACHMENT_KINDS = ['kvitto', 'fore', 'efter', 'ovrigt', 'offert'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  kvitto: 'Kvitto',
  fore: 'Före',
  efter: 'Efter',
  ovrigt: 'Övrigt',
  offert: 'Offert',
};

/** Belopp lagras som heltal i öre för att undvika avrundningsfel. */
export type Ore = number;

export function kronorToOre(kronor: number): Ore {
  return Math.round(kronor * 100);
}

export function formatSek(ore: Ore): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(ore / 100);
}

export const USER_ROLES = ['owner', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Ägare',
  member: 'Medlem',
};

/** Rubrik som krävs på alla ändrande anrop (skydd mot CSRF). */
export const CSRF_HEADER = 'x-renoveringskollen';

/** Det som går att söka bland i den globala sökningen, i den ordning träffarna visas. */
export const SEARCH_KINDS = [
  'projekt',
  'rum',
  'utgift',
  'uppgift',
  'anteckning',
  'material',
  'hantverkare',
  'underhall',
  'offert',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  projekt: 'Projekt',
  rum: 'Rum',
  utgift: 'Utgifter',
  uppgift: 'Uppgifter',
  anteckning: 'Anteckningar',
  material: 'Material och färg',
  hantverkare: 'Hantverkare',
  underhall: 'Underhåll',
  offert: 'Offerter',
};
/** Så många tecken krävs för att söka, och så många träffar visas per sorts post. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_PER_KIND = 50;
