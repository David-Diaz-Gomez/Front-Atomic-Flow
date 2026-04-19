import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Projects } from './projects/projects';
import { Users } from './users/users';
import { Reports } from './reports/reports';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: Projects }, // Tu componente de proyectos
  { path: 'users', component: Users },
  { path: 'reports', component: Reports }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
