import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';

import { CoordinatorRoutingModule } from './coordinator-routing-module';
import { CoordHome }          from './home/home';
import { CoordProjectDetail } from './project-detail/project-detail';
import { CoordGantt }         from './gantt/gantt';
import { CoordEvidences }     from './evidences/evidences';
import { CoordEstadosCompra } from './estados-compra/estados-compra';

@NgModule({
  declarations: [CoordHome, CoordProjectDetail, CoordGantt, CoordEvidences, CoordEstadosCompra],
  imports: [CommonModule, FormsModule, RouterModule, SharedModule, CoordinatorRoutingModule],
})
export class CoordinatorModule {}
