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
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadInitialData();
    }
  }

  loadInitialData() {

    this.api.getRoles().subscribe(res => {
      this.rolesList = res;
      console.log("Roles cargados:", this.rolesList);
    });

    this.api.getTipoDocs().subscribe(res => {
      this.docTypesList = res;
      console.log("Tipos de documento cargados:", this.docTypesList);
    });

    this.getUsers();
  }

  getUsers() {

    const filters: any = {
      page: this.currentPage,
      limit: this.itemsPerPage,
    };

    if (this.filterName) filters['search'] = this.filterName;
    if (this.filterRole) filters['role'] = this.filterRole;

    this.api.getUsers(filters).subscribe({

      next: (res: any) => {

        console.log("RESPUESTA USERS:", res);

        const data = res.data ?? [];

        this.users = data.map((u: any) => ({
          id: u.ID ?? u.id,
          nombre: u.Nombre ?? u.nombre,
          apellido: u.Apellido ?? u.apellido,
          correo: u.Correo ?? u.correo,
          numero_documento: u.Numero_Documento ?? u.numero_documento,
          id_rol_usuario: u.ID_Rol_Usuario ?? u.id_rol_usuario,

          telefono: u.Telefono ?? u.telefono,
          direccion: u.Direccion ?? u.direccion,
          eps: u.EPS ?? u.eps,
          arl: u.ARL ?? u.arl,
          rh: u.RH ?? u.rh,

          id_tipo_documento:
            u.ID_Tipo_Documento ?? u.id_tipo_documento,
          valor_hora: u.valor_hora ?? null
        }));

        console.log("USUARIOS FINALES:", this.users);

        this.totalRecords =
          res.pagination?.total_records ?? this.users.length;

        this.totalPages =
          res.pagination?.total_pages ??
          (Math.ceil(this.totalRecords / this.itemsPerPage) || 1);

        this.cdr.detectChanges();
      },

      error: (err) => {
        console.error('Error al cargar usuarios:', err);
      }

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
    return { id: null, numero_documento: '', id_tipo_doc: null, nombre: '', apellido: '', correo: '', telefono: '', direccion: '', rh: 'O+', arl: '', eps: '', id_rol: null, valor_hora: null };
  }

  openModal(user: any = null) {
    if (user) {
      this.editingUser = {
        id: user.id,
        numero_documento: user.numero_documento,
        id_tipo_doc: user.id_tipo_documento,
        nombre: user.nombre,
        apellido: user.apellido,
        correo: user.correo,
        telefono: user.telefono,
        direccion: user.direccion,
        rh: user.rh,
        arl: user.arl,
        eps: user.eps,
        id_rol: user.id_rol_usuario,
        valor_hora: user.valor_hora ?? null,
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
      title: `¿Inactivar a ${user.nombre}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'SÍ, INACTIVAR',
      cancelButtonText: 'CANCELAR'
    }).then((result) => {
      if (result.isConfirmed) {
        this.api.updateStatus(user.id, 0).subscribe({
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