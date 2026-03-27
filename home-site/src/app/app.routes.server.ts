import {RenderMode, ServerRoute} from '@angular/ssr';

/** Server routes all pages static;y rendered except clubs */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'clubs',
    renderMode: RenderMode.Client,
  },
  {
    path: 'clubs/register',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
