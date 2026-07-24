import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Api } from '../../../core/services/api';
import { NotificationService } from '../../services/notification.service';
import { ViewRoleService } from '../../../core/services/view-role.service';

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit, OnDestroy {
  menuItems: any[] = [];
  currentUser: any = null;
  isMenuOpen = false; // 👈 Lo único nuevo
  viewingAsRoleName: string | null = null;

  private viewRoleSub?: Subscription;

  // roleId 2 se muestra como "Otros roles" (no "Director") cuando el admin cambia
  // de vista — coincide con la etiqueta del dropdown en role-view-switcher.
  private readonly roleNames: Record<number, string> = {
    1: 'Administrador',
    2: 'Otros roles',
    3: 'Coordinador',
    4: 'Operario',
    5: 'Superoperario',
  };

  constructor(
    private apiService: Api,
    private router: Router,
    private notifSvc: NotificationService,
    private viewRoleService: ViewRoleService,
  ) {}

  ngOnInit(): void {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      this.currentUser = JSON.parse(userStr);
    }

    this.viewRoleSub = this.viewRoleService.effectiveRoleId$.subscribe(roleId => {
      this.loadSidebarData(roleId);
    });
  }

  ngOnDestroy(): void {
    this.viewRoleSub?.unsubscribe();
  }

  loadSidebarData(roleId: number | null) {
    if (!roleId) return;

    this.menuItems = this.apiService.getMenuForRole(roleId);

    const realRoleId = Number(this.currentUser?.roleId);
    this.viewingAsRoleName = roleId !== realRoleId ? this.roleNames[roleId] ?? null : null;
  }

  toggleMenu() { // 👈 Función para el botón
    this.isMenuOpen = !this.isMenuOpen;
  }

  logout() {
    this.notifSvc.disconnect();
    this.viewRoleService.reset();
    localStorage.removeItem('currentUser');
    this.router.navigate(['/auth/login']);
  }
}
