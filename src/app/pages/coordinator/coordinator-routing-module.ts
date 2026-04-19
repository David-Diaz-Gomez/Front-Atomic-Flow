import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Phases } from './phases/phases';
import { Tasks } from './tasks/tasks';
import { Approvals } from './approvals/approvals';

const routes: Routes = [
  { path: '', redirectTo: 'phases', pathMatch: 'full' },
  { path: 'home', component: Phases },
  { path: 'phases', component: Phases },
  { path: 'tasks', component: Tasks },
  { path: 'approvals', component: Approvals }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CoordinatorRoutingModule {}
