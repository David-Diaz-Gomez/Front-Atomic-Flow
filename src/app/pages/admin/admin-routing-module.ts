import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Projects } from './projects/projects';
import { Users } from './users/users';
import { Reports } from './reports/reports';
import { GanttGeneral } from '../../shared/components/gantt-general/gantt-general';

const routes: Routes = [
  { path: '',               redirectTo: 'home', pathMatch: 'full' },
  { path: 'home',           component: Projects },
  { path: 'users',          component: Users },
  { path: 'reports',        component: Reports },
  { path: 'vista-general',  component: GanttGeneral },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
