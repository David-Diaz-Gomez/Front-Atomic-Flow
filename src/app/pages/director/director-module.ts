import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { DirectorRoutingModule } from './director-routing-module';

import { Home }                from './home/home';
import { ProjectForm }        from './project-form/project-form';
import { ProjectDetail }      from './project-detail/project-detail';
import { Gantt }              from './gantt/gantt';
import { Approvals }          from './approvals/approvals';
import { DirectorEvidencias } from './evidencias/evidencias';
import { EstadosCompra }      from './estados-compra/estados-compra';

@NgModule({
  declarations: [
    Home,
    ProjectForm,
    ProjectDetail,
    Gantt,
    Approvals,
    DirectorEvidencias,
    EstadosCompra,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SharedModule,
    DirectorRoutingModule,
  ],
})
export class DirectorModule {}
