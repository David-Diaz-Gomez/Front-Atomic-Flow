import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Calendar } from './calendar/calendar';
import { Evidences } from './evidences/evidences';

const routes: Routes = [
  { path: '', redirectTo: 'calendar', pathMatch: 'full' },
  { path: 'home', component: Calendar },
  { path: 'calendar', component: Calendar },
  { path: 'evidences', component: Evidences }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OperatorRoutingModule {}
