import { Component } from '@angular/core';
import { Api } from '../../../core/services/api';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-recover',
  standalone: false,
  templateUrl: './recover.html',
  styleUrl: './recover.scss',
})
export class Recover {
  email: string = '';
  isLoading: boolean = false;

  constructor(private apiService: Api) {}

  onRecover() {
    if (!this.email) {
      Swal.fire('Atención', 'Por favor ingresa un correo electrónico válido.', 'warning');
      return;
    }

    this.isLoading = true;

    this.apiService.forgotPassword(this.email).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        Swal.fire({
          icon: 'success',
          title: 'Solicitud Procesada',
          text: res.message || 'Si el correo está registrado, recibirás un enlace de restauración.',
          confirmButtonColor: '#00d4ff'
        });
        this.email = ''; // Limpiamos el campo
      },
      error: (err) => {
        this.isLoading = false;
        Swal.fire('Error', err.error?.message || 'No se pudo procesar la solicitud en este momento.', 'error');
      }
    });
  }
}