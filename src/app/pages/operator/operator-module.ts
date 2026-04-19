import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OperatorRoutingModule } from './operator-routing-module';
import { Calendar } from './calendar/calendar';
import { Evidences } from './evidences/evidences';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [Calendar, Evidences],
  imports: [CommonModule, OperatorRoutingModule, FormsModule],
})
export class OperatorModule {}
