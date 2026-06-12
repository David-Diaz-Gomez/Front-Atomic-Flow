import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../../core/services/api';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit {
  menuItems: any[] = [];
  currentUser: any = null;
  isMenuOpen = false; // 👈 Lo único nuevo

  constructor(private apiService: Api, private router: Router, private notifSvc: NotificationService) {}

  ngOnInit(): void {
  this.loadSidebarData();
}

loadSidebarData() {
  const userStr = localStorage.getItem('currentUser');
  if (userStr) {
    this.currentUser = JSON.parse(userStr);
    
    // 👈 CAMBIO CLAVE: Usamos roleId en lugar de role
    // Y nos aseguramos de que sea un número
    const roleId = Number(this.currentUser.roleId); 
    
    this.menuItems = this.apiService.getMenuForRole(roleId);
    
    console.log('Menú cargado para el rol:', roleId, this.menuItems);
  }
}

  toggleMenu() { // 👈 Función para el botón
    this.isMenuOpen = !this.isMenuOpen;
  }

  logout() {
    this.notifSvc.disconnect();
    localStorage.removeItem('currentUser');
    this.router.navigate(['/auth/login']);
  }
}