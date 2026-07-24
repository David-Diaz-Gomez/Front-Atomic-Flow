import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { Sidebar } from './components/sidebar/sidebar';
import { Footer } from './components/footer/footer';
import { NotifBellComponent } from './components/notif-bell/notif-bell';
import { GanttGeneral } from './components/gantt-general/gantt-general';
import { PlantillasFases } from './components/plantillas-fases/plantillas-fases';
import { RecursosDetalle } from './components/recursos-detalle/recursos-detalle';
import { RoleViewSwitcher } from './components/role-view-switcher/role-view-switcher';

@NgModule({
  declarations: [
    Sidebar,
    Footer,
    NotifBellComponent,
    GanttGeneral,
    PlantillasFases,
    RecursosDetalle,
    RoleViewSwitcher,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
  ],
  exports: [
    Sidebar,
    Footer,
    NotifBellComponent,
    GanttGeneral,
    PlantillasFases,
    RecursosDetalle,
    RoleViewSwitcher,
  ],
})
export class SharedModule {}
