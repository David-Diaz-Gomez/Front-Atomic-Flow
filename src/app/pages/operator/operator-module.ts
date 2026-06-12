import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared-module';
import { OperatorRoutingModule } from './operator-routing-module';
import { OpShell }         from './shell/op-shell';
import { OpHome }          from './home/home';
import { OpCalendar }      from './calendar/calendar';
import { OpNotifications } from './notifications/notifications';
import { OpTaskDetail }    from './task-detail/task-detail';
import { OpProjects }      from './projects/projects';
import { OpNav }           from './nav/op-nav';
import { Evidences }       from './evidences/evidences';

@NgModule({
  declarations: [
    OpShell,
    OpHome,
    OpCalendar,
    OpNotifications,
    OpTaskDetail,
    OpProjects,
    OpNav,
    Evidences,
  ],
  imports: [CommonModule, FormsModule, RouterModule, OperatorRoutingModule, SharedModule],
})
export class OperatorModule {}
