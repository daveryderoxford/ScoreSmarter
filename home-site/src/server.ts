import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import {
  applyCatalogFilters,
  isValidClubId,
  parseBooleanQuery,
} from './server/published-seasons-catalog-map';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

function applyCatalogCors(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');
}

/**
 * Public published-seasons catalog for club websites.
 *
 * GET /api/published-seasons?clubId=ibrsc
 * GET /api/published-seasons?clubId=ibrsc&includeSecondarySeries=true
 * GET /api/published-seasons?clubId=ibrsc&seasonId=2026
 * GET /api/published-seasons?clubId=ibrsc&season=2026
 *
 * firebase-admin is loaded lazily so build-time route extraction does not
 * evaluate Admin SDK modules.
 */
app.options('/api/published-seasons', (_req, res) => {
  applyCatalogCors(res);
  res.status(204).send();
});

app.get('/api/published-seasons', async (req, res) => {
  applyCatalogCors(res);

  const clubIdRaw = req.query['clubId'];
  if (!isValidClubId(clubIdRaw)) {
    res.status(400).json({error: 'invalid_club_id'});
    return;
  }
  const clubId = clubIdRaw.trim();
  const includeSecondarySeries = parseBooleanQuery(req.query['includeSecondarySeries']);
  const seasonRaw = req.query['seasonId'] ?? req.query['season'];
  const seasonId =
    typeof seasonRaw === 'string' && seasonRaw.trim().length > 0
      ? seasonRaw.trim()
      : undefined;

  try {
    const {loadPublishedSeasonsCatalog} = await import('./server/published-seasons-catalog');
    const catalog = await loadPublishedSeasonsCatalog(clubId);
    const body = applyCatalogFilters(catalog, {includeSecondarySeries, seasonId});
    if ('error' in body) {
      res.status(404).json({error: 'season_not_found'});
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(body);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & {code?: string}).code : undefined;
    if (code === 'club_not_found' || (err instanceof Error && err.message === 'club_not_found')) {
      res.status(404).json({error: 'club_not_found'});
      return;
    }
    console.error('published-seasons catalog failed', err);
    res.status(500).json({error: 'catalog_unavailable'});
  }
});

/**
 * Public live series calendar for club websites (race calendar, not published results).
 *
 * GET /api/series-calendar?clubId=ibrsc
 * GET /api/series-calendar?clubId=ibrsc&seasonId=2026
 * GET /api/series-calendar?clubId=ibrsc&season=2026
 * GET /api/series-calendar?clubId=ibrsc&includeRaces=true
 * GET /api/series-calendar?clubId=ibrsc&include-races=1
 *
 * firebase-admin is loaded lazily so build-time route extraction does not
 * evaluate Admin SDK modules.
 */
app.options('/api/series-calendar', (_req, res) => {
  applyCatalogCors(res);
  res.status(204).send();
});

app.get('/api/series-calendar', async (req, res) => {
  applyCatalogCors(res);

  const clubIdRaw = req.query['clubId'];
  if (!isValidClubId(clubIdRaw)) {
    res.status(400).json({error: 'invalid_club_id'});
    return;
  }
  const clubId = clubIdRaw.trim();
  const includeRaces = parseBooleanQuery(
    req.query['includeRaces'] ?? req.query['include-races'],
  );
  const seasonRaw = req.query['seasonId'] ?? req.query['season'];
  const seasonId =
    typeof seasonRaw === 'string' && seasonRaw.trim().length > 0
      ? seasonRaw.trim()
      : undefined;

  try {
    const {loadSeriesCalendar} = await import('./server/series-calendar');
    const body = await loadSeriesCalendar(clubId, {includeRaces, seasonId});
    if ('error' in body) {
      res.status(404).json({error: 'season_not_found'});
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(body);
  } catch (err) {
    const code = err instanceof Error ? (err as Error & {code?: string}).code : undefined;
    if (code === 'club_not_found' || (err instanceof Error && err.message === 'club_not_found')) {
      res.status(404).json({error: 'club_not_found'});
      return;
    }
    console.error('series-calendar failed', err);
    res.status(500).json({error: 'calendar_unavailable'});
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
