// Tömmer E2E-testernas databas och uppladdningar innan testservern startar.
// Rör bara e2e/.tmp – aldrig utvecklingsdatan i data/ eller uploads/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
