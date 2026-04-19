import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../../core/services/api'; // Asegúrate de que la ruta sea correcta
import Swal from 'sweetalert2';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login {
  email = '';
  password = '';
  isLoading = false;

  // 👈 TIENES que inyectar el apiService aquí
  constructor(private apiService: Api, private router: Router) {}

  // login.ts

// login.ts

// login.ts

onLogin() {
  if (!this.email || !this.password) return;
  this.isLoading = true;

  this.apiService.login(this.email, this.password).subscribe((res: any) => {
    this.isLoading = false;
    
    if (res.success) {
      // 1. Verificación de cambio de contraseña
      if (res.user.mustChange === 1) {
        localStorage.setItem('tempEmail', this.email);
        localStorage.setItem('tempPass', this.password);
        this.router.navigate(['/auth/change-password']);
        return;
      }

      // 2. Redirección por Rol
      // 🚀 CORRECCIÓN: 'operator' debe coincidir con el path del RoutingModule
      const roleRoutes: any = { 
        1: 'admin', 
        2: 'coordinator', 
        3: 'director', 
        4: 'operator' // Cambiado de 'operario' a 'operator'
      };

      const targetRoute = roleRoutes[res.user.roleId];

      if (targetRoute) {
        this.router.navigate([`/dashboard/${targetRoute}/home`]);
      } else {
        console.error("ID de Rol no reconocido:", res.user.roleId);
        Swal.fire('Error', 'Tu rol no tiene un panel asignado.', 'error');
      }
    } else {
      Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: 'Correo o contraseña incorrectos' });
    }
  });
}
}