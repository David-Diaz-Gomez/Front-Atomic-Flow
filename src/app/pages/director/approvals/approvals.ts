import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Swal from 'sweetalert2';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';


interface ResourceRow { id: number; nombre: string; observaciones: string; nombre_proveedor?: string | null; precio_unitario: number; cantidad: number; valor_total: number; mueble_nombre?: string | null; }
interface CarpRow extends ResourceRow { laminado: boolean; mdf: boolean; madera: boolean; enchapado: boolean; formica: boolean; chapilla: boolean; tapiz: boolean; pintura_cat: boolean; pintura_pu: boolean; ancho: number; alto: number; fondo: number; }
interface ImpRow extends ResourceRow { proveedor: string; laminado_mate: boolean; laminado_brillante: boolean; poliestireno: boolean; pet_g: boolean; acrilico: boolean; ancho: number; alto: number; ancho_m: number; alto_m: number; calibre: number; c: number; m: number; y: number; k: number; cl_w: number; m2_vinilo: number; }
interface Budget { materia_prima: ResourceRow[]; proveedores: ResourceRow[]; carpinteria: CarpRow[]; impresiones: ImpRow[]; mano_de_obra: ResourceRow[]; }

interface ReviewProject {
  id: number; nombre: string; descripcion: string;
  centro_costos: string; estado: string;
  fecha_inicio: string; fecha_fin: string;
  cliente: any; coordinador: any; director_asignado: any; director_revision: any;
  observaciones_rechazo: string | null;
  budget: Budget;
  budgetLoaded: boolean;
  budgetLoading: boolean;
}

const EMPTY_BUDGET: () => Budget = () => ({
  materia_prima: [], proveedores: [], carpinteria: [], impresiones: [], mano_de_obra: []
});

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-approvals',
  standalone: false,
  templateUrl: './approvals.html',
  styleUrl: './approvals.scss'
})
export class Approvals implements OnInit {
  projects: ReviewProject[] = [];
  solicitudesRecurso: any[] = [];
  loadingSolicitudes = false;
  loading = true;
  error = '';

  showRejectModal = false;
  rejectingProject: ReviewProject | null = null;
  rejectObservaciones = '';
  expandedBudget: number | null = null;
  activeBudgetSection = 'materia_prima';

  constructor(
    private projectSvc: ProjectService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadProjects();
      this.loadSolicitudesRecurso();
    }
  }

  loadSolicitudesRecurso(): void {
    this.loadingSolicitudes = true;
    this.api.getAllSolicitudesPendientes().subscribe({
      next: data => { this.solicitudesRecurso = data; this.loadingSolicitudes = false; this.cdr.detectChanges(); },
      error: () => { this.loadingSolicitudes = false; }
    });
  }

  aprobarSolicitudRecurso(sol: any): void {
    this.api.aprobarSolicitudRecurso(sol.id).subscribe({
      next: () => { this.loadSolicitudesRecurso(); },
      error: () => {}
    });
  }

  rechazarSolicitudRecurso(sol: any): void {
    void Swal.fire({
      title: 'Rechazar solicitud', input: 'textarea',
      inputPlaceholder: 'Motivo del rechazo (opcional)...',
      showCancelButton: true, confirmButtonText: 'Rechazar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then(r => {
      if (!r.isConfirmed) return;
      this.api.rechazarSolicitudRecurso(sol.id, r.value ?? '').subscribe({
        next: () => {
          void Swal.fire({ icon: 'info', title: 'Solicitud rechazada', timer: 1500, showConfirmButton: false });
          this.loadSolicitudesRecurso();
        },
        error: () => {}
      });
    });
  }

  get solicitudesCount(): number { return this.solicitudesRecurso.length; }

  loadProjects(): void {
    this.loading = true;
    this.error = '';
    // Carga proyectos en revisión (el back no filtra por director_revision, lo hacemos aquí)
    this.projectSvc.getProjects({ limit: 100 }).subscribe({
      next: ({ data }) => {
        const pending = data.filter(p =>
          ['en_revision', 'Por Validar', 'rechazado'].includes(p.estado ?? '')
        );

        this.projects = pending.map(p => ({
          id:                   p.id,
          nombre:               p.nombre,
          descripcion:          p.descripcion ?? '',
          centro_costos:        p.centro_costos ?? '',
          estado:               p.estado,
          fecha_inicio:         p.fecha_inicio,
          fecha_fin:            p.fecha_fin,
          cliente:              p.cliente ?? {},
          coordinador:          p.coordinador ?? {},
          director_asignado:    p.director_asignado ?? {},
          director_revision:    p.director_revision ?? {},
          observaciones_rechazo: null,
          budget:               EMPTY_BUDGET(),
          budgetLoaded:         false,
          budgetLoading:        false,
        }));

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No se pudieron cargar los proyectos para revisión.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleBudget(p: ReviewProject): void {
    if (this.expandedBudget === p.id) {
      this.expandedBudget = null;
      return;
    }
    this.expandedBudget = p.id;
    this.activeBudgetSection = 'materia_prima';
    if (!p.budgetLoaded) this.loadBudget(p);
  }

  private loadBudget(p: ReviewProject): void {
    p.budgetLoading = true;
    this.projectSvc.getProjectResources(p.id).subscribe({
      next: data => {
        p.budget = this.mapResourcesToBudget(data);
        p.budgetLoaded = true;
        p.budgetLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { p.budgetLoading = false; this.cdr.detectChanges(); }
    });
  }

  private mapResourcesToBudget(data: any): Budget {
    const budget = EMPTY_BUDGET();
    const cats: any[] = Array.isArray(data)
      ? data
      : (data?.categorias ?? data?.grupos ?? data?.secciones ?? []);

    for (const cat of cats) {
      const rawTipo = (typeof cat.tipo === 'string' ? cat.tipo : '')
        || cat.tipo_recurso?.nombre || cat.nombre || cat.label || '';
      const tipo = rawTipo.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_');
      const rawItems: any[] = cat.items ?? cat.recursos ?? cat.data ?? [];

      const items = rawItems.map((r: any) => ({
        id:              r.id ?? r.id_detalle_recurso,
        nombre:          r.recurso?.nombre || r.nombre || r.observaciones || '',
        observaciones:    r.observaciones ?? '',
        nombre_proveedor: r.nombre_proveedor ?? null,
        precio_unitario:  r.valor_unitario ?? 0,
        cantidad:         r.cantidad ?? 0,
        valor_total:      r.valor_total ?? 0,
        mueble_nombre:    r.mueble?.nombre ?? null,
        laminado:    r.laminado    ?? false, mdf:         r.mdf         ?? false,
        madera:      r.madera      ?? false, enchapado:   r.enchapado   ?? false,
        formica:     r.formica     ?? false, chapilla:    r.chapilla    ?? false,
        tapiz:       r.tapiz       ?? false, pintura_cat: r.pintura_cat ?? false,
        pintura_pu:  r.pintura_pu  ?? false,
        ancho: r.ancho_cm ?? r.ancho ?? 0,
        alto:  r.alto_cm  ?? r.alto  ?? 0,
        fondo: r.fondo_cm ?? r.fondo ?? 0,
        proveedor:          r.proveedor          ?? '',
        laminado_mate:      r.laminado_mate      ?? false,
        laminado_brillante: r.laminado_brillante ?? false,
        poliestireno:       r.poliestireno       ?? false,
        pet_g:              r.pet_g              ?? false,
        acrilico:           r.acrilico           ?? false,
        calibre:   r.calibre  ?? 0,
        c: r.c ?? 0, m: r.m ?? 0, y: r.y ?? 0, k: r.k ?? 0, cl_w: r.cl_w ?? 0,
        // dimensiones en metros (decimales)
        ancho_m: r.ancho_m ?? 0,
        alto_m:  r.alto_m  ?? 0,
        m2_vinilo: r.m2_vinilo ?? parseFloat(((r.ancho_m ?? 0) * (r.alto_m ?? 0)).toFixed(4)),
      }));

      if (tipo === 'materia_prima')        budget.materia_prima = items;
      else if (tipo === 'proveedores')     budget.proveedores   = items;
      else if (tipo.includes('carpinteria') || tipo.includes('carpinter'))
                                           budget.carpinteria   = items as CarpRow[];
      else if (tipo === 'impresiones')     budget.impresiones   = items as ImpRow[];
      else if (tipo === 'mano_de_obra')    budget.mano_de_obra  = items;
    }
    return budget;
  }

  setBudgetSection(s: string): void { this.activeBudgetSection = s; }

  budgetSectionTotal(budget: Budget, section: keyof Budget): number {
    return (budget[section] as ResourceRow[]).reduce((s, r) => s + (r.valor_total ?? 0), 0);
  }

  budgetGrandTotal(budget: Budget): number {
    return (['materia_prima','proveedores','carpinteria','impresiones','mano_de_obra'] as (keyof Budget)[])
      .reduce((s, k) => s + this.budgetSectionTotal(budget, k), 0);
  }

  carpMaterials(row: CarpRow): string {
    const m: string[] = [];
    if (row.laminado)    m.push('Laminado');
    if (row.mdf)         m.push('MDF');
    if (row.madera)      m.push('Madera');
    if (row.enchapado)   m.push('Enchapado');
    if (row.formica)     m.push('Formica');
    if (row.chapilla)    m.push('Chapilla');
    if (row.tapiz)       m.push('Tapiz');
    if (row.pintura_cat) m.push('P.Cat');
    if (row.pintura_pu)  m.push('P.PU');
    return m.join(', ') || '—';
  }

  approve(project: ReviewProject): void {
    void Swal.fire({
      title: `¿Aprobar "${project.nombre}"?`,
      text: 'El proyecto pasará a estado Aprobado y el director asignado podrá crear fases.',
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, Aprobar', cancelButtonText: 'Cancelar', confirmButtonColor: '#00A859'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.projectSvc.approveProject(project.id, true).subscribe({
        next: () => {
          project.estado = 'aprobado';
          void Swal.fire({ icon: 'success', title: '¡Aprobado!', text: `"${project.nombre}" fue aprobado.`, timer: 2000 });
          this.cdr.detectChanges();
        },
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo aprobar el proyecto', 'error')
      });
    });
  }

  openRejectModal(project: ReviewProject): void {
    this.rejectingProject = project;
    this.rejectObservaciones = '';
    this.showRejectModal = true;
  }

  closeRejectModal(): void { this.showRejectModal = false; this.rejectingProject = null; }

  confirmReject(): void {
    if (!this.rejectObservaciones.trim()) {
      void Swal.fire('Atención', 'Debes escribir las observaciones de rechazo', 'warning'); return;
    }
    if (!this.rejectingProject) return;

    // Usa PATCH /estado con 'rechazado' (no hay endpoint dedicado en el back)
    this.projectSvc.changeProjectStatus(this.rejectingProject.id, 'rechazado').subscribe({
      next: () => {
        if (this.rejectingProject) {
          this.rejectingProject.estado = 'rechazado';
          this.rejectingProject.observaciones_rechazo = this.rejectObservaciones;
        }
        void Swal.fire({ icon: 'info', title: 'Rechazado', text: 'El proyecto fue devuelto con observaciones.', timer: 2000 });
        this.closeRejectModal();
        this.cdr.detectChanges();
      },
      error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo rechazar el proyecto', 'error')
    });
  }

  formatCOP(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v ?? 0);
  }
  formatDate(s: string): string {
    if (!s) return '';
    const p = s.split(/[-T]/);
    return `${parseInt(p[2]??'1',10)} ${MONTHS[parseInt(p[1]??'1',10)-1]??''} ${p[0]??''}`;
  }

  get pendingCount():  number { return this.projects.filter(p => ['en_revision','Por Validar'].includes(p.estado)).length; }
  get approvedCount(): number { return this.projects.filter(p => p.estado === 'aprobado').length; }
  get rejectedCount(): number { return this.projects.filter(p => p.estado === 'rechazado').length; }
}
