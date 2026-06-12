import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CoordHome } from './home/home';
import { CoordProjectDetail } from './project-detail/project-detail';
import { CoordGantt } from './gantt/gantt';
import { PlantillasFases } from '../../shared/components/plantillas-fases/plantillas-fases';
import { CoordEvidences } from './evidences/evidences';

const routes: Routes = [
  { path: '',                         redirectTo: 'home', pathMatch: 'full' },
  { path: 'home',                     component: CoordHome },
  { path: 'project/:id',              component: CoordProjectDetail },
  { path: 'gantt',                    component: CoordGantt },
  { path: 'evidences',                component: CoordEvidences },
  { path: 'plantillas/:proyectoId',   component: PlantillasFases },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CoordinatorRoutingModule {}
