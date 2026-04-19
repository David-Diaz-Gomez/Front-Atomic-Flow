import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Projects } from './projects/projects';
import { Gantt } from './gantt/gantt';
import { Resources } from './resources/resources';

const routes: Routes = [
  { path: '', redirectTo: 'projects', pathMatch: 'full' },
  { path: 'home', component: Projects },
  { path: 'projects', component: Projects },
  { path: 'gantt', component: Gantt },
  { path: 'resources', component: Resources }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DirectorRoutingModule {}
