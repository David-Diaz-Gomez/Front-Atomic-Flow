import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const ADMIN_ROLE_ID = 1;
const STORAGE_KEY = 'viewRoleId';

// Permite al administrador ver la barra lateral y navegar como si fuera Director o
// Coordinador sin dejar de ser Administrador (rol real en el JWT). La sidebar consulta
// effectiveRoleId$ para saber qué menú mostrar; el rol real sigue siendo el único que
// importa para el backend y para el badge de identidad.
@Injectable({ providedIn: 'root' })
export class ViewRoleService {
  private getRealRoleId(): number | null {
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') ?? 'null');
      return u?.roleId ? Number(u.roleId) : null;
    } catch { return null; }
  }

  private effectiveRoleId$$ = new BehaviorSubject<number | null>(this.resolveInitialViewRole());
  readonly effectiveRoleId$ = this.effectiveRoleId$$.asObservable();

  private resolveInitialViewRole(): number | null {
    const realRoleId = this.getRealRoleId();
    if (realRoleId !== ADMIN_ROLE_ID) return realRoleId;

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored || realRoleId;
  }

  getEffectiveRoleId(): number | null {
    return this.effectiveRoleId$$.value;
  }

  isRealAdmin(): boolean {
    return this.getRealRoleId() === ADMIN_ROLE_ID;
  }

  /** Solo tiene efecto si el usuario real es Administrador. */
  setViewRole(roleId: number): void {
    if (!this.isRealAdmin()) return;
    localStorage.setItem(STORAGE_KEY, String(roleId));
    this.effectiveRoleId$$.next(roleId);
  }

  /** Se llama al hacer logout para que la próxima sesión arranque en el rol real. */
  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.effectiveRoleId$$.next(this.getRealRoleId());
  }
}
