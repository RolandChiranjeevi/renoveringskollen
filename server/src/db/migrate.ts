import { loadConfig } from '../config.ts';
import { openDb } from './client.ts';

const config = loadConfig();
const { close } = openDb(config.databasePath, { migrate: true });
close();
console.log(`Migreringar körda mot ${config.databasePath}`);
