import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { Subscription } from 'rxjs';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { Api } from '../../../core/services/api';

interface PhaseMachineOcc { nombre: string; porcentaje: number; estado: 'ok' | 'alta' | 'saturada'; }

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador', rechazado: 'Rechazado',
  aprobado: 'Aprobado', en_produccion: 'En Producción', pausado: 'Pausado',
  completado: 'Completado', cancelado: 'Cancelado',
  pendiente: 'Pendiente', asignada: 'Asignada',
  en_progreso: 'En Progreso', completada: 'Completada', bloqueada: 'Bloqueada',
  en_revision: 'Por verificar',
  'Por Validar': 'Por Validar', 'En Desarrollo': 'En Desarrollo',
};

const TIPO_RECURSO_LABELS: Record<string, string> = {
  materia_prima: 'Materia Prima', proveedores: 'Proveedores',
  carpinteria: 'Carpintería', impresiones: 'Impresiones', mano_de_obra: 'Mano de Obra',
};

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-project-detail',
  standalone: false,
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss'
})
export class ProjectDetail implements OnInit, OnDestroy {
  project: any = null;
  activeTab = 'resumen';
  expandedFases = new Set<number>();
  loading = true;
  error = '';

  rawRecursos: any = null;
  resourceSummary: any[] = [];
  totalRecursosValue = 0;
  private _notifSub: Subscription | null = null;

  solicitudesPendientes: any[] = [];
  loadingSolicitudes = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private notifSvc: NotificationService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const id = parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10);
      if (id) this.loadProject(id);
      this.catalogSvc.getTiposTarea().subscribe({ next: t => { this.tiposTarea = t; this.cdr.detectChanges(); }, error: () => {} });
      this._notifSub = this.notifSvc.newNotif$.subscribe(n => {
        if (['tarea_completada', 'tarea_en_revision'].includes(n.tipo) && this.project &&
            (!n.proyecto_id || n.proyecto_id === this.project.id)) {
          this.loadProject(this.project.id);
        }
      });
    }
  }

  ngOnDestroy(): void { this._notifSub?.unsubscribe(); }

  loadProject(id: number): void {
    this.loading = true;
    this.error = '';
    this.projectSvc.getProjectFull(id).subscribe({
      next: project => {
        this.project = project;
        if (project.fases?.length) this.expandedFases.add(project.fases[0].id);
        this.loading = false;
        this.cdr.detectChanges();
        this.loadResourceSummary(id);
        this.loadProjectInsumos(id);
        this.loadProjectMuebles(id);
        this.loadSolicitudes(id);
      },
      error: () => {
        this.error = 'No se pudo cargar el proyecto.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadResourceSummary(id: number): void {
    this.projectSvc.getResourcesSummary(id).subscribe({
      next: data => {
        // Backend returns { totales_por_tipo: [...], gran_total }
        // We map tipo_recurso.nombre to our local labels
        const grupos = data?.totales_por_tipo ?? data?.grupos ?? data?.categorias ?? [];
        this.resourceSummary = grupos.map((g: any) => ({
          tipo: g.tipo_recurso?.nombre ?? g.tipo ?? '',
          total: g.total ?? g.subtotal ?? 0,
          items: g.items ?? 0,
        }));
        this.totalRecursosValue = data?.gran_total ?? this.resourceSummary.reduce((s: number, r: any) => s + r.total, 0);
        this.cdr.detectChanges();
      },
      error: () => { /* non-critical */ }
    });
  }

  setTab(tab: string): void { this.activeTab = tab; }

  toggleFase(id: number): void {
    if (this.expandedFases.has(id)) this.expandedFases.delete(id);
    else this.expandedFases.add(id);
  }
  isFaseExpanded(id: number): boolean { return this.expandedFases.has(id); }

  sendToReview(): void {
    if (!this.project) return;
    this.projectSvc.changeProjectStatus(this.project.id, 'en_revision').subscribe({
      next: () => void Swal.fire({ icon: 'success', title: 'Enviado a revisión', text: 'El proyecto fue enviado al director de revisión', timer: 2000 }),
      error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo cambiar el estado', 'error'),
    });
  }

  goToEdit(): void {
    void this.router.navigate(['/dashboard/director/project-new'], { queryParams: { id: this.project?.id } });
  }
  goBack(): void  { void this.router.navigate(['/dashboard/director/home']); }
  goToGantt(): void { void this.router.navigate(['/dashboard/director/gantt'], { queryParams: { proyecto: this.project?.id } }); }
  goToPlantillas(): void {
    void this.router.navigate(['/dashboard/director/plantillas', this.project?.id], {
      queryParams: {
        fecha_inicio: (this.project?.fecha_inicio ?? '').substring(0, 10),
        fecha_fin:    (this.project?.fecha_fin    ?? '').substring(0, 10),
      },
    });
  }
  openTrello(url: string): void { window.open(url, '_blank', 'noopener'); }

  getEstadoLabel(estado: string): string { return ESTADO_LABELS[estado] ?? estado; }
  getTipoRecursoLabel(tipo: string): string { return TIPO_RECURSO_LABELS[tipo] ?? tipo; }

  formatCOP(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value ?? 0);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split(/[-T]/);
    const y = parts[0] ?? '';
    const m = parseInt(parts[1] ?? '1', 10);
    const d = parseInt(parts[2] ?? '1', 10);
    return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
  }

  getTareaStateClass(estado: string): string {
    const map: Record<string, string> = {
      completada: 'state-done', en_progreso: 'state-progress',
      asignada: 'state-assigned', pendiente: 'state-pending',
      bloqueada: 'state-blocked', en_revision: 'state-revision',
    };
    return map[estado] ?? 'state-pending';
  }

  // getEstadoLabel/'tbadge-'+estado es compartido con el estado del proyecto, no se puede
  // sobrecargar aquí. El motivo del bloqueo se explica en el tooltip (getTareaTooltip), no
  // con texto ni color distinto en el badge: visualmente debe verse igual que "Pendiente".
  getTareaBadgeLabel(t: any): string {
    if (t.estado === 'bloqueada') return 'Bloqueada';
    return this.getEstadoLabel(t.estado);
  }
  getTareaBadgeClass(t: any): string {
    if (t.estado === 'bloqueada') return 'tbadge-pendiente';
    return 'tbadge-' + t.estado;
  }
  getTareaTooltip(t: any): string {
    if (t?.estado !== 'bloqueada') return '';
    return t.bloqueada_por_movimiento ? 'Reprogramar fechas' : 'Esperando predecesora';
  }
  // Mismo criterio que el candado del Gantt: violeta para dependencia normal, rojo para
  // movimiento, neutro si tiene depende_de pero no está bloqueada (ya se cumplió).
  lockClass(t: any): string {
    if (t?.estado === 'bloqueada') return t.bloqueada_por_movimiento ? 'lock-move' : 'lock-dep';
    return 'lock-neutral';
  }
  dependenciaNombre(t: any, fase: any): string {
    const dep = (fase?.tareas ?? []).find((x: any) => x.id === t.depende_de);
    return dep?.nombre ?? `tarea #${t.depende_de}`;
  }

  get totalRecursos(): number { return this.totalRecursosValue; }

  private toMs(val: any): number {
    if (!val) return NaN;
    return new Date(String(val).substring(0, 10)).getTime();
  }

  faseTieneFechas(fase: any): boolean {
    return !isNaN(this.toMs(fase.fecha_inicio)) && !isNaN(this.toMs(fase.fecha_fin));
  }

  get fasesConFechas(): any[] {
    return (this.project?.fases ?? []).filter((f: any) => this.faseTieneFechas(f));
  }

  getCronoBarStyle(fase: any): Record<string, string> {
    if (!this.project) return { display: 'none' };
    const pStart = this.toMs(this.project.fecha_inicio);
    const pEnd   = this.toMs(this.project.fecha_fin);
    const fStart = this.toMs(fase.fecha_inicio);
    const fEnd   = this.toMs(fase.fecha_fin);
    if ([pStart, pEnd, fStart, fEnd].some(isNaN)) return { display: 'none' };
    const total = (pEnd - pStart) / 86400000;
    if (total <= 0) return { display: 'none' };
    const offset = (fStart - pStart) / 86400000;
    const width  = (fEnd - fStart) / 86400000 + 1;
    const left = Math.max(0, (offset / total) * 100);
    const w    = Math.max(1, Math.min(100 - left, (width / total) * 100));
    return { left: `${left}%`, width: `${w}%` };
  }

  get canManagePhases(): boolean {
    return ['aprobado', 'en_produccion', 'pausado', 'En Desarrollo'].includes(this.project?.estado ?? '');
  }

  // ── Solicitudes de recurso pendientes ──────────────────────────────────────
  loadSolicitudes(id: number): void {
    this.loadingSolicitudes = true;
    this.api.getSolicitudesRecurso(id).subscribe({
      next: data => { this.solicitudesPendientes = data; this.loadingSolicitudes = false; this.cdr.detectChanges(); },
      error: () => { this.loadingSolicitudes = false; }
    });
  }

  aprobarSolicitud(sol: any): void {
    this.api.aprobarSolicitudRecurso(sol.id).subscribe({
      next: () => {
        this.loadSolicitudes(this.project.id);
        this.loadProjectInsumos(this.project.id);
      },
      error: () => {}
    });
  }

  rechazarSolicitud(sol: any): void {
    void Swal.fire({
      title: 'Rechazar solicitud',
      input: 'textarea', inputPlaceholder: 'Motivo del rechazo (opcional)...',
      showCancelButton: true, confirmButtonText: 'Rechazar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    }).then(r => {
      if (!r.isConfirmed) return;
      this.api.rechazarSolicitudRecurso(sol.id, r.value ?? '').subscribe({
        next: () => {
          void Swal.fire({ icon: 'info', title: 'Solicitud rechazada', timer: 1500, showConfirmButton: false });
          this.loadSolicitudes(this.project.id);
        },
        error: () => {}
      });
    });
  }

  onPedirRecurso(r: { id: number; nombre: string; nombre_proveedor?: string | null; precio_unitario: number; cantidad: number }): void {
    const proyectoId = this.project?.id;
    if (!proyectoId) return;
    this.router.navigate(['/dashboard/director/estados-compra'], {
      queryParams: { abrirPedido: proyectoId },
      state: { recurso: { id_detalle_recurso: r.id, nombre: r.nombre, nombre_proveedor: r.nombre_proveedor ?? null, precio_unitario: r.precio_unitario, cantidad: r.cantidad } }
    });
  }

  // ── Task display helpers (API returns objects, template expects strings) ──

  getTaskTipoStr(t: any): string {
    if (!t.tipo_tarea) return '';
    return typeof t.tipo_tarea === 'string' ? t.tipo_tarea : (t.tipo_tarea.nombre ?? '');
  }

  getTaskOperariosStr(t: any): string {
    if (!t.operarios?.length) return '';
    return t.operarios.map((o: any) =>
      typeof o === 'string' ? o : `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim()
    ).join(', ');
  }

  getTaskMaquinariasStr(t: any): string {
    if (!t.maquinarias?.length) return '';
    return t.maquinarias.map((m: any) =>
      typeof m === 'string' ? m : (m.nombre ?? '')
    ).join(', ');
  }

  // ── Phase insumos (stub — backend no soporta esto aún) ──────────────────
  phaseInsumos: number[] = [];
  isPhaseInsumoSelected(id: number): boolean { return this.phaseInsumos.includes(id); }
  togglePhaseInsumo(id: number): void {
    const i = this.phaseInsumos.indexOf(id);
    if (i === -1) this.phaseInsumos.push(id);
    else this.phaseInsumos.splice(i, 1);
  }
  insumoLabel(id: number): string {
    return this.project?.insumos?.find((ins: any) => ins.id === id)?.nombre ?? `#${id}`;
  }

  muebleLabel(id: number): string {
    return this.project?.muebles?.find((m: any) => m.id === id)?.nombre ?? `#${id}`;
  }

  // ── Insumos disponibles del proyecto (para selector en delegación/fase) ───
  private loadProjectInsumos(id: number): void {
    this.projectSvc.getProjectResources(id).subscribe({
      next: raw => {
        this.rawRecursos = raw;
        if (this.project) this.project.insumos = this.extractAllInsumos(raw);
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private loadProjectMuebles(id: number): void {
    this.projectSvc.getProjectMuebles(id).subscribe({
      next: muebles => {
        if (this.project) this.project.muebles = muebles ?? [];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private extractAllInsumos(raw: any): any[] {
    const labelMap: Record<string, string> = {
      materia_prima: 'Materia Prima', proveedores: 'Proveedor',
      impresiones: 'Impresiones', carpinteria: 'Carpintería', mano_de_obra: 'Mano de Obra',
    };
    const all: any[] = [];
    if (!raw) return all;

    // Formato A: claves directas { materia_prima: [...], proveedores: [...] }
    if (raw.materia_prima || raw.proveedores || raw.carpinteria || raw.impresiones || raw.mano_de_obra) {
      Object.entries(labelMap).forEach(([key, label]) => {
        (raw[key] ?? []).forEach((item: any) => {
          if (item.nombre) all.push({ id: item.id ?? item.id_recurso ?? item.detalle_id, nombre: item.nombre, tipo: label });
        });
      });
      return all;
    }

    // Formato B: array o { categorias/grupos/secciones: [...] }
    const cats: any[] = Array.isArray(raw) ? raw : (raw?.categorias ?? raw?.grupos ?? raw?.secciones ?? []);
    for (const cat of cats) {
      const tipoRaw = (cat.nombre ?? cat.tipo_recurso?.nombre ?? cat.tipo ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').toLowerCase();
      const label = labelMap[tipoRaw];
      if (!label) continue;
      const items: any[] = cat.items ?? cat.recursos ?? cat.data ?? [];
      for (const item of items) {
        if (item.nombre) all.push({ id: item.id ?? item.id_recurso ?? item.detalle_id, nombre: item.nombre, tipo: label });
      }
    }
    return all;
  }

  // ── Descarga Excel de recursos ─────────────────────────────────────────────
  downloadRecursos(): void {
    if (!this.project?.id) return;
    this.projectSvc.getProjectResources(this.project.id).subscribe({
      next: (raw: any) => {
        const items = this.flattenAllRecursos(raw);
        if (!items.length) {
          void Swal.fire('Atención', 'No hay recursos disponibles para exportar.', 'info');
          return;
        }

        const rows: any[][] = [
          [`Recursos — ${this.project.nombre}`],
          [`Exportado: ${new Date().toLocaleDateString('es-CO')}`],
          [],
          ['Proveedor', 'Cantidad', 'Precio unitario'],
          ...items.map(item => [item.proveedor ?? '', item.cantidad ?? '', item.precio_unitario ?? '']),
          [],
          ['', 'TOTAL', items.reduce((sum, item) => sum + Number(item.precio_unitario ?? 0), 0)],
        ];

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 18 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Recursos');

        const fileName = `Recursos_${(this.project.nombre ?? 'proyecto').replace(/\s+/g, '_')}_${new Date().toISOString().substring(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
      },
      error: () => void Swal.fire('Error', 'No se pudieron exportar los recursos', 'error'),
    });
  }

  private flattenAllRecursos(raw: any): Array<{ proveedor?: string; cantidad?: number; precio_unitario?: number }> {
    const labelMap: Record<string, string> = {
      materia_prima: 'Materia Prima', proveedores: 'Proveedores',
      carpinteria: 'Carpintería', impresiones: 'Impresiones', mano_de_obra: 'Mano de Obra',
    };
    const result: Array<{ proveedor?: string; cantidad?: number; precio_unitario?: number }> = [];
    if (!raw) return result;

    const normalizeItem = (item: any): { proveedor?: string; cantidad?: number; precio_unitario?: number } => ({
      proveedor: item.proveedor ?? item.nombre ?? item.recurso?.proveedor ?? item.recurso?.nombre ?? '',
      cantidad: Number(item.cantidad ?? item.cantidad_recurso ?? item.cantidad_total ?? 0),
      precio_unitario: Number(item.precio_unitario ?? item.valor_unitario ?? item.precio_total ?? item.valor_total ?? item.total ?? 0),
    });

    const pushItems = (items: any[]) => {
      for (const item of items ?? []) {
        if (!item) continue;
        result.push(normalizeItem(item));
      }
    };

    if (raw.materia_prima || raw.proveedores || raw.carpinteria || raw.impresiones || raw.mano_de_obra) {
      Object.entries(labelMap).forEach(([key]) => pushItems(raw[key] ?? []));
      return result;
    }

    const cats: any[] = Array.isArray(raw) ? raw : (raw?.categorias ?? raw?.grupos ?? raw?.secciones ?? []);
    for (const cat of cats) {
      pushItems(cat.items ?? cat.recursos ?? cat.data ?? []);
    }
    return result;
  }

  onTipoTareaChange(): void { /* tipo_tarea string se actualiza via ngModel en el form */ }

  // ── Nuevo tipo de tarea (T4.1) ────────────────────────────────────────────
  showNewTipoInput = false;
  newTipoLabel = '';
  newTipoSaving = false;

  createNewTipo(): void {
    const nombre = this.newTipoLabel.trim();
    if (!nombre) return;
    this.newTipoSaving = true;
    this.catalogSvc.createTipoTarea({ nombre }).subscribe({
      next: (t: any) => {
        const item = { id: t.id, nombre: t.nombre ?? nombre };
        this.tiposTarea = [...this.tiposTarea, item];
        this.taskForm.id_tipo_tarea = item.id;
        this.showNewTipoInput = false;
        this.newTipoLabel = '';
        this.newTipoSaving = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.newTipoSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo crear el tipo', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // ── Phase modal ────────────────────────────────────────────────────────────
  showPhaseModal = false;
  editingPhaseId: number | null = null;
  phaseForm: { nombre: string; descripcion: string; fecha_inicio: string; fecha_fin: string } =
    { nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '' };
  phaseConflictState: 'idle' | 'checking' | 'ok' | 'conflict' = 'idle';
  phaseConflictMsg = '';
  phaseMachineOcc: PhaseMachineOcc[] = [];

  get phaseDateMin(): string { return this.project?.fecha_inicio ?? ''; }
  get phaseDateMax(): string { return this.project?.fecha_fin    ?? ''; }

  openNewPhase(): void {
    this.editingPhaseId = null;
    this.phaseForm = {
      nombre: '', descripcion: '',
      fecha_inicio: this.project?.fecha_inicio ?? '',
      fecha_fin:    this.project?.fecha_fin    ?? '',
    };
    this.resetPhaseConflict();
    this.showPhaseModal = true;
  }

  openEditPhase(fase: any): void {
    this.editingPhaseId = fase.id;
    this.phaseForm = {
      nombre: fase.nombre,
      descripcion: fase.descripcion ?? '',
      fecha_inicio: (fase.fecha_inicio ?? '').substring(0, 10),
      fecha_fin:    (fase.fecha_fin    ?? '').substring(0, 10),
    };
    this.phaseInsumos = [...(fase.muebles_aplicados ?? fase.insumos_aplicados ?? [])];
    this.resetPhaseConflict();
    this.showPhaseModal = true;
  }

  closePhaseModal(): void { this.showPhaseModal = false; }

  resetPhaseConflict(): void { this.phaseConflictState = 'idle'; this.phaseConflictMsg = ''; this.phaseMachineOcc = []; }

  checkPhaseAvailability(): void {
    if (!this.phaseForm.fecha_inicio || !this.phaseForm.fecha_fin) {
      void Swal.fire('Atención', 'Selecciona primero las fechas de la fase', 'warning'); return;
    }
    const { fecha_inicio: fi, fecha_fin: ff } = this.phaseForm;
    if (fi > ff) {
      void Swal.fire('Atención', 'La fecha de inicio no puede ser posterior a la de fin.', 'warning'); return;
    }
    if (this.project && (fi < this.project.fecha_inicio || ff > this.project.fecha_fin)) {
      void Swal.fire('Fuera de rango',
        `Las fechas deben estar dentro del proyecto: ${this.project.fecha_inicio} → ${this.project.fecha_fin}.`,
        'warning'); return;
    }
    this.phaseConflictState = 'checking';
    this.phaseMachineOcc = [];
    this.projectSvc.validateFaseDates(this.project.id, {
      fecha_inicio: this.phaseForm.fecha_inicio,
      fecha_fin: this.phaseForm.fecha_fin,
    }).subscribe({
      next: data => {
        this.phaseMachineOcc = (data.maquinas ?? []).map((m: any) => ({
          nombre: m.nombre, porcentaje: m.porcentaje,
          estado: m.estado === 'saturada' ? 'saturada' : m.estado === 'alta' ? 'alta' : 'ok',
        }));
        // Solo bloquear si alguna máquina está al 100%
        const saturadas = this.phaseMachineOcc.filter(m => m.porcentaje >= 100);
        if (saturadas.length) {
          this.phaseConflictState = 'conflict';
          this.phaseConflictMsg = `Maquinaria al 100%: ${saturadas.map(m => m.nombre).join(', ')}. El director puede confirmar de todas formas.`;
        } else {
          this.phaseConflictState = 'ok';
          this.phaseConflictMsg = this.phaseMachineOcc.length
            ? `Rango disponible. Ocupación máxima: ${Math.max(...this.phaseMachineOcc.map(m => m.porcentaje))}%.`
            : 'Rango disponible sin conflictos.';
        }
      },
      error: () => { this.phaseConflictState = 'ok'; this.phaseConflictMsg = 'No se pudo verificar disponibilidad.'; }
    });
  }

  phaseOccClass(occ: PhaseMachineOcc): string {
    return occ.estado === 'saturada' ? 'occ-saturada' : occ.estado === 'alta' ? 'occ-alta' : 'occ-ok';
  }

  savePhase(): void {
    if (!this.phaseForm.nombre || !this.phaseForm.fecha_inicio || !this.phaseForm.fecha_fin) {
      void Swal.fire('Atención', 'Completa nombre y fechas de la fase', 'warning'); return;
    }
    if (!this.project) return;
    const { fecha_inicio: fi, fecha_fin: ff } = this.phaseForm;
    if (fi > ff) {
      void Swal.fire('Atención', 'La fecha de inicio no puede ser posterior a la de fin.', 'warning'); return;
    }
    // Advertencia (no bloqueo) si está fuera del rango del proyecto
    const outOfRange = fi < this.project.fecha_inicio || ff > this.project.fecha_fin;
    if (outOfRange) {
      void Swal.fire({
        icon: 'warning', title: 'Fuera del rango del proyecto',
        html: `Las fechas están fuera del rango del proyecto (<b>${this.formatDate(this.project.fecha_inicio)} → ${this.formatDate(this.project.fecha_fin)}</b>).<br>¿Deseas continuar de todas formas?`,
        showCancelButton: true, confirmButtonText: 'Sí, continuar', cancelButtonText: 'Revisar',
        confirmButtonColor: '#00A859',
      }).then(r => { if (r.isConfirmed) this.doSavePhase(); });
      return;
    }

    this.doSavePhase();
  }

  private doSavePhase(): void {
    const doSave = () => {
      if (this.editingPhaseId !== null) {
        const updateBody = { ...this.phaseForm, muebles_aplicados: this.phaseInsumos };
        this.projectSvc.updateFase(this.project.id, this.editingPhaseId, updateBody).subscribe({
          next: () => {
            void Swal.fire({ icon: 'success', title: 'Fase actualizada', timer: 1500 });
            this.closePhaseModal();
            this.loadProject(this.project.id);
          },
          error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo actualizar la fase', 'error'),
        });
      } else {
        this.projectSvc.createFase(this.project.id, this.phaseForm).subscribe({
          next: () => {
            void Swal.fire({ icon: 'success', title: 'Fase creada', text: `"${this.phaseForm.nombre}" añadida al proyecto`, timer: 1500 });
            this.closePhaseModal();
            this.loadProject(this.project.id);
          },
          error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo crear la fase', 'error'),
        });
      }
    };

    if (this.phaseConflictState === 'conflict') {
      const action = this.editingPhaseId !== null ? 'actualizar' : 'crear';
      void Swal.fire({
        title: 'Alta ocupación detectada',
        html: `<p style="font-size:0.88rem;margin:0">${this.phaseConflictMsg}<br><br>Como director puedes confirmar la fase de todas formas.</p>`,
        icon: 'warning', showCancelButton: true,
        confirmButtonText: `Sí, ${action} fase`, cancelButtonText: 'Revisar fechas',
        confirmButtonColor: '#00A859'
      }).then(r => { if (r.isConfirmed) doSave(); });
    } else {
      doSave();
    }
  }

  deletePhase(fase: any): void {
    if (!this.project) return;
    void Swal.fire({
      title: `¿Eliminar fase "${fase.nombre}"?`, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.projectSvc.deleteFase(this.project.id, fase.id).subscribe({
        next: () => {
          this.expandedFases.delete(fase.id);
          this.loadProject(this.project.id);
        },
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo eliminar la fase', 'error'),
      });
    });
  }

  // ── Task modal ─────────────────────────────────────────────────────────────
  showTaskModal = false;
  taskFaseId: number | null = null;
  taskFaseName = '';
  taskFase: any = null;
  editingTaskId: number | null = null;

  get taskDateMin(): string { return (this.taskFase?.fecha_inicio ?? this.project?.fecha_inicio ?? '').substring(0, 10); }
  get taskDateMax(): string { return (this.taskFase?.fecha_fin    ?? this.project?.fecha_fin    ?? '').substring(0, 10); }
  taskForm: { nombre: string; descripcion: string; id_tipo_tarea: number; fecha_inicio: string; fecha_fin: string; depende_de: number | null } =
    { nombre: '', descripcion: '', id_tipo_tarea: 2, fecha_inicio: '', fecha_fin: '', depende_de: null };

  tiposTarea: any[] = [];

  // Tareas de la misma fase que pueden usarse como predecesora (regla de negocio:
  // una tarea solo puede depender de otra de su misma fase), excluyendo la propia en edición.
  tareasParaDependencia(fase: any, excludeId: number | null = null): any[] {
    return (fase?.tareas ?? []).filter((t: any) => t.id !== excludeId);
  }

  openNewTask(fase: any): void {
    this.editingTaskId = null;
    this.taskFaseId    = fase.id;
    this.taskFaseName  = fase.nombre;
    this.taskFase      = fase;
    this.taskForm = {
      nombre: '', descripcion: '', id_tipo_tarea: 2, depende_de: null,
      fecha_inicio: (fase.fecha_inicio ?? '').substring(0, 10),
      fecha_fin:    (fase.fecha_fin    ?? '').substring(0, 10),
    };
    this.showTaskModal = true;
  }

  openEditTask(fase: any, tarea: any): void {
    this.editingTaskId = tarea.id;
    this.taskFaseId    = fase.id;
    this.taskFaseName  = fase.nombre;
    this.taskFase      = fase;
    this.taskForm = {
      nombre: tarea.nombre, descripcion: tarea.descripcion ?? '',
      id_tipo_tarea: tarea.id_tipo_tarea ?? 2,
      fecha_inicio: (tarea.fecha_inicio ?? '').substring(0, 10),
      fecha_fin: (tarea.fecha_fin ?? '').substring(0, 10),
      depende_de: tarea.depende_de ?? null,
    };
    this.showTaskModal = true;
  }

  closeTaskModal(): void { this.showTaskModal = false; }

  saveTask(): void {
    if (!this.taskForm.nombre || !this.taskForm.fecha_inicio || !this.taskForm.fecha_fin) {
      void Swal.fire('Atención', 'Completa nombre y fechas de la tarea', 'warning'); return;
    }
    if (!this.project || this.taskFaseId === null) return;
    const { fecha_inicio: ti, fecha_fin: tf } = this.taskForm;
    if (ti > tf) {
      void Swal.fire('Atención', 'La fecha de inicio no puede ser posterior a la de fin.', 'warning'); return;
    }
    if (this.taskFase && (ti < this.taskFase.fecha_inicio.substring(0, 10) || tf > this.taskFase.fecha_fin.substring(0, 10))) {
      void Swal.fire({
        icon: 'warning', title: 'Fuera del rango de la fase',
        html: `Las fechas están fuera de la fase <b>"${this.taskFaseName}"</b> (${this.formatDate(this.taskFase.fecha_inicio)} → ${this.formatDate(this.taskFase.fecha_fin)}).<br>¿Continuar de todas formas?`,
        showCancelButton: true, confirmButtonText: 'Sí, continuar', cancelButtonText: 'Revisar',
        confirmButtonColor: '#00A859',
      }).then(r => { if (r.isConfirmed) this.doSaveTask(); });
      return;
    }

    this.doSaveTask();
  }

  quitarDependencia(fase: any, tarea: any): void {
    void Swal.fire({
      title: `¿Quitar dependencia de "${tarea.nombre}"?`, icon: 'warning',
      text: `Dejará de depender de "${this.dependenciaNombre(tarea, fase)}".`,
      showCancelButton: true, confirmButtonText: 'Quitar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.projectSvc.updateTarea(fase.id, tarea.id, { depende_de: null }).subscribe({
        next: () => this.loadProject(this.project.id),
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo quitar la dependencia', 'error'),
      });
    });
  }

  private doSaveTask(): void {
    if (!this.project || this.taskFaseId === null) return;
    const body = {
      nombre: this.taskForm.nombre,
      descripcion: this.taskForm.descripcion,
      id_tipo_tarea: this.taskForm.id_tipo_tarea,
      fecha_inicio: `${this.taskForm.fecha_inicio} 07:00:00`,
      fecha_fin:    `${this.taskForm.fecha_fin} 18:00:00`,
      depende_de: this.taskForm.depende_de,
    };

    const faseId = this.taskFaseId!;
    if (this.editingTaskId !== null) {
      this.projectSvc.updateTarea(faseId, this.editingTaskId, body).subscribe({
        next: (resp: any) => {
          this.closeTaskModal();
          this.notifyHijasAfectadas(resp);
        },
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo actualizar la tarea', 'error'),
      });
    } else {
      this.projectSvc.createTarea(faseId, body).subscribe({
        next: () => {
          void Swal.fire({ icon: 'success', title: 'Tarea creada', text: 'Sin operarios asignados — el coordinador los asignará', timer: 2000 });
          this.closeTaskModal();
          this.loadProject(this.project.id);
        },
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo crear la tarea', 'error'),
      });
    }
  }

  // Tras editar fechas, el backend resetea recursos y bloquea a las hijas directas
  // (no las mueve solo). Se avisa de inmediato con los nombres; la lista recién
  // recargada las marca con el badge "Bloqueada" (pasa el mouse para ver el motivo).
  private notifyHijasAfectadas(resp: any): void {
    const hijas: any[] = resp?.hijas_afectadas ?? [];
    const reconciliacion = resp?.reconciliacion_recursos;
    this.loadProject(this.project.id);

    const hayReconciliacion = !!(reconciliacion?.reasignados?.length || reconciliacion?.no_disponibles?.length);

    if (hijas.length === 0 && !hayReconciliacion) {
      void Swal.fire({ icon: 'success', title: 'Tarea actualizada', timer: 1500 });
      return;
    }

    let html = '<p>Tarea actualizada correctamente.</p>';
    if (hijas.length > 0) {
      html += `<p><b>${hijas.length} tarea(s) dependiente(s)</b> perdieron sus operarios/maquinaria y quedaron bloqueadas porque esta tarea cambió de fecha:</p>`;
      html += '<ul style="text-align:left">' + hijas.map(h => `<li>${h.nombre}</li>`).join('') + '</ul>';
      html += '<p>Búscalas en la lista (badge "Bloqueada") y ajusta sus fechas una por una.</p>';
    }
    if (reconciliacion?.no_disponibles?.length) {
      html += `<p><b>${reconciliacion.no_disponibles.length} recurso(s)</b> ya no estaban disponibles tras reprogramar y deben reasignarse manualmente.</p>`;
    }

    void Swal.fire({ icon: 'warning', title: 'Tareas dependientes afectadas', html, confirmButtonText: 'Entendido' });
  }

  inactivarTarea(faseId: number, tarea: any): void {
    this.projectSvc.inactivarTarea(faseId, tarea.id, false).subscribe({
      next: (res) => {
        if (res.requiere_confirmacion) {
          const hijasHtml = (res.hijas as any[])
            .map((h: any) => `<li>${h.nombre}</li>`)
            .join('');
          void Swal.fire({
            title: `¿Inactivar "${tarea.nombre}"?`,
            icon: 'warning',
            html: `<p>Las siguientes tareas dependen de ella y perderán su vínculo:</p><ul style="text-align:left;margin-top:8px">${hijasHtml}</ul>`,
            showCancelButton: true,
            confirmButtonText: 'Inactivar de todas formas',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc2626'
          }).then(r => {
            if (!r.isConfirmed) return;
            this.projectSvc.inactivarTarea(faseId, tarea.id, true).subscribe({
              next: () => this.loadProject(this.project.id),
              error: (err: any) => void Swal.fire('Error', err.error?.message ?? 'No se pudo inactivar la tarea', 'error'),
            });
          });
        } else {
          this.loadProject(this.project.id);
        }
      },
      error: (err: any) => void Swal.fire('No permitido', err.error?.message ?? 'No se pudo inactivar la tarea', 'warning'),
    });
  }

  // ── Delegate modal ─────────────────────────────────────────────────────────
  showDelegateModal = false;
  delegatingFaseId: number | null = null;
  delegatingFaseName = '';
  delegateCoordinadorId: number | null = null;
  delegateInstrucciones = '';
  coordinators: any[] = [];
  private faseCoords = new Map<number, any>();

  getFaseCoord(faseId: number): any { return this.faseCoords.get(faseId) ?? null; }

  openDelegate(fase: any): void {
    this.delegatingFaseId   = fase.id;
    this.delegatingFaseName = fase.nombre;
    this.delegateCoordinadorId  = null;
    this.delegateInstrucciones  = '';
    this.phaseInsumos = [];
    this.showDelegateModal = true;
    if (!this.coordinators.length) this.loadCoordinators();
  }

  closeDelegateModal(): void { this.showDelegateModal = false; }

  loadCoordinators(): void {
    this.catalogSvc.getUsersByRole(3).subscribe({
      next: data => { this.coordinators = data; },
      error: () => {}
    });
  }

  saveDelegate(): void {
    if (!this.delegateCoordinadorId) {
      void Swal.fire('Atención', 'Selecciona un coordinador', 'warning'); return;
    }
    if (!this.project || this.delegatingFaseId === null) return;
    this.projectSvc.delegateFase(this.project.id, this.delegatingFaseId, {
      id_coordinador: this.delegateCoordinadorId,
      instrucciones: this.delegateInstrucciones,
      insumos_aplicados: this.phaseInsumos,
    }).subscribe({
      next: () => {
        const coord = this.coordinators.find(c => c.id === this.delegateCoordinadorId);
        if (coord && this.delegatingFaseId !== null) this.faseCoords.set(this.delegatingFaseId, coord);
        void Swal.fire({
          icon: 'success', title: 'Fase delegada',
          text: `La fase "${this.delegatingFaseName}" fue delegada a ${coord?.nombre} ${coord?.apellido ?? ''}. El coordinador recibirá la notificación.`,
          timer: 3000
        });
        this.closeDelegateModal();
        this.loadProject(this.project.id);
      },
      error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo delegar la fase', 'error'),
    });
  }

  getFaseProgressPct(fase: any): number {
    if (!fase.tareas?.length) return 0;
    const done = fase.tareas.filter((t: any) => t.estado === 'completada').length;
    return Math.round((done / fase.tareas.length) * 100);
  }

  getFaseTareasSummary(fase: any): string {
    const total = fase.tareas?.length ?? 0;
    if (!total) return 'Sin tareas';
    const done = fase.tareas.filter((t: any) => t.estado === 'completada').length;
    const prog = fase.tareas.filter((t: any) => t.estado === 'en_progreso').length;
    return `${done}/${total} completadas${prog ? `, ${prog} en progreso` : ''}`;
  }
}
