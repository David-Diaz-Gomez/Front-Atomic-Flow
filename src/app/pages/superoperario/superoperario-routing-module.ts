import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SuperOpHome } from './home/home';

const routes: Routes = [
  { path: '',    redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: SuperOpHome },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SuperoperarioRoutingModule {}
