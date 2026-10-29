import type { FastifyPluginAsync } from 'fastify';
import { globalSearchQuerySchema, type SearchResults } from '@reno/shared';
import { parse } from '../http/validate.ts';
import { globalSearch } from '../queries/globalSearch.ts';
import type { RouteDeps } from './types.ts';

// Sökning över allt på en gång (projekt, rum, utgifter, uppgifter, anteckningar, material m.m.).
// Utgiftssökningen med filter och export finns kvar i search.ts.
export const globalSearchRoutes =
  ({ db }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.get('/search', async (req): Promise<SearchResults> => {
      const { q } = parse(globalSearchQuerySchema, req.query);
      return globalSearch(db, q);
    });
  };
