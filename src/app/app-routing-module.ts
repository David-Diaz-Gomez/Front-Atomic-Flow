import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login }            from './pages/auth/login/login';
import { Recover }          from './pages/auth/recover/recover';
import { ChangePassword }   from './pages/auth/change-password/change-password';
import { OperarioPassword } from './pages/auth/operario-password/operario-password';
import { Dashboard } from './pages/dashboard/dashboard';

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
    children: [
      { path: 'admin', loadChildren: () => import('./pages/admin/admin-module').then(m => m.AdminModule) },
      { path: 'director', loadChildren: () => import('./pages/director/director-module').then(m => m.DirectorModule) },
      { path: 'coordinator', loadChildren: () => import('./pages/coordinator/coordinator-module').then(m => m.CoordinatorModule) },
      { path: 'operator',       loadChildren: () => import('./pages/operator/operator-module').then(m => m.OperatorModule) },
      { path: 'superoperario',  loadChildren: () => import('./pages/superoperario/superoperario-module').then(m => m.SuperoperarioModule) },
      { path: '', redirectTo: 'admin', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'auth/login' } 
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
