import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login }            from './pages/auth/login/login';
import { Recover }          from './pages/auth/recover/recover';
import { ChangePassword }   from './pages/auth/change-password/change-password';
import { OperarioPassword } from './pages/auth/operario-password/operario-password';
import { Dashboard } from './pages/dashboard/dashboard';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

const routes: Routes = [
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
  {
    path: 'auth',
    children: [
      { path: 'login',              component: Login },
      { path: 'recover',            component: Recover },
      { path: 'change-password',    component: ChangePassword },
      { path: 'operario-password',  component: OperarioPassword }
    ]
  },
  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [authGuard],
    children: [
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: [1] },
        loadChildren: () => import('./pages/admin/admin-module').then(m => m.AdminModule)
      },
      {
        path: 'director',
        canActivate: [roleGuard],
        data: { roles: [2] },
        loadChildren: () => import('./pages/director/director-module').then(m => m.DirectorModule)
      },
      {
        path: 'coordinator',
        canActivate: [roleGuard],
        data: { roles: [3] },
        loadChildren: () => import('./pages/coordinator/coordinator-module').then(m => m.CoordinatorModule)
      },
      {
        path: 'operator',
        canActivate: [roleGuard],
        data: { roles: [4] },
        loadChildren: () => import('./pages/operator/operator-module').then(m => m.OperatorModule)
      },
      {
        path: 'superoperario',
        canActivate: [roleGuard],
        data: { roles: [5] },
        loadChildren: () => import('./pages/superoperario/superoperario-module').then(m => m.SuperoperarioModule)
      },
      { path: '', redirectTo: 'admin', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'auth/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
