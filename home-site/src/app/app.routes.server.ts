import {RenderMode, ServerRoute} from '@angular/ssr';

/**
 * Client-rendered routes only. Prerendering pulls Firebase client/Admin into
 * the build-time server and fails (__dirname in ESM). Express still serves
 * /api/* and static assets at runtime when outputMode is "server".
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
