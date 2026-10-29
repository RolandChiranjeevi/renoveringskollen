import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DbHandle } from '../src/db/client.ts';
import { expenses, notes, projectRooms, projects, rooms, tasks } from '../src/db/schema.ts';

describe('databasschema', () => {
  let handle: DbHandle;
  afterEach(() => handle?.close());

  function setup() {
    handle = openDb(':memory:');
    const { db } = handle;
    const [room] = db.insert(rooms).values({ name: 'Kök' }).returning().all();
    const [project] = db.insert(projects).values({ title: 'Nytt kök' }).returning().all();
    return { db, room: room!, project: project! };
  }

  it('sätter standardvärden på projekt', () => {
    const { project } = setup();
    expect(project.status).toBe('planerad');
    expect(project.budgetOre).toBe(0);
    expect(project.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('tar bort utgifter, uppgifter och kopplingar när ett projekt raderas', () => {
    const { db, room, project } = setup();
    db.insert(projectRooms).values({ projectId: project.id, roomId: room.id }).run();
    db.insert(expenses)
      .values({
        projectId: project.id,
        date: '2026-10-01',
        description: 'Kakel',
        category: 'material',
        amountOre: 50_000,
      })
      .run();
    db.insert(tasks).values({ projectId: project.id, title: 'Kakla' }).run();

    db.delete(projects).where(eq(projects.id, project.id)).run();

    expect(db.select().from(expenses).all()).toHaveLength(0);
    expect(db.select().from(tasks).all()).toHaveLength(0);
    expect(db.select().from(projectRooms).all()).toHaveLength(0);
    expect(db.select().from(rooms).all()).toHaveLength(1);
  });

  it('behåller utgiften men nollar rummet när ett rum raderas', () => {
    const { db, room, project } = setup();
    db.insert(expenses)
      .values({
        projectId: project.id,
        roomId: room.id,
        date: '2026-10-01',
        description: 'Färg',
        category: 'material',
        amountOre: 10_000,
      })
      .run();

    db.delete(rooms).where(eq(rooms.id, room.id)).run();

    const [expense] = db.select().from(expenses).all();
    expect(expense?.roomId).toBeNull();
  });

  it('nekar negativa belopp', () => {
    const { db, project } = setup();
    expect(() =>
      db
        .insert(expenses)
        .values({
          projectId: project.id,
          date: '2026-10-01',
          description: 'Fel',
          category: 'ovrigt',
          amountOre: -1,
        })
        .run(),
    ).toThrow(/CHECK constraint/);
  });

  it('nekar anteckningar utan projekt eller rum', () => {
    const { db } = setup();
    expect(() => db.insert(notes).values({ content: 'Lös anteckning' }).run()).toThrow(
      /CHECK constraint/,
    );
  });

  it('nekar dubbla rumsnamn', () => {
    const { db } = setup();
    expect(() => db.insert(rooms).values({ name: 'Kök' }).run()).toThrow(/UNIQUE/);
  });
});
