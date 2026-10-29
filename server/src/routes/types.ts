import type { Db } from '../db/client.ts';
import type { FileStore } from '../storage/files.ts';

export interface RouteDeps {
  db: Db;
  files: FileStore;
}
