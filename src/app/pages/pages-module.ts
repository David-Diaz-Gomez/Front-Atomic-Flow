import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms'; // NECESARIO para los formularios
import { RouterModule } from '@angular/router'; // NECESARIO para el <router-outlet>
import { SharedModule } from '../shared/shared-module';
import { CommonModule } from '@angular/common';
import { Dashboard } from './dashboard/dashboard';

import { Login } from './auth/login/login';
import { Recover } from './auth/recover/recover';
import { ChangePassword } from './auth/change-password/change-password';

@NgModule({
  declarations: [
    Dashboard,
    Login,
    Recover,
    ChangePassword
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SharedModule // Importamos Sidebar y Footer
  ]
})
export class PagesModule { }