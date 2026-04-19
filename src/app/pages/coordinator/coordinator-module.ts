import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoordinatorRoutingModule } from './coordinator-routing-module';
import { Phases } from './phases/phases';
import { Tasks } from './tasks/tasks';
import { Approvals } from './approvals/approvals';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [Phases, Tasks, Approvals],
  imports: [CommonModule, CoordinatorRoutingModule, FormsModule],
})
export class CoordinatorModule {}
