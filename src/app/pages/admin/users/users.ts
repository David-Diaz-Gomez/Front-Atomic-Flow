import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Api } from '../../../core/services/api';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-users',
  templateUrl: './users.html',
  styleUrls: ['./users.scss'],
  standalone: false
})
export class Users implements OnInit {
  users: any[] = [];
  rolesList: any[] = [];
  docTypesList: any[] = [];
  
  showModal = false;
  editingUser: any = this.initUser();

  // Modelos de filtros
  filterName = ''; 
  filterRole = '';
  filterCC = ''; // Si el API tiene parámetro para esto, agrégalo al objeto filters abajo

  // Control de Paginación
  currentPage = 1;
  itemsPerPage = 5; // Asegúrate de enviar esto para que el backend no use su default de 10
  totalPages = 1;
  totalRecords = 0;

  constructor(
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadInitialData();
    }
  }

  loadInitialData() {
    this.api.getRoles().subscribe(res => this.rolesList = res);
    this.api.getTipoDocs().subscribe(res => this.docTypesList = res);
    this.getUsers();
  }

  getUsers() {
    // 📦 Empacamos TODO lo que el Swagger nos pide
    const filters = {
      page: this.currentPage,
      limit: this.itemsPerPage,
      search: this.filterName,
      role: this.filterRole,
      // Si el backend tuviera numero_documento como filtro, lo pondrías aquí:
      // numero_documento: this.filterCC 
    };

    this.api.getUsers(filters).subscribe({
      next: (res: any) => {
        // IMPORTANTE: res debe traer { total, users, ... }
        if (res && res.users) {
          this.users = res.users;
          this.totalRecords = res.total;
          
          // Calculamos páginas basándonos en el TOTAL real de la base de datos
          this.totalPages = Math.ceil(this.totalRecords / this.itemsPerPage) || 1;
        } else {
          this.users = [];
          this.totalRecords = 0;
          this.totalPages = 1;
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error("Error al filtrar:", err)
    });
  }

  onFilterChange() {
    this.currentPage = 1; // Siempre volvemos a la 1 al buscar algo nuevo
    this.getUsers();
  }

  changePage(step: number) {
    const targetPage = this.currentPage + step;
    if (targetPage >= 1 && targetPage <= this.totalPages) {
      this.currentPage = targetPage;
      this.getUsers(); // El API se encarga de traer la página correcta
    }
  }

  // --- ACCIONES (Sin cambios, pero asegúrate de que el HTML llame a onFilterChange) ---
  initUser() {
    return { ID: null, numero_documento: '', id_tipo_doc: null, nombre: '', apellido: '', correo: '', telefono: '', direccion: '', rh: 'O+', arl: '', eps: '', id_rol: null };
  }

  openModal(user: any = null) {
    if (user) {
      this.editingUser = {
        ID: user.ID,
        numero_documento: user.Numero_Documento,
        id_tipo_doc: user.ID_Tipo_Documento,
        nombre: user.Nombre,
        apellido: user.Apellido,
        correo: user.Correo,
        telefono: user.Telefono,
        direccion: user.Direccion,
        rh: user.RH,
        arl: user.ARL,
        eps: user.EPS,
        id_rol: user.ID_Rol_Usuario
      };
    } else {
      this.editingUser = this.initUser();
    }
    this.showModal = true;
  }

  save() {
    if (!this.editingUser.nombre || !this.editingUser.correo || !this.editingUser.id_rol) {
      Swal.fire('Atención', 'Datos obligatorios incompletos.', 'warning');
      return;
    }

    // El servicio api.ts ahora decide si es POST o PUT basado en el ID
    this.api.saveUser(this.editingUser).subscribe({
      next: (res) => {
        this.showModal = false;
        this.getUsers();
        Swal.fire({
          icon: 'success',
          title: this.editingUser.ID ? '¡Actualizado!' : '¡Registrado!',
          text: res.message || 'La base de datos Atómica ha sido actualizada.',
          timer: 2000
        });
      },
      error: (err) => Swal.fire('Error', err.error?.message || 'Error en la operación', 'error')
    });
  }

  // users.ts

confirmDelete(user: any) {
  Swal.fire({
    title: `¿Inactivar a ${user.Nombre}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'SÍ, INACTIVAR',
    cancelButtonText: 'CANCELAR'
  }).then((result) => {
    if (result.isConfirmed) {
      // Al corregir el 404 del backend, este bloque "next" por fin se ejecutará
      this.api.updateStatus(user.ID, 0).subscribe({
        next: () => {
          Swal.fire('¡Logrado!', 'El usuario ya no aparecerá en la lista activa.', 'success');
          this.getUsers(); // 👈 Esto recargará la lista y el usuario "desaparecerá"
        },
        error: (err) => {
          console.error(err);
          Swal.fire('Error', 'El servidor respondió con un error, aunque quizás el cambio se hizo.', 'error');
        }
      });
    }
  });
} 
}