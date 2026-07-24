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
    // El Administrador puede navegar cualquier subárbol (director, coordinador, etc.) —
    // conserva su rol real, la vista de Director/Coordinador es solo un cambio de sidebar.
    if (roleId === 1) return true;
    if (roleId && allowedRoles.includes(roleId)) return true;

    const own = roleRoutes[roleId];
    router.navigate(own ? [`/dashboard/${own}/home`] : ['/auth/login']);
  } catch {
    router.navigate(['/auth/login']);
  }
  return false;
};
