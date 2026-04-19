import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sidebar } from './components/sidebar/sidebar';
import { Footer } from './components/footer/footer';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    Sidebar,
    Footer
  ],
  imports: [
    CommonModule,
    RouterModule
  ],
  exports: [
    Sidebar,
    Footer
  ]
})
export class SharedModule { }