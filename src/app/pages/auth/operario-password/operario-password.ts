import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../../../core/services/api';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-operario-password',
  standalone: false,
  templateUrl: './operario-password.html',
  styleUrl: './operario-password.scss',
})
export class OperarioPassword implements OnInit {
  token        = '';
  newPassword  = '';
  confirmPass  = '';
  isLoading    = false;
  done         = false;
  showNew      = false;
  showConfirm  = false;

  constructor(private route: ActivatedRoute, private api: Api) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      void Swal.fire('Enlace inválido', 'El enlace no es válido o ha expirado.', 'error');
    }
  }

  get canSubmit(): boolean {
    return !!this.token && this.newPassword.length >= 6 && this.newPassword === this.confirmPass;
  }

  submit(): void {
    if (this.newPassword !== this.confirmPass) {
      void Swal.fire('Atención', 'Las contraseñas no coinciden.', 'warning'); return;
    }
    if (this.newPassword.length < 6) {
      void Swal.fire('Atención', 'Mínimo 6 caracteres.', 'warning'); return;
    }
    this.isLoading = true;
    this.api.setOperarioPassword(this.token, this.newPassword).subscribe({
      next: () => { this.isLoading = false; this.done = true; },
      error: (err: any) => {
        this.isLoading = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo actualizar la contraseña.', 'error');
      },
    });
  }
}
