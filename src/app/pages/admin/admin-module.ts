import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRoutingModule } from './admin-routing-module';
import { Projects } from './projects/projects';
import { Users } from './users/users';
import { Reports } from './reports/reports';
import { Reportes } from './reportes/reportes';
import { SharedModule } from '../../shared/shared-module';

@NgModule({
  declarations: [
    Projects,
    Users,
    Reports,
    Reportes,
  ],
  imports: [
    CommonModule,
    FormsModule,
    AdminRoutingModule,
    SharedModule,
  ]
})
export class AdminModule { }