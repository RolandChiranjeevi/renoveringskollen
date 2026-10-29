import type { FastifyPluginAsync } from 'fastify';
import { asc, eq, inArray } from 'drizzle-orm';
import {
  pairBeforeAfter,
  PROJECT_KINDS,
  type ProjectKind,
  type SalePhotoPair,
  type SaleReport,
} from '@reno/shared';
import { attachments, contractors, expenses, projectRooms, projects, rooms } from '../db/schema.ts';
import { performedByProjects } from '../queries/performedBy.ts';
import { listRoomMaterials } from './materials.ts';
import type { RouteDeps } from './types.ts';

const emptyKinds = () =>
  Object.fromEntries(PROJECT_KINDS.map((k) => [k, 0])) as Record<ProjectKind, number>;

// Underlag vid försäljning: sammanställning för köparen och för deklarationen.
// Inga skatteberäkningar görs – bara summor uppdelade så att de går att använda som underlag.
export const saleReportRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/sale-report', async (): Promise<SaleReport> => {
      const today = new Date().toISOString().slice(0, 10);
      const allProjects = db
        .select()
        .from(projects)
        .orderBy(asc(projects.startDate), asc(projects.id))
        .all();
      const kindOf = new Map(allProjects.map((p) => [p.id, p.kind]));
      const allExpenses = db
        .select({
          projectId: expenses.projectId,
          roomId: expenses.roomId,
          roomName: rooms.name,
          contractorId: expenses.contractorId,
          date: expenses.date,
          category: expenses.category,
          amountOre: expenses.amountOre,
        })
        .from(expenses)
        .leftJoin(rooms, eq(rooms.id, expenses.roomId))
        .all();

      // Per år och projekttyp
      const years = new Map<number, SaleReport['byYear'][number]>();
      for (const e of allExpenses) {
        const year = Number(e.date.slice(0, 4));
        const row = years.get(year) ?? { year, totalOre: 0, laborOre: 0, byKind: emptyKinds() };
        row.totalOre += e.amountOre;
        if (e.category === 'arbete') row.laborOre += e.amountOre;
        row.byKind[kindOf.get(e.projectId) ?? 'forbattring'] += e.amountOre;
        years.set(year, row);
      }

      // Per rum
      const roomTotals = new Map<string, SaleReport['byRoom'][number]>();
      for (const e of allExpenses) {
        const key = String(e.roomId);
        const row = roomTotals.get(key) ?? {
          roomId: e.roomId,
          name: e.roomName ?? 'Inget specifikt rum',
          amountOre: 0,
        };
        row.amountOre += e.amountOre;
        roomTotals.set(key, row);
      }

      // Rum med material och färger
      const allMaterials = listRoomMaterials(db);
      const roomList = db
        .select()
        .from(rooms)
        .orderBy(asc(rooms.name))
        .all()
        .map((r) => ({ ...r, materials: allMaterials.filter((m) => m.roomId === r.id) }));

      // Projekt
      const ids = allProjects.map((p) => p.id);
      const performedBy = performedByProjects(db, ids);
      const links = ids.length
        ? db
            .select({ projectId: projectRooms.projectId, name: rooms.name })
            .from(projectRooms)
            .innerJoin(rooms, eq(rooms.id, projectRooms.roomId))
            .where(inArray(projectRooms.projectId, ids))
            .all()
        : [];
      const photos = ids.length
        ? db
            .select({
              id: attachments.id,
              projectId: attachments.projectId,
              kind: attachments.kind,
              mimeType: attachments.mimeType,
              caption: attachments.caption,
              createdAt: attachments.createdAt,
            })
            .from(attachments)
            .where(inArray(attachments.projectId, ids))
            .orderBy(asc(attachments.createdAt), asc(attachments.id))
            .all()
        : [];
      const photoPairs = (projectId: number): SalePhotoPair[] =>
        pairBeforeAfter(photos.filter((a) => a.projectId === projectId)).map(
          ({ before, after }) => ({
            before: { id: before.id, caption: before.caption },
            after: { id: after.id, caption: after.caption },
          }),
        );

      const projectList = allProjects.map((p) => {
        const own = allExpenses.filter((e) => e.projectId === p.id);
        return {
          id: p.id,
          title: p.title,
          kind: p.kind,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          spentOre: own.reduce((s, e) => s + e.amountOre, 0),
          laborOre: own.filter((e) => e.category === 'arbete').reduce((s, e) => s + e.amountOre, 0),
          roomNames: links.filter((l) => l.projectId === p.id).map((l) => l.name),
          performedBy: performedBy.get(p.id) ?? [],
          photoPairs: photoPairs(p.id),
        };
      });

      // Hantverkare som faktiskt använts – på utgifter eller som projektets hantverkare
      const usedContractors = db
        .select()
        .from(contractors)
        .orderBy(asc(contractors.name))
        .all()
        .map((c) => {
          const titles = allProjects
            .filter(
              (p) =>
                p.contractorId === c.id ||
                allExpenses.some((e) => e.projectId === p.id && e.contractorId === c.id),
            )
            .map((p) => p.title);
          const laborOre = allExpenses
            .filter((e) => e.contractorId === c.id && e.category === 'arbete')
            .reduce((s, e) => s + e.amountOre, 0);
          return { ...c, projectTitles: titles, laborOre };
        })
        .filter((c) => c.projectTitles.length > 0);

      const contractorName = new Map(usedContractors.map((c) => [c.id, c.name]));
      const warranties = allProjects
        .filter((p) => p.warrantyUntil)
        .map((p) => ({
          projectId: p.id,
          title: p.title,
          contractorName:
            (p.contractorId ? contractorName.get(p.contractorId) : undefined) ??
            performedBy.get(p.id)?.[0] ??
            null,
          warrantyUntil: p.warrantyUntil!,
          active: p.warrantyUntil! >= today,
        }))
        .sort((a, b) => b.warrantyUntil.localeCompare(a.warrantyUntil));

      return {
        generatedAt: new Date().toISOString(),
        totalOre: allExpenses.reduce((s, e) => s + e.amountOre, 0),
        byYear: [...years.values()].sort((a, b) => a.year - b.year),
        byRoom: [...roomTotals.values()].sort((a, b) => b.amountOre - a.amountOre),
        rooms: roomList,
        contractors: usedContractors,
        warranties,
        projects: projectList,
      };
    });
  };
