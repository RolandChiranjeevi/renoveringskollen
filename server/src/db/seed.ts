import { loadConfig } from '../config.ts';
import { openDb } from './client.ts';
import { expenses, projectRooms, projects, rooms, tasks } from './schema.ts';

const config = loadConfig();
const { db, close } = openDb(config.databasePath);

const existing = db.select({ id: rooms.id }).from(rooms).limit(1).all();
if (existing.length > 0) {
  console.log('Databasen innehåller redan data – hoppar över seed.');
  close();
  process.exit(0);
}

db.transaction((tx) => {
  const [kok, badrum] = tx
    .insert(rooms)
    .values([
      { name: 'Kök', floor: 'Plan 1', areaM2: 20 },
      { name: 'Badrum', floor: 'Plan 2', areaM2: 6 },
      { name: 'Vardagsrum', floor: 'Plan 1', areaM2: 32 },
    ])
    .returning()
    .all();

  const [project] = tx
    .insert(projects)
    .values({
      title: 'Nytt kök',
      description: 'Byte av bänkskivor, skåpluckor och kakel.',
      status: 'pagaende',
      startDate: '2026-09-01',
      budgetOre: 15_000_000,
    })
    .returning()
    .all();

  tx.insert(projectRooms).values({ projectId: project!.id, roomId: kok!.id }).run();
  tx.insert(expenses)
    .values([
      {
        projectId: project!.id,
        roomId: kok!.id,
        date: '2026-09-03',
        description: 'Bänkskiva ek',
        store: 'Byggmax',
        category: 'material',
        amountOre: 1_249_000,
      },
      {
        projectId: project!.id,
        roomId: kok!.id,
        date: '2026-09-10',
        description: 'Montering bänkskiva',
        store: 'Snickare AB',
        category: 'arbete',
        amountOre: 800_000,
      },
    ])
    .run();
  tx.insert(tasks)
    .values([
      { projectId: project!.id, title: 'Riv gammalt kakel', done: true, priority: 'hog' },
      { projectId: project!.id, title: 'Välj fogfärg', priority: 'lag' },
    ])
    .run();

  void badrum;
});

console.log('Seed klar.');
close();
