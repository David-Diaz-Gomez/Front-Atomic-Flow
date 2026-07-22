import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';

const roleRoutes: Record<number, string> = {
  1: 'admin',
  2: 'director',
  3: 'coordinator',
  4: 'operator',
  5: 'superoperario',
};

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const allowedRoles: number[] = route.data['roles'] ?? [];

  try {
    const user = JSON.parse(localStorage.getItem('currentUser') ?? 'null');
    const roleId: number = user?.roleId;
    if (roleId && allowedRoles.includes(roleId)) return true;

    const own = roleRoutes[roleId];
    router.navigate(own ? [`/dashboard/${own}/home`] : ['/auth/login']);
  } catch {
    router.navigate(['/auth/login']);
  }
  return false;
};
