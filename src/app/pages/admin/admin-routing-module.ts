import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Users } from './users/users';
import { Reports } from './reports/reports';
import { Reportes } from './reportes/reportes';

// La gestión de proyectos y la Vista General ya no viven en la vista Administrador:
// el admin las cubre cambiando a la vista Director (mismo dropdown de vista), que
// muestra TODOS los proyectos igual que aquí, así que mantenerlas duplicadas era
// redundante.
//
// 'home' es un redirect real (no un alias con component propio) a 'users' — así la URL
// que queda en el navegador es literalmente /dashboard/admin/users, que es la misma que
// usa el link "Usuarios" del sidebar, y routerLinkActive lo resalta solo por eso, sin
// tener que duplicar lógica de "qué debería estar resaltado por defecto".
const routes: Routes = [
  { path: '',               redirectTo: 'home', pathMatch: 'full' },
  { path: 'home',           redirectTo: 'users', pathMatch: 'full' },
  { path: 'users',          component: Users },
  { path: 'reports',        component: Reports },
  { path: 'reportes',       component: Reportes },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
