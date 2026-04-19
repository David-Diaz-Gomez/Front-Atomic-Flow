import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DirectorRoutingModule } from './director-routing-module';
import { Projects } from './projects/projects';
import { Gantt } from './gantt/gantt';
import { Resources } from './resources/resources';

@NgModule({
  declarations: [Projects, Gantt, Resources],
  imports: [
    CommonModule, 
    DirectorRoutingModule, 
    FormsModule
  ],
})
export class DirectorModule {}