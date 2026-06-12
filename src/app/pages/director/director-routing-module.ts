import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Home } from './home/home';
import { ProjectForm } from './project-form/project-form';
import { ProjectDetail } from './project-detail/project-detail';
import { Gantt } from './gantt/gantt';
import { Approvals } from './approvals/approvals';
import { GanttGeneral }        from '../../shared/components/gantt-general/gantt-general';
import { PlantillasFases }     from '../../shared/components/plantillas-fases/plantillas-fases';
import { DirectorEvidencias }  from './evidencias/evidencias';

const routes: Routes = [
  { path: '',                            redirectTo: 'home', pathMatch: 'full' },
  { path: 'home',                        component: Home },
  { path: 'project-new',                 component: ProjectForm },
  { path: 'project/:id',                 component: ProjectDetail },
  { path: 'gantt',                       component: Gantt },
  { path: 'approvals',                   component: Approvals },
  { path: 'evidencias',                  component: DirectorEvidencias },
  { path: 'vista-general',               component: GanttGeneral },
  { path: 'plantillas/:proyectoId',      component: PlantillasFases },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DirectorRoutingModule {}
