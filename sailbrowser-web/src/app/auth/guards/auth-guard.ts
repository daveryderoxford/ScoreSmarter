import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { map, Observable, take } from 'rxjs';
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
