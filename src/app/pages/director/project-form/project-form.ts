import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';
import { Api } from '../../../core/services/api';

// ── Mueble (local hasta guardar) ────────────────────────────────────────────
export interface Mueble {
  tempId: number;   // ID local mientras no se guarda en BD
  nombre: string;
  fecha_fin: string;
}

// ── Interfaces de presupuesto ───────────────────────────────────────────────
export interface ResourceRow {
  id: number; nombre: string; observaciones: string; nombre_proveedor?: string;
  precio_unitario: number; cantidad: number; valor_total: number;
  detalle_id?: number; id_recurso?: number;
  id_mueble?: number | null;
  _sugg?: any[]; _showSugg?: boolean; _searching?: boolean;
}
export interface CarpRow {
  id: number; nombre: string; cantidad: number;
  laminado: boolean; mdf: boolean; madera: boolean; enchapado: boolean;
  formica: boolean; chapilla: boolean; tapiz: boolean;
  pintura_cat: boolean; pintura_pu: boolean;
  ancho: number; alto: number; fondo: number;
  precio_unitario: number; valor_total: number;
  detalle_id?: number; id_mueble?: number | null;
  _sugg?: any[]; _showSugg?: boolean; _searching?: boolean;
}
export interface ImpRow {
  id: number;
  detalle_id?: number; id_mueble?: number | null;
  nombre: string;
  proveedor: 'GEN' | 'ESP';
  cantidad: number;
  ancho_m: number;
  alto_m: number;
  calibre: number;
  cmyk_uv: boolean;
  cl_w_uv: boolean;
  laminado_mate: boolean;
  laminado_brillante: boolean;
  laminado_floor_graphic: boolean;
  poliestireno: boolean;
  polipropileno: boolean;
  pvc: boolean;
  acrilico: boolean;
  pet_g: boolean;
  maulet: boolean;
  otros: boolean;
  c: number; m: number; y: number; k: number;
  cl: number;
  w_ink: number;
  m2_vinilo: number;
  precio_unitario: number;
  valor_total: number;
  _sugg?: any[]; _showSugg?: boolean; _searching?: boolean;
}
export interface Budget {
  materia_prima: ResourceRow[];
  proveedores: ResourceRow[];
  carpinteria: CarpRow[];
  impresiones: ImpRow[];
  mano_de_obra: ResourceRow[];
}

export interface MachineOcc {
  nombre: string; porcentaje: number;
  proyectos: string[]; estado: 'ok' | 'alta' | 'saturada';
}
export interface ConflictSugg {
  fecha_inicio: string; fecha_fin: string;
  ocupacion_max: number; viabilidad: 'optima' | 'alta' | 'media';
}
export interface ConflictResult {
  viable: boolean; ocupacion_maxima: number;
  maquinas: MachineOcc[];
  conflictos: Array<{ proyecto_nombre: string; recurso_nombre: string; ocupado_desde: string; ocupado_hasta: string }>;
  sugerencias: ConflictSugg[];
}

type Section = 'general'|'materia_prima'|'proveedores'|'carpinteria'|'impresiones'|'mano_de_obra'|'resumen';
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-project-form',
  standalone: false,
  templateUrl: './project-form.html',
  styleUrl: './project-form.scss'
})
export class ProjectForm implements OnInit {
  isEdit = false;
  editId: number | null = null;
  activeSection: Section = 'general';
  saving = false;

  form: {
    nombre: string; codigo: string; descripcion: string; centro_costos: string;
    fecha_inicio: string; fecha_fin: string;
    id_cliente: number | null;
    id_coordinador: number | null;
    id_director_asignado: number | null;
    id_director_revision: number | null;
    link_trello: string;
  } = {
    nombre: '', codigo: '', descripcion: '', centro_costos: '',
    fecha_inicio: '', fecha_fin: '',
    id_cliente: null, id_coordinador: null, id_director_asignado: null, id_director_revision: null,
    link_trello: ''
  };

  selectedImageFile: File | null = null;
  imagePreviewUrl: string | null = null;
  currentLinkImagen: string | null = null;

  // Snapshot del proyecto cargado, usado para detectar qué cambió al guardar
  originalEstado = '';
  originalFechaInicio = '';
  originalFechaFin = '';
  originalBudgetSnapshot = '';

  budget: Budget = { materia_prima: [], proveedores: [], carpinteria: [], impresiones: [], mano_de_obra: [] };
  muebles: Mueble[] = [];

  // Modal mueble
  showMuebleModal = false;
  newMuebleForm: { nombre: string; fecha_fin: string } = { nombre: '', fecha_fin: '' };
  editingMuebleTempId: number | null = null;

  clients: any[] = [];
  coordinators: any[] = [];
  directors: any[] = [];
  loadingCatalogs = false;

  // tipo_recurso IDs keyed by normalized name — loaded from GET /tipos-recurso
  tipoIds: Record<string, number> = {};
  private _searchTimer: any = null;
  suggPos = { top: 0, left: 0, width: 220 };

  impPrecios = {
    sustrato_gen: 5000,
    sustrato_esp: 22500,
    precio_cmyk:  625,
    precio_clw:   625,
  };

  private normTipo(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  }

  private buildTipoIds(tipos: any[]): void {
    this.tipoIds = {};
    for (const t of (tipos ?? [])) {
      this.tipoIds[this.normTipo(t.nombre ?? '')] = t.id;
    }
  }

  // Conflict check
  conflictResult: ConflictResult | null = null;
  checkingConflicts = false;
  appliedSuggestion: ConflictSugg | null = null;

  // Inline client creation
  showClientModal = false;
  newClientForm: { nombre: string } = { nombre: '' };
  clientSimilares: string[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private apiSvc: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const idParam = this.route.snapshot.queryParamMap.get('id');
      if (idParam) {
        this.isEdit = true;
        this.editId = parseInt(idParam, 10);
        this.loadForEdit(this.editId);
      } else {
        this.loadCatalogs();
      }
    }
  }

  /** Carga catálogos (flujo de nuevo proyecto). */
  loadCatalogs(): void {
    this.loadingCatalogs = true;
    forkJoin({
      clients:      this.catalogSvc.getClientes({ limit: 100 }).pipe(catchError(() => of({ data: [], pagination: {} }))),
      coordinators: this.catalogSvc.getUsersByRole(3).pipe(catchError(() => of([]))),
      directors:    this.catalogSvc.getUsersByRole(2).pipe(catchError(() => of([]))),
      tipos:        this.catalogSvc.getTiposRecurso().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ clients, coordinators, directors, tipos }) => {
        this.clients      = clients.data;
        this.coordinators = coordinators;
        this.directors    = directors;
        this.buildTipoIds(tipos);
        // Solo se autoselecciona si el usuario logueado es efectivamente un Director
        // (aparece en el catálogo). Si no (p. ej. un Administrador creando el proyecto
        // desde la vista Director), queda sin asignar y debe elegirse manualmente.
        const currentUserId = this.apiSvc.getCurrentUserId();
        if (this.directors.some(d => d.id === currentUserId)) {
          this.form.id_director_asignado = currentUserId;
        }
        this.loadingCatalogs = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loadingCatalogs = false; this.cdr.detectChanges(); }
    });
  }

  /**
   * Flujo de edición: carga catálogos + proyecto + recursos en paralelo
   * y solo pinta el formulario cuando TODO llegó, evitando la race condition
   * donde los <select> no tienen opciones al moment de pre-seleccionar el valor.
   */
  loadForEdit(id: number): void {
    this.loadingCatalogs = true;
    forkJoin({
      clients:      this.catalogSvc.getClientes({ limit: 100 }).pipe(catchError(() => of({ data: [], pagination: {} }))),
      coordinators: this.catalogSvc.getUsersByRole(3).pipe(catchError(() => of([]))),
      directors:    this.catalogSvc.getUsersByRole(2).pipe(catchError(() => of([]))),
      project:      this.projectSvc.getProject(id).pipe(catchError(() => of(null))),
      resources:    this.projectSvc.getProjectResources(id).pipe(catchError(() => of(null))),
      muebles:      this.projectSvc.getProjectMuebles(id).pipe(catchError(() => of([]))),
      tipos:        this.catalogSvc.getTiposRecurso().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ clients, coordinators, directors, project, resources, muebles, tipos }) => {
        // 1. Poblar los <select> PRIMERO
        this.clients      = clients.data;
        this.coordinators = coordinators;
        this.directors    = directors;
        this.buildTipoIds(tipos);
        this.loadingCatalogs = false;

        // 2. Setear valores del form DESPUÉS de que las opciones existen
        if (project) {
          this.form = {
            nombre:               project.nombre       ?? '',
            codigo:               project.codigo       ?? '',
            descripcion:          project.descripcion  ?? '',
            centro_costos:        project.centro_costos ?? '',
            fecha_inicio:         this.toDateStr(project.fecha_inicio),
            fecha_fin:            this.toDateStr(project.fecha_fin),
            id_cliente:           project.cliente?.id          ?? project.id_cliente          ?? null,
            id_coordinador:       project.coordinador?.id      ?? project.id_coordinador      ?? null,
            id_director_asignado: project.director_asignado?.id ?? project.id_director_asignado ?? null,
            id_director_revision: project.director_revision?.id ?? project.id_director_revision ?? null,
            link_trello:          project.link_trello  ?? '',
          };
          this.currentLinkImagen = project.link_imagen ?? null;
          this.originalEstado      = project.estado ?? '';
          this.originalFechaInicio = this.form.fecha_inicio;
          this.originalFechaFin    = this.form.fecha_fin;
        }

        // 3. Mapear muebles — usar id real como tempId para que los selects del presupuesto los encuentren
        this.muebles = (muebles ?? []).map((m: any) => ({
          tempId:   m.id,
          nombre:   m.nombre,
          fecha_fin: this.toDateStr(m.fecha_fin),
        }));

        // 4. Mapear recursos al presupuesto
        if (resources) this.mapBackendResourcesToBudget(resources);

        // Snapshot del presupuesto + muebles, para detectar cambios al guardar
        this.originalBudgetSnapshot = this.buildBudgetSnapshot();

        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingCatalogs = false;
        void Swal.fire('Error', 'No se pudieron cargar los datos del proyecto', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  /** Extrae YYYY-MM-DD de cualquier formato de fecha que devuelva el backend. */
  private toDateStr(val: string | null | undefined): string {
    if (!val) return '';
    return String(val).substring(0, 10);
  }

  private mapBackendResourcesToBudget(data: any): void {
    // Handle all possible backend response structures
    const cats: any[] = Array.isArray(data)
      ? data
      : (data?.categorias ?? data?.grupos ?? data?.secciones ?? []);
    this.budget = { materia_prima: [], proveedores: [], carpinteria: [], impresiones: [], mano_de_obra: [] };

    for (const cat of cats) {
      // tipo puede venir como string directo, o anidado en tipo_recurso.nombre, o en nombre
      const rawTipo = (typeof cat.tipo === 'string' ? cat.tipo : '')
        || cat.tipo_recurso?.nombre || cat.nombre || cat.label || '';
      const tipo = rawTipo.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_');
      const rawItems: any[] = cat.items ?? cat.recursos ?? cat.data ?? [];

      for (const item of rawItems) {
        const nombre = item.recurso?.nombre ?? item.nombre ?? '';
        const base: ResourceRow = {
          id:               item.id ?? item.id_detalle_recurso ?? Date.now(),
          detalle_id:       item.id ?? item.id_detalle_recurso,
          id_recurso:       item.recurso?.id ?? item.id_recurso,
          nombre,
          observaciones:    item.observaciones ?? '',
          nombre_proveedor: item.nombre_proveedor ?? '',
          precio_unitario:  item.valor_unitario ?? 0,
          cantidad:         item.cantidad ?? 0,
          valor_total:      item.valor_total ?? 0,
          id_mueble:        item.id_mueble ?? item.mueble?.id ?? null,
        };

        if (tipo === 'materia_prima') {
          this.budget.materia_prima.push(base);
        } else if (tipo === 'proveedores') {
          this.budget.proveedores.push(base);
        } else if (tipo === 'mano_de_obra') {
          this.budget.mano_de_obra.push(base);
        } else if (tipo.includes('carpinteria') || tipo.includes('carpinter')) {
          this.budget.carpinteria.push({
            ...base,
            laminado:    item.laminado    ?? false,
            mdf:         item.mdf         ?? false,
            madera:      item.madera      ?? false,
            enchapado:   item.enchapado   ?? false,
            formica:     item.formica     ?? false,
            chapilla:    item.chapilla    ?? false,
            tapiz:       item.tapiz       ?? false,
            pintura_cat: item.pintura_cat ?? false,
            pintura_pu:  item.pintura_pu  ?? false,
            ancho: item.ancho_cm ?? item.ancho ?? 0,
            alto:  item.alto_cm  ?? item.alto  ?? 0,
            fondo: item.fondo_cm ?? item.fondo ?? 0,
          } as CarpRow);
        } else if (tipo === 'impresiones') {
          this.budget.impresiones.push({
            ...base,
            proveedor:               (item.proveedor === 'ESP' ? 'ESP' : 'GEN') as 'GEN' | 'ESP',
            ancho_m:                 item.ancho_m ?? 0,
            alto_m:                  item.alto_m  ?? 0,
            calibre:                 item.calibre ?? 60,
            cmyk_uv:                 item.cmyk_uv                ?? false,
            cl_w_uv:                 item.cl_w_uv                ?? false,
            laminado_mate:           item.laminado_mate           ?? false,
            laminado_brillante:      item.laminado_brillante      ?? false,
            laminado_floor_graphic:  item.laminado_floor_graphic  ?? false,
            poliestireno:            item.poliestireno            ?? false,
            polipropileno:           item.polipropileno           ?? false,
            pvc:                     item.pvc                     ?? false,
            acrilico:                item.acrilico                ?? false,
            pet_g:                   item.pet_g                   ?? false,
            maulet:                  item.maulet                  ?? false,
            otros:                   item.otros                   ?? false,
            c: item.c ?? 0, m: item.m ?? 0, y: item.y ?? 0, k: item.k ?? 0,
            cl:     item.cl    ?? 0,
            w_ink:  item.w_ink ?? 0,
            m2_vinilo:       item.m2_vinilo       ?? 0,
            precio_unitario: item.precio_unitario  ?? item.valor_unitario ?? 0,
            valor_total:     item.valor_total      ?? 0,
          } as ImpRow);
        }
      }
    }
    this.budget.impresiones.forEach(r => this.calcImpRow(r));
  }

  get pageTitle(): string { return this.isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'; }

  // ── Section navigation ────────────────────────────────────────────────────
  readonly SECTIONS: Section[] = ['general','materia_prima','proveedores','carpinteria','impresiones','mano_de_obra','resumen'];
  readonly SECTION_LABELS: Record<Section, string> = {
    general: 'General', materia_prima: 'Materia Prima', proveedores: 'Proveedores',
    carpinteria: 'Carpintería', impresiones: 'Impresiones', mano_de_obra: 'Mano de Obra', resumen: 'Resumen'
  };
  readonly SECTION_ICONS: Record<Section, string> = {
    general: 'fa-info-circle', materia_prima: 'fa-cubes', proveedores: 'fa-truck',
    carpinteria: 'fa-wrench', impresiones: 'fa-print', mano_de_obra: 'fa-users', resumen: 'fa-check-circle'
  };

  // ── Muebles ───────────────────────────────────────────────────────────────
  openMuebleModal(m?: Mueble): void {
    this.editingMuebleTempId = m?.tempId ?? null;
    this.newMuebleForm = { nombre: m?.nombre ?? '', fecha_fin: m?.fecha_fin ?? '' };
    this.showMuebleModal = true;
  }
  closeMuebleModal(): void { this.showMuebleModal = false; this.editingMuebleTempId = null; }
  addMueble(): void {
    if (!this.newMuebleForm.nombre || !this.newMuebleForm.fecha_fin) {
      void Swal.fire('Atención', 'Nombre y fecha fin del mueble son obligatorios', 'warning'); return;
    }
    if (this.editingMuebleTempId !== null) {
      const m = this.muebles.find(x => x.tempId === this.editingMuebleTempId);
      if (m) { m.nombre = this.newMuebleForm.nombre; m.fecha_fin = this.newMuebleForm.fecha_fin; }
    } else {
      this.muebles.push({ tempId: Date.now(), nombre: this.newMuebleForm.nombre, fecha_fin: this.newMuebleForm.fecha_fin });
    }
    this.closeMuebleModal();
  }
  removeMueble(tempId: number): void { this.muebles = this.muebles.filter(m => m.tempId !== tempId); }
  muebleNombre(tempId: number | null | undefined): string {
    if (!tempId) return '—';
    return this.muebles.find(m => m.tempId === tempId)?.nombre ?? '—';
  }

  setSection(s: Section): void { this.activeSection = s; }
  sectionIndex(s: Section): number { return this.SECTIONS.indexOf(s); }
  isCompleted(s: Section): boolean { return this.sectionIndex(s) < this.sectionIndex(this.activeSection); }

  // ── Resource rows ─────────────────────────────────────────────────────────
  addResourceRow(section: 'materia_prima' | 'proveedores' | 'mano_de_obra'): void {
    this.budget[section].push({ id: Date.now(), nombre: '', observaciones: '', precio_unitario: 0, cantidad: 0, valor_total: 0, id_mueble: null });
  }
  removeResourceRow(section: 'materia_prima' | 'proveedores' | 'mano_de_obra', id: number): void {
    this.budget[section] = this.budget[section].filter(r => r.id !== id);
  }
  onResourceChange(row: ResourceRow): void { row.valor_total = row.precio_unitario * row.cantidad; }

  addCarpRow(): void {
    this.budget.carpinteria.push({
      id: Date.now(), nombre: '', cantidad: 1,
      laminado: false, mdf: false, madera: false, enchapado: false, formica: false,
      chapilla: false, tapiz: false, pintura_cat: false, pintura_pu: false,
      ancho: 0, alto: 0, fondo: 0, precio_unitario: 0, valor_total: 0, id_mueble: null
    });
  }
  removeCarpRow(id: number): void { this.budget.carpinteria = this.budget.carpinteria.filter(r => r.id !== id); }
  onCarpChange(row: CarpRow): void { row.valor_total = row.precio_unitario * row.cantidad; }

  addImpRow(): void {
    this.budget.impresiones.push({
      id: Date.now(), nombre: '', proveedor: 'GEN', cantidad: 1,
      ancho_m: 0, alto_m: 0, calibre: 60,
      cmyk_uv: false, cl_w_uv: false,
      laminado_mate: false, laminado_brillante: false, laminado_floor_graphic: false,
      poliestireno: false, polipropileno: false, pvc: false,
      acrilico: false, pet_g: false, maulet: false, otros: false,
      c: 0, m: 0, y: 0, k: 0, cl: 0, w_ink: 0,
      m2_vinilo: 0, precio_unitario: 0, valor_total: 0, id_mueble: null,
    });
  }
  removeImpRow(id: number): void { this.budget.impresiones = this.budget.impresiones.filter(r => r.id !== id); }

  calcImpRow(r: ImpRow): void {
    r.m2_vinilo = parseFloat((r.ancho_m * r.alto_m).toFixed(4));
    const sustrato = r.proveedor === 'ESP'
      ? this.impPrecios.sustrato_esp
      : this.impPrecios.sustrato_gen;
    r.precio_unitario = parseFloat((
      (r.c + r.m + r.y + r.k) * this.impPrecios.precio_cmyk +
      (r.cl + r.w_ink)        * this.impPrecios.precio_clw  +
      r.m2_vinilo             * sustrato
    ).toFixed(2));
    r.valor_total = parseFloat((r.precio_unitario * r.cantidad).toFixed(2));
  }

  recalcAllImp(): void {
    this.budget.impresiones.forEach(r => this.calcImpRow(r));
    this.cdr.detectChanges();
  }

  sectionTotal(section: keyof Budget): number {
    if (section === 'impresiones') {
      return this.budget.impresiones.reduce((s, r) => s + (r.valor_total ?? 0), 0);
    }
    return (this.budget[section] as Array<any>).reduce((s, r) => {
      const vt = r.valor_total && r.valor_total > 0 ? r.valor_total : (r.precio_unitario ?? 0) * (r.cantidad ?? 0);
      return s + vt;
    }, 0);
  }
  get grandTotal(): number {
    return (['materia_prima','proveedores','carpinteria','impresiones','mano_de_obra'] as (keyof Budget)[])
      .reduce((s, k) => s + this.sectionTotal(k), 0);
  }

  // ── Conflict check ─────────────────────────────────────────────────────────
  checkConflicts(): void {
    if (!this.form.fecha_inicio || !this.form.fecha_fin) {
      void Swal.fire('Atención', 'Selecciona las fechas primero', 'warning'); return;
    }
    this.checkingConflicts = true; this.conflictResult = null;

    if (this.isEdit && this.editId) {
      // For existing project use the validar-fechas endpoint
      this.projectSvc.validateProjectDates(this.editId, {
        fecha_inicio: this.form.fecha_inicio, fecha_fin: this.form.fecha_fin
      }).subscribe({
        next: data => {
          this.conflictResult = {
            viable: data.viable ?? true, ocupacion_maxima: 0,
            maquinas: (data.maquinas ?? []).map((m: any) => ({
              nombre: m.nombre, porcentaje: m.porcentaje, proyectos: m.proyectos ?? [],
              estado: m.estado === 'saturada' ? 'saturada' : m.estado === 'alta' ? 'alta' : 'ok'
            })),
            conflictos: data.conflictos ?? [],
            sugerencias: [],
          };
          this.checkingConflicts = false;
          this.cdr.detectChanges();
        },
        error: () => { this.checkingConflicts = false; this.cdr.detectChanges(); }
      });
    } else {
      // For new project — no project ID yet, show mock conflict data as before
      setTimeout(() => {
        const start = new Date(this.form.fecha_inicio);
        const end   = new Date(this.form.fecha_fin);
        const overlapsMay = start <= new Date('2026-05-20') && end >= new Date('2026-05-05');
        if (overlapsMay) {
          this.conflictResult = {
            viable: false, ocupacion_maxima: 100,
            maquinas: [
              { nombre: 'CNC', porcentaje: 100, proyectos: ['Proyectos existentes'], estado: 'saturada' },
              { nombre: 'Laminadora', porcentaje: 85, proyectos: ['Proyectos existentes'], estado: 'alta' },
            ],
            conflictos: [], sugerencias: [
              { fecha_inicio: '2026-05-26', fecha_fin: this.addDays(this.form.fecha_fin, 21), ocupacion_max: 25, viabilidad: 'optima' }
            ]
          };
        } else {
          this.conflictResult = {
            viable: true, ocupacion_maxima: 25,
            maquinas: [
              { nombre: 'CNC', porcentaje: 20, proyectos: [], estado: 'ok' },
              { nombre: 'Laminadora', porcentaje: 15, proyectos: [], estado: 'ok' },
            ],
            conflictos: [], sugerencias: []
          };
        }
        this.checkingConflicts = false;
        this.cdr.detectChanges();
      }, 700);
    }
  }

  applySuggestion(s: ConflictSugg): void {
    this.appliedSuggestion = s;
    this.form.fecha_inicio = s.fecha_inicio;
    this.form.fecha_fin    = s.fecha_fin;
    this.conflictResult = null;
    this.cdr.detectChanges();
    this.checkConflicts();
  }

  private addDays(dateStr: string, days: number): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0] ?? '';
  }

  // ── Client modal ──────────────────────────────────────────────────────────
  openClientModal(): void {
    this.newClientForm = { nombre: '' };
    this.clientSimilares = [];
    this.showClientModal = true;
  }
  closeClientModal(): void { this.showClientModal = false; this.clientSimilares = []; }

  saveNewClient(): void {
    const nombre = this.newClientForm.nombre.trim();
    if (!nombre) {
      void Swal.fire('Atención', 'El nombre del cliente es obligatorio', 'warning'); return;
    }
    this.catalogSvc.createCliente({ nombre }).subscribe({
      next: (newClient: any) => {
        const nombreMostrar = newClient.razon_social ?? newClient.nombre ?? '';
        const id = newClient.id ?? newClient.insertId;
        if (!id) {
          void Swal.fire('Error', 'El cliente fue creado pero no se pudo seleccionar automáticamente. Recarga y búscalo en la lista.', 'warning');
          this.closeClientModal();
          this.cdr.detectChanges();
          return;
        }
        const clienteNormalizado = { ...newClient, id, razon_social: nombreMostrar };
        this.clients = [...this.clients, clienteNormalizado];
        this.form.id_cliente = id;
        const aviso = newClient.advertencia_similares?.length
          ? `\n⚠ Nombre similar ya existe: ${newClient.advertencia_similares[0]}`
          : '';
        void Swal.fire({ icon: 'success', title: 'Cliente creado', text: `"${nombreMostrar}" fue registrado.${aviso}`, timer: 2500 });
        this.closeClientModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        const msg = err.error?.message ?? 'No se pudo crear el cliente';
        void Swal.fire('Error', msg, 'error');
      },
    });
  }

  get selectedClientName(): string {
    const c = this.clients.find(c => c.id === this.form.id_cliente);
    return c?.razon_social ?? c?.nombre ?? '';
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  save(sendToReview = false): void {
    if (!this.form.nombre || !this.form.fecha_inicio || !this.form.fecha_fin) {
      void Swal.fire('Atención', 'El nombre, centro de costos y las fechas son obligatorios', 'warning'); return;
    }
    if (!this.form.id_cliente) {
      void Swal.fire('Atención', 'Selecciona un cliente', 'warning'); return;
    }
    if (!this.form.id_director_asignado) {
      void Swal.fire('Atención', 'Selecciona el Director asignado del proyecto', 'warning'); return;
    }

    this.saving = true;
    const projectBody: any = {
      nombre:               this.form.nombre,
      codigo:               this.form.codigo || null,
      descripcion:          this.form.descripcion,
      centro_costos:        this.form.centro_costos,
      fecha_inicio:         this.form.fecha_inicio,
      fecha_fin:            this.form.fecha_fin,
      id_cliente:           this.form.id_cliente,
      id_director_asignado: this.form.id_director_asignado,
      id_director_revision: this.form.id_director_revision,
      link_trello:          this.form.link_trello || null,
    };

    // For new projects, send the full presupuesto in the create body
    if (!this.isEdit) {
      projectBody.presupuesto = this.buildPresupuesto();
    }

    const save$ = this.isEdit && this.editId
      ? this.projectSvc.updateProject(this.editId, projectBody)
      : this.projectSvc.createProject(projectBody);

    save$.subscribe({
      next: savedProject => {
        const projectId = savedProject?.id ?? this.editId;
        // Para proyectos nuevos el presupuesto completo ya fue enviado en el body (POST /proyectos).
        // saveIndividualResources solo corre en edición para agregar filas nuevas sin detalle_id.
        if (this.isEdit) {
          this.saveIndividualResources(projectId, sendToReview);
        } else {
          this.onSaveComplete(projectId, sendToReview);
        }
      },
      error: err => {
        this.saving = false;
        void Swal.fire('Error', err.error?.message ?? 'No se pudo guardar el proyecto', 'error');
      }
    });
  }

  /**
   * Snapshot serializable del presupuesto + muebles, usado para detectar si
   * hubo cambios en materiales/insumos al editar un proyecto.
   */
  private buildBudgetSnapshot(): string {
    const strip = (rows: any[]) => rows.map(({ _sugg, _showSugg, _searching, ...rest }) => rest);
    return JSON.stringify({
      muebles:       this.muebles.map(m => ({ nombre: m.nombre, fecha_fin: m.fecha_fin })),
      materia_prima: strip(this.budget.materia_prima),
      proveedores:   strip(this.budget.proveedores),
      carpinteria:   strip(this.budget.carpinteria),
      impresiones:   strip(this.budget.impresiones),
      mano_de_obra:  strip(this.budget.mano_de_obra),
    });
  }

  /** Builds the presupuesto object for POST /proyectos (new project). */
  private buildPresupuesto(): any {
    return {
      // Muebles locales — el backend los creará y devolverá IDs reales
      muebles: this.muebles.map(m => ({ nombre: m.nombre, fecha_fin: m.fecha_fin, _tempId: m.tempId })),
      materia_prima: this.budget.materia_prima
        .filter(r => r.nombre && r.cantidad > 0)
        .map(r => ({
          id_recurso:     r.id_recurso || null,
          nombre:         r.nombre,
          cantidad:       r.cantidad,
          valor_unitario: r.precio_unitario,
          observaciones:  r.observaciones || null,
          id_mueble_temp: r.id_mueble || null,
        })),
      proveedores: this.budget.proveedores
        .filter(r => r.nombre && r.cantidad > 0)
        .map(r => ({
          id_recurso:      r.id_recurso || null,
          nombre:          r.nombre,
          cantidad:        r.cantidad,
          valor_unitario:  r.precio_unitario,
          observaciones:   r.observaciones || null,
          nombre_proveedor: r.nombre_proveedor || null,
          id_mueble_temp:  r.id_mueble || null,
        })),
      carpinteria: this.budget.carpinteria
        .filter(r => r.nombre && r.cantidad > 0)
        .map(r => ({
          nombre:      r.nombre,
          cantidad:    r.cantidad,
          laminado:    r.laminado,    mdf:         r.mdf,         madera:    r.madera,
          enchapado:   r.enchapado,   formica:     r.formica,    chapilla:  r.chapilla,
          tapiz:       r.tapiz,       pintura_cat: r.pintura_cat, pintura_pu: r.pintura_pu,
          ancho_cm:    r.ancho,       alto_cm:     r.alto,        fondo_cm:  r.fondo,
          precio_unitario: r.precio_unitario,
          id_mueble_temp: r.id_mueble || null,
        })),
      impresiones: this.budget.impresiones
        .filter(r => r.nombre && r.cantidad > 0)
        .map(r => ({
          nombre:                  r.nombre,
          proveedor:               r.proveedor,
          cantidad:                r.cantidad,
          ancho_m:                 r.ancho_m,
          alto_m:                  r.alto_m,
          calibre:                 r.calibre,
          cmyk_uv:                 r.cmyk_uv,
          cl_w_uv:                 r.cl_w_uv,
          laminado_mate:           r.laminado_mate,
          laminado_brillante:      r.laminado_brillante,
          laminado_floor_graphic:  r.laminado_floor_graphic,
          poliestireno:            r.poliestireno,
          polipropileno:           r.polipropileno,
          pvc:                     r.pvc,
          acrilico:                r.acrilico,
          pet_g:                   r.pet_g,
          maulet:                  r.maulet,
          otros:                   r.otros,
          c: r.c, m: r.m, y: r.y, k: r.k,
          cl:              r.cl,
          w_ink:           r.w_ink,
          precio_unitario: r.precio_unitario,
          id_mueble_temp:  r.id_mueble || null,
        })),
      mano_de_obra: this.budget.mano_de_obra
        .filter(r => r.nombre && r.cantidad > 0)
        .map(r => ({
          concepto:        r.nombre,
          nombre:          r.nombre,
          precio_unitario: r.precio_unitario,
          cantidad:        r.cantidad,
          observaciones:   r.observaciones || null,
          id_mueble_temp:  r.id_mueble || null,
        })),
    };
  }

  /**
   * Saves mp/pv/mo rows via individual POST /proyectos/:id/recursos endpoints.
   * Used as fallback when presupuesto-in-body isn't processed, and for edit mode.
   * Skips rows that already exist (detalle_id set) and rows without a resolvable id_recurso.
   * The user's typed nombre goes in observaciones so it appears as the item description.
   */
  private saveIndividualResources(projectId: number, sendToReview: boolean): void {
    const calls: Observable<any>[] = [];

    const pushSection = (items: ResourceRow[]) => {
      for (const row of items) {
        if (!row.nombre || row.cantidad <= 0 || row.detalle_id) continue;
        calls.push(
          this.projectSvc.addResource(projectId, {
            id_recurso:     row.id_recurso || null,
            nombre:         row.nombre,
            cantidad:       row.cantidad,
            valor_unitario: row.precio_unitario,
            observaciones:  row.observaciones || null,
            id_mueble_temp: row.id_mueble || null,
          }).pipe(catchError(() => of(null)))
        );
      }
    };

    pushSection(this.budget.materia_prima);
    pushSection(this.budget.proveedores);
    pushSection(this.budget.mano_de_obra);

    if (!calls.length) { this.onSaveComplete(projectId, sendToReview); return; }
    forkJoin(calls).subscribe(() => this.onSaveComplete(projectId, sendToReview));
  }

  // ── Autocomplete de recursos ──────────────────────────────────────────────
  searchRecurso(row: any, section: string): void {
    clearTimeout(this._searchTimer);
    const q = (row.nombre ?? '').trim();

    // Con menos de 2 caracteres: ocultar dropdown limpiamente
    if (q.length < 2) {
      row._sugg = []; row._showSugg = false; row._searching = false;
      this.cdr.detectChanges();
      return;
    }

    // Mostrar spinner en el dropdown inmediatamente mientras debounce
    row._searching = true;
    row._showSugg  = true;
    row._sugg      = [];
    this.cdr.detectChanges();

    const filters: Record<string, any> = { search: q, limit: 8 };
    const tipoId = this.tipoIds[section];
    if (tipoId) filters['id_tipo_recurso'] = tipoId;

    this._searchTimer = setTimeout(() => {
      this.catalogSvc.getRecursos(filters).subscribe({
        next: r => {
          row._sugg      = r.data ?? [];
          row._searching = false;
          row._showSugg  = true;   // mostrar siempre (con resultados o mensaje vacío)
          this.cdr.detectChanges();
        },
        error: () => {
          row._searching = false;
          row._showSugg  = false;
          this.cdr.detectChanges();
        }
      });
    }, 300);
  }

  selectSugerencia(row: any, sug: any): void {
    row.nombre     = sug.nombre;
    row.id_recurso = sug.id;
    row._showSugg  = false;
    row._sugg      = [];
    row._searching = false;
    this.cdr.detectChanges();
  }

  positionSugg(event: Event): void {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.suggPos = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) };
  }

  hideSugg(row: any): void {
    setTimeout(() => { row._showSugg = false; this.cdr.detectChanges(); }, 150);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.selectedImageFile = file;
    if (file) {
      const reader = new FileReader();
      reader.onload = e => { this.imagePreviewUrl = e.target?.result as string; this.cdr.detectChanges(); };
      reader.readAsDataURL(file);
    } else {
      this.imagePreviewUrl = null;
    }
  }

  private onSaveComplete(projectId: number, sendToReview: boolean): void {
    const finish = () => {
      this.saving = false;

      // Proyecto en producción: cambiar de fechas/insumos no debe regresarlo a "en_revision"
      // tal cual — depende de qué cambió.
      if (sendToReview && projectId && this.isEdit && this.originalEstado === 'en_produccion') {
        const datesChanged = this.form.fecha_inicio !== this.originalFechaInicio
          || this.form.fecha_fin !== this.originalFechaFin;
        const resourcesChanged = this.buildBudgetSnapshot() !== this.originalBudgetSnapshot;

        if (resourcesChanged) {
          // Cambios en materiales/insumos sobre un proyecto en producción → requiere re-aprobación
          this.projectSvc.changeProjectStatus(projectId, 'en_revision').subscribe({ error: () => {} });
          this.projectSvc.notifyResourceChange(projectId).subscribe({ error: () => {} });
          void Swal.fire({
            icon: 'info', title: 'Cambios enviados a revisión',
            text: 'El proyecto está en producción y se modificaron materiales/insumos. Se notificó a los directores para su re-aprobación.',
            timer: 3000,
          }).then(() => void this.router.navigate(['/dashboard/director/home']));
          return;
        }

        if (datesChanged) {
          this.projectSvc.updateProjectDates(projectId, {
            fecha_inicio: this.form.fecha_inicio, fecha_fin: this.form.fecha_fin,
          }).subscribe({ error: () => {} });
          void Swal.fire({
            icon: 'success', title: 'Fechas actualizadas',
            text: 'El proyecto permanece en producción. El cambio de fechas quedó registrado en el historial.',
            timer: 3000,
          }).then(() => void this.router.navigate(['/dashboard/director/home']));
          return;
        }

        void Swal.fire({ icon: 'success', title: '¡Listo!', text: 'Proyecto actualizado correctamente', timer: 2500 })
          .then(() => void this.router.navigate(['/dashboard/director/home']));
        return;
      }

      if (sendToReview && projectId) {
        this.projectSvc.changeProjectStatus(projectId, 'en_revision').subscribe({ error: () => {} });
      }
      const action = sendToReview ? 'enviado a revisión' : (this.isEdit ? 'actualizado' : 'creado');
      void Swal.fire({ icon: 'success', title: '¡Listo!', text: `Proyecto ${action} correctamente`, timer: 2500 })
        .then(() => void this.router.navigate(['/dashboard/director/home']));
    };

    if (this.selectedImageFile && projectId) {
      this.projectSvc.uploadProjectImage(projectId, this.selectedImageFile).subscribe({
        next: () => finish(),
        error: () => {
          void Swal.fire('Aviso', 'El proyecto se guardó pero hubo un error al subir la imagen.', 'warning');
          finish();
        }
      });
    } else {
      finish();
    }
  }

  cancel(): void { void this.router.navigate(['/dashboard/director/home']); }

  formatCOP(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v ?? 0);
  }
  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parseInt(parts[2]??'1',10)} ${MONTHS[parseInt(parts[1]??'1',10)-1]??''} ${parts[0]??''}`;
  }
  occ_class(occ: MachineOcc): string {
    return occ.estado === 'saturada' ? 'occ-saturada' : occ.estado === 'alta' ? 'occ-alta' : 'occ-ok';
  }
  viab_class(s: ConflictSugg): string {
    return s.viabilidad === 'optima' ? 'sugg-optima' : s.viabilidad === 'alta' ? 'sugg-alta' : 'sugg-media';
  }
  viab_icon(s: ConflictSugg): string {
    return s.viabilidad === 'optima' ? 'fa-star' : s.viabilidad === 'alta' ? 'fa-check' : 'fa-minus';
  }
}
