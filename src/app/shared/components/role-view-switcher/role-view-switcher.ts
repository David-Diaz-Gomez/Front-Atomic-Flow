import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ViewRoleService } from '../../../core/services/view-role.service';

const VIEW_ROUTES: Record<number, string> = {
  1: 'admin',
  2: 'director',
};

@Component({
  selector: 'app-role-view-switcher',
  standalone: false,
  templateUrl: './role-view-switcher.html',
  styleUrl: './role-view-switcher.scss',
})
export class RoleViewSwitcher implements OnInit {
  isRealAdmin = false;
  effectiveRoleId: number | null = null;

  // "Otros roles" cubre lo que antes eran Director + Coordinador — el admin ya no
  // tiene una vista Coordinador separada, la asignación de recursos ahora vive
  // dentro de la vista Director (ver project-detail del director, botón "Asignar").
  readonly options = [
    { roleId: 1, label: 'Administrador' },
    { roleId: 2, label: 'Otros roles' },
  ];

  constructor(private viewRoleService: ViewRoleService, private router: Router) {}

  ngOnInit(): void {
    this.isRealAdmin = this.viewRoleService.isRealAdmin();
    if (!this.isRealAdmin) return;

    this.viewRoleService.effectiveRoleId$.subscribe(roleId => {
      this.effectiveRoleId = roleId;
    });
  }

  onChangeView(roleId: number): void {
    this.viewRoleService.setViewRole(Number(roleId));
    const route = VIEW_ROUTES[Number(roleId)];
    if (route) this.router.navigate([`/dashboard/${route}/home`]);
  }
}
