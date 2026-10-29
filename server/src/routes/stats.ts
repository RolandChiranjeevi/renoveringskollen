import type { FastifyPluginAsync } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { EXPENSE_CATEGORIES, statsQuerySchema, type Stats } from '@reno/shared';
import { contractors, expenses, projects, rooms } from '../db/schema.ts';
import { parse } from '../http/validate.ts';
import type { RouteDeps } from './types.ts';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function groupSum<T>(items: T[], key: (t: T) => string, amount: (t: T) => number) {
  const out = new Map<string, number>();
  for (const it of items) out.set(key(it), (out.get(key(it)) ?? 0) + amount(it));
  return out;
}

export const statsRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/stats', async (req): Promise<Stats> => {
      const { year } = parse(statsQuerySchema, req.query);

      const years = db
        .selectDistinct({ y: sql<string>`substr(${expenses.date}, 1, 4)` })
        .from(expenses)
        .orderBy(desc(sql`1`))
        .all()
        .map((r) => Number(r.y));

      // Datamängden för ett hem är liten – hämta periodens rader och summera i minnet.
      // Utförare: hantverkaren på utgiften, annars projektets hantverkare (annars butik/firma, se nedan).
      const projectContractor = alias(contractors, 'project_contractor');
      const rows = db
        .select({
          date: expenses.date,
          amountOre: expenses.amountOre,
          category: expenses.category,
          store: expenses.store,
          projectId: expenses.projectId,
          roomId: expenses.roomId,
          roomName: rooms.name,
          contractorId: sql<number | null>`coalesce(${contractors.id}, ${projectContractor.id})`,
          contractorName: sql<
            string | null
          >`coalesce(${contractors.name}, ${projectContractor.name})`,
          orgNumber: sql<
            string | null
          >`case when ${contractors.id} is not null then ${contractors.orgNumber} else ${projectContractor.orgNumber} end`,
        })
        .from(expenses)
        .innerJoin(projects, eq(projects.id, expenses.projectId))
        .leftJoin(rooms, eq(rooms.id, expenses.roomId))
        .leftJoin(contractors, eq(contractors.id, expenses.contractorId))
        .leftJoin(projectContractor, eq(projectContractor.id, projects.contractorId))
        .where(year ? sql`substr(${expenses.date}, 1, 4) = ${String(year)}` : undefined)
        .all();

      const totalOre = rows.reduce((s, r) => s + r.amountOre, 0);

      let series: Stats['series'];
      if (year) {
        const byMonth = groupSum(
          rows,
          (r) => r.date.slice(5, 7),
          (r) => r.amountOre,
        );
        series = MONTHS.map((label, i) => {
          const key = String(i + 1).padStart(2, '0');
          return { label, key: `${year}-${key}`, amountOre: byMonth.get(key) ?? 0 };
        });
      } else {
        const byYear = groupSum(
          rows,
          (r) => r.date.slice(0, 4),
          (r) => r.amountOre,
        );
        const sorted = [...years].sort((a, b) => a - b);
        series = [];
        for (let y = sorted[0] ?? 0; sorted.length && y <= sorted.at(-1)!; y++) {
          series.push({ label: String(y), key: String(y), amountOre: byYear.get(String(y)) ?? 0 });
        }
      }

      const byCat = groupSum(
        rows,
        (r) => r.category,
        (r) => r.amountOre,
      );
      const byCategory = EXPENSE_CATEGORIES.map((category) => ({
        category,
        amountOre: byCat.get(category) ?? 0,
      }));

      const roomMap = new Map<string, Stats['byRoom'][number]>();
      for (const r of rows) {
        const k = String(r.roomId);
        const entry = roomMap.get(k) ?? {
          roomId: r.roomId,
          name: r.roomName ?? 'Inget specifikt rum',
          amountOre: 0,
        };
        entry.amountOre += r.amountOre;
        roomMap.set(k, entry);
      }
      const byRoom = [...roomMap.values()].sort((a, b) => b.amountOre - a.amountOre);

      const spentAll = groupSum(
        db.select({ p: expenses.projectId, a: expenses.amountOre }).from(expenses).all(),
        (r) => String(r.p),
        (r) => r.a,
      );
      const spentPeriod = groupSum(
        rows,
        (r) => String(r.projectId),
        (r) => r.amountOre,
      );
      const projectStats = db
        .select({
          id: projects.id,
          title: projects.title,
          status: projects.status,
          budgetOre: projects.budgetOre,
        })
        .from(projects)
        .orderBy(desc(projects.startDate), desc(projects.id))
        .all()
        .map((p) => ({
          ...p,
          spentOre: spentAll.get(String(p.id)) ?? 0,
          spentInPeriodOre: spentPeriod.get(String(p.id)) ?? 0,
        }))
        .filter((p) => !year || p.spentInPeriodOre > 0);

      // Utförare: projektets hantverkare om sådan finns, annars utgiftens butik/firma.
      const laborMap = new Map<string, Stats['labor']['byContractor'][number]>();
      for (const r of rows.filter((x) => x.category === 'arbete')) {
        const name = r.contractorName ?? r.store ?? 'Okänd utförare';
        const k = r.contractorId ? `c${r.contractorId}` : `s${name.toLocaleLowerCase('sv-SE')}`;
        const entry = laborMap.get(k) ?? {
          contractorId: r.contractorId,
          name,
          orgNumber: r.orgNumber,
          amountOre: 0,
        };
        entry.amountOre += r.amountOre;
        laborMap.set(k, entry);
      }
      const byContractor = [...laborMap.values()].sort((a, b) => b.amountOre - a.amountOre);

      return {
        year: year ?? null,
        years,
        totalOre,
        expenseCount: rows.length,
        series,
        byCategory,
        byRoom,
        projects: projectStats,
        labor: { totalOre: byContractor.reduce((s, c) => s + c.amountOre, 0), byContractor },
      };
    });
  };
