import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared-module';
import { SuperoperarioRoutingModule } from './superoperario-routing-module';
import { SuperOpHome } from './home/home';

@NgModule({
  declarations: [
    SuperOpHome,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    SharedModule,
    SuperoperarioRoutingModule,
  ],
})
export class SuperoperarioModule {}
