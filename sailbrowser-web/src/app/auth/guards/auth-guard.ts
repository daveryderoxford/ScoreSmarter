import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ClubTenant } from 'app/club-tenant';
import { from, map, Observable, of, switchMap, take } from 'rxjs';
import { needsEmailVerification } from '../email-verification';

/** Requires a signed-in Firebase user with a verified email (for password accounts). */
export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Observable<true | UrlTree> => {
  const afAuth = inject(Auth);
  const router = inject(Router);
  return authState(afAuth).pipe(
    take(1),
    map(user => {
      if (!user) {
        return router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: state.url },
        });
      }
      if (needsEmailVerification(user)) {
        return router.createUrlTree(['/auth/verify-email'], {
          queryParams: { returnUrl: state.url },
        });
      }
      return true;
    }),
  );
};

/** Requires a club admin (or sys admin) for the current club; others go to the home page. */
export const clubAdminGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Observable<true | UrlTree> => {
  const afAuth = inject(Auth);
  const router = inject(Router);
  const clubId = inject(ClubTenant).clubId;
  return authState(afAuth).pipe(
    take(1),
    switchMap(user => {
      if (!user) {
        return of(router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } }));
      }
      return from(user.getIdTokenResult()).pipe(
        map(token => {
          const clubs = token.claims['clubs'] as Record<string, string> | undefined;
          const isAdmin = token.claims['sysAdmin'] === true || clubs?.[clubId] === 'club-admin';
          return isAdmin || router.createUrlTree(['/home']);
        }),
      );
    }),
  );
};

/** Requires sign-in only — used by the verify-email page itself. */
export const loggedInGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
): Observable<true | UrlTree> => {
  const afAuth = inject(Auth);
  const router = inject(Router);
  return authState(afAuth).pipe(
    take(1),
    map(user =>
      !!user ||
      router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      }),
    ),
  );
};
