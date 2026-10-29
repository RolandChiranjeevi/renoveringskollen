import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Generös tidsgräns: första testet i varje fil migrerar en ny databas och hashar lösenord,
  // vilket kan ta flera sekunder på en hårt belastad dator eller CI-maskin.
  test: { environment: 'node', testTimeout: 15_000 },
});
