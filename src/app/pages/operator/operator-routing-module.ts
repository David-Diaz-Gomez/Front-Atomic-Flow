import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OpShell }         from './shell/op-shell';
import { OpHome }          from './home/home';
import { OpCalendar }      from './calendar/calendar';
import { OpNotifications } from './notifications/notifications';
import { OpTaskDetail }    from './task-detail/task-detail';
import { OpProjects }      from './projects/projects';
import { Evidences }       from './evidences/evidences';

const routes: Routes = [
  {
    path: '',
    component: OpShell,
    children: [
      { path: '',              redirectTo: 'home', pathMatch: 'full' },
      { path: 'home',          component: OpHome },
      { path: 'calendar',      component: OpCalendar },
      { path: 'projects',      component: OpProjects },
      { path: 'notifications', component: OpNotifications },
      { path: 'task/:id',      component: OpTaskDetail },
      { path: 'evidences',     component: Evidences },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OperatorRoutingModule {}
