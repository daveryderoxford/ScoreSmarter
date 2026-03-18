import { inject } from '@angular/core';
import { Auth, authState } from '@angular/fire/auth';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { map, Observable, take } from 'rxjs';

/** Authentication guard
 * Checks if logged in as Firebase users 
 * Redirects to login if user is not authenticated including returnUrlquery parameter with the 
 * original URL
 */
export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<true | UrlTree> => {
  const afAuth = inject(Auth);
  const router = inject(Router);
  return authState(afAuth).pipe(
    take(1),
    map(user =>
      !!user ||
      router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      })
    )
  );
};
