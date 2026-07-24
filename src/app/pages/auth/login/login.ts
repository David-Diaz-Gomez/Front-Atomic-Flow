import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../../core/services/api'; // Asegúrate de que la ruta sea correcta
import { NotificationService } from '../../../shared/services/notification.service';
import { ViewRoleService } from '../../../core/services/view-role.service';
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
  constructor(
    private apiService: Api,
    private router: Router,
    private notifSvc: NotificationService,
    private viewRoleService: ViewRoleService
  ) {}

  // login.ts

// login.ts

// login.ts

onLogin() {
  if (!this.email || !this.password) return;
  this.isLoading = true;

  this.apiService.login(this.email, this.password).subscribe({
    next: (res: any) => {
      // ✅ CASO DE ÉXITO: El servidor respondió 200 OK
      this.isLoading = false; 
      
      if (res.success) {
        this.notifSvc.reconnect();
        // Cada login nuevo debe arrancar en el rol real, no en la última vista
        // (Director/Otros roles) que el admin haya dejado activa en una sesión previa.
        this.viewRoleService.reset();

        // 1. Verificación de cambio de contraseña
        if (res.user.mustChange === 1 || res.user.mustChange === true) {
          localStorage.setItem('tempEmail', this.email);
          localStorage.setItem('tempPass', this.password);
          this.router.navigate(['/auth/change-password']);
          return;
        }

        // 2. Redirección por Rol
        const roleRoutes: any = {
          1: 'admin',
          2: 'director',
          3: 'coordinator',
          4: 'operator',
          5: 'superoperario',
        };

        const targetRoute = roleRoutes[res.user.roleId];

        if (targetRoute) {
          this.router.navigate([`/dashboard/${targetRoute}/home`]);
        } else {
          console.error("ID de Rol no reconocido:", res.user.roleId);
          Swal.fire('Error', 'Tu rol no tiene un panel asignado.', 'error');
        }
      }
    },
    error: (err) => {
      // ❌ CASO DE ERROR: Aquí es donde "frenamos" el estado
      // El SweetAlert ya sale desde el servicio (api.ts), así que aquí solo limpiamos el loader.
      this.isLoading = false; 
      console.log('Error en login detectado en el componente, liberando loader...');
    }
  });
}


}