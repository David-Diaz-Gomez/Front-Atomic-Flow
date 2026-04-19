import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router'; // 👈 Inyectamos ActivatedRoute
import { Api } from '../../../core/services/api';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-change-password',
  standalone: false,
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword implements OnInit {
  newPassword = '';
  confirmPassword = '';
  
  // Variables de control
  email = '';
  oldPassword = '';
  token = ''; // 👈 Guardaremos el token aquí
  isResetMode = false; // 👈 Bandera para saber qué flujo usar

  constructor(
    private apiService: Api, 
    private router: Router,
    private route: ActivatedRoute // 👈 Para leer la URL
  ) {}

  ngOnInit() {
    // 1. Intentamos capturar el token de la URL (?token=xyz)
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (this.token) {
      // Flujo A: Recuperación de contraseña (vía correo)
      this.isResetMode = true;
    } else {
      // Flujo B: Primer ingreso (vía login)
      this.isResetMode = false;
      this.email = localStorage.getItem('tempEmail') || '';
      this.oldPassword = localStorage.getItem('tempPass') || '';

      // Si no hay token Y no hay datos de login, es un acceso ilegal
      if (!this.email) {
        this.router.navigate(['/auth/login']);
      }
    }
  }

  onUpdatePassword() {
    if (!this.newPassword || !this.confirmPassword) {
      Swal.fire('Atención', 'Debes completar los campos', 'warning');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      Swal.fire('Error', 'Las contraseñas no coinciden', 'error');
      return;
    }

    this.isResetMode ? this.executeReset() : this.executeChange();
  }

  // Lógica para Recuperación (Token)
  private executeReset() {
    const data = { token: this.token, newPassword: this.newPassword };

    this.apiService.resetPassword(data).subscribe({
      next: () => this.handleSuccess('¡Cuenta Restaurada!', 'Tu acceso ha sido restablecido con éxito.'),
      error: (err) => Swal.fire('Error', err.error?.message || 'Token inválido o expirado', 'error')
    });
  }

  // Lógica para Primer Ingreso (Clave Temporal)
  private executeChange() {
    const data = { correo: this.email, currentPassword: this.oldPassword, newPassword: this.newPassword };

    this.apiService.changePassword(data).subscribe({
      next: () => {
        localStorage.removeItem('tempEmail');
        localStorage.removeItem('tempPass');
        this.handleSuccess('¡Contraseña Actualizada!', 'Tu clave temporal ha sido reemplazada.');
      },
      error: (err) => Swal.fire('Error', err.error?.message || 'No se pudo actualizar', 'error')
    });
  }

  private handleSuccess(title: string, text: string) {
    Swal.fire({ icon: 'success', title, text, timer: 2500, showConfirmButton: false });
    this.router.navigate(['/auth/login']);
  }
}