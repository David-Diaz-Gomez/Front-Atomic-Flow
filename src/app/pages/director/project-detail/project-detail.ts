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
import { ViewRoleService } from '../../../core/services/view-role.service';

interface PhaseMachineOcc { nombre: string; porcentaje: number; estado: 'ok' | 'alta' | 'saturada'; }

// ── Panel de asignación (exclusivo para el admin actuando como Director —
// el director normal solo delega la fase, el coordinador ya no existe como vista) ──
const HOURS = [7,8,9,10,11,12,13,14,15,16,17,18];
const DAY_START = 7; const DAY_H = 11;
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

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

  // Quick-order modal (abre desde recursos sin navegar)
  showQuickOrderModal = false;
  quickOrderRecurso: { id: number; nombre: string; nombre_proveedor: string | null; precio_unitario: number; cantidad: number } | null = null;
  quickOrderForm = { proveedor: '', cantidad: 1, valor_unitario: 0, fecha_requerida: '', fecha_solicitud: '', observacion: '' };
  quickOrderSaving = false;
  quickOrderErrors: Record<string, string> = {};
  orderedResourceIds = new Set<number>();  // recursos con al menos un pedido en esta sesión

  // ── Panel de asignación (solo admin) ────────────────────────────────────────
  operarios: any[] = [];
  maquinas:  any[] = [];
  showAssignPanel = false;
  assignTask: any = null;
  assignFase: any = null;
  assignTab: 'operario' | 'maquinaria' | 'insumos' = 'operario';

  opForm = { operario_id: null as number | null, hora_inicio: '08:00', hora_fin: '18:00' };
  opSelectedDates: string[] = [];
  opConflict: 'idle' | 'checking' | 'ok' | 'conflict' = 'idle';
  opConflictMsg = '';
  opConflictDetails: Array<{ fecha: string; info: string }> = [];
  pendingOpSlots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [];

  maqForm = { maquinaria_id: null as number | null, hora_inicio: '08:00', hora_fin: '18:00', operario_id: null as number | null };
  maqSelectedDates: string[] = [];
  pendingMaqSlots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [];

  taskDays: Date[] = [];
  private opOccCache:  any[] = [];
  private maqOccCache: any[] = [];

  readonly HOURS     = HOURS;
  readonly DAY_START = DAY_START;
  readonly DAY_H     = DAY_H;

  showCellModal = false;
  cellModalTitle = '';
  cellModalItems: Array<{ hora: string; nombre: string }> = [];

  readonly SLOT_COLORS = ['#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#0d9488'];
  slotColor(i: number): string { return this.SLOT_COLORS[i % this.SLOT_COLORS.length]; }

  get isAdmin(): boolean { return this.viewRoleService.isRealAdmin(); }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private notifSvc: NotificationService,
    private api: Api,
    private viewRoleService: ViewRoleService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const id = parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10);
      if (id) this.loadProject(id);
      this.catalogSvc.getTiposTarea().subscribe({ next: t => { this.tiposTarea = t; this.cdr.detectChanges(); }, error: () => {} });
      if (this.isAdmin) {
        this.projectSvc.getOperarios().subscribe({ next: d => { this.operarios = d; this.cdr.detectChanges(); }, error: () => {} });
        this.projectSvc.getMaquinaria().subscribe({ next: d => { this.maquinas = d; this.cdr.detectChanges(); }, error: () => {} });
      }
      this._notifSub = this.notifSvc.newNotif$.subscribe(n => {
        if (['tarea_completada', 'tarea_en_revision'].includes(n.tipo) && this.project &&
            (!n.proyecto_id || n.proyecto_id === this.project.id)) {
          this.loadProject(this.project.id);
        }
      });
    }
  }

  ngOnDestroy(): void { this._notifSub?.unsubscribe(); }

  private normalizeTarea(t: any): any {
    return {
      ...t,
      operarios: (t.operarios ?? t.asignados ?? []).map((o: any) => ({
        id: o.id ?? o.id_usuario, nombre: o.nombre ?? '', apellido: o.apellido ?? '',
        hora_inicio: o.hora_inicio ?? '07:00', hora_fin: o.hora_fin ?? '18:00', fechas: o.fechas ?? [],
      })),
      maquinarias: (t.maquinarias ?? t.maquinaria ?? []).map((m: any) => ({
        id: m.id ?? m.id_maquinaria, nombre: m.nombre ?? '',
        hora_inicio: m.hora_inicio ?? '07:00', hora_fin: m.hora_fin ?? '18:00', fechas: m.fechas ?? [],
      })),
      insumos_aplicados: (t.insumos_aplicados ?? (t.insumos ?? []).map((i: any) => i.id ?? i)),
    };
  }

  loadProject(id: number): void {
    this.loading = true;
    this.error = '';
    this.projectSvc.getProjectFull(id).subscribe({
      next: project => {
        project.fases = (project.fases ?? []).map((f: any) => ({
          ...f,
          tareas: (f.tareas ?? []).map((t: any) => this.normalizeTarea(t)),
        }));
        this.project = project;
        if (project.fases?.length) this.expandedFases.add(project.fases[0].id);

        // Si el panel de asignación estaba abierto, la referencia a assignTask apunta
        // al objeto viejo. Se busca la tarea actualizada y se recalcula taskDays para
        // que el calendario muestre las fechas correctas.
        if (this.showAssignPanel && this.assignTask) {
          const oldId = this.assignTask.id;
          let found: any = null;
          for (const f of project.fases) {
            found = (f.tareas ?? []).find((t: any) => t.id === oldId);
            if (found) break;
          }
          if (found) {
            this.assignTask = found;
            this.taskDays = this.buildDateRange(found.fecha_inicio, found.fecha_fin);
            this.opSelectedDates = this.taskDays.map((d: Date) => this.toStr(d));
            this.maqSelectedDates = this.taskDays.map((d: Date) => this.toStr(d));
          } else {
            this.closeAssign();
          }
        }

        this.loading = false;
        this.cdr.detectChanges();
        this.loadResourceSummary(id);
        this.loadProjectInsumos(id);
        this.loadProjectMuebles(id);
        this.loadSolicitudes(id);
        this.loadExistingPedidos(id);
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

  get quickOrderTotal(): string {
    const total = (Number(this.quickOrderForm.cantidad) || 0) * (Number(this.quickOrderForm.valor_unitario) || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(total);
  }

  get quickOrderLimite(): number {
    const r = this.quickOrderRecurso;
    return r ? r.precio_unitario * r.cantidad : 0;
  }

  get quickOrderExcede(): number {
    const total = (Number(this.quickOrderForm.cantidad) || 0) * (Number(this.quickOrderForm.valor_unitario) || 0);
    return Math.max(0, total - this.quickOrderLimite);
  }

  get quickOrderLimiteStr(): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(this.quickOrderLimite);
  }

  get quickOrderExcedeStr(): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(this.quickOrderExcede);
  }

  onPedirRecurso(r: { id: number; nombre: string; nombre_proveedor?: string | null; precio_unitario: number; cantidad: number }): void {
    const today = this.todayStr();
    const requerida = this.addDays(today, 3);
    this.quickOrderRecurso = { id: r.id, nombre: r.nombre, nombre_proveedor: r.nombre_proveedor ?? null, precio_unitario: r.precio_unitario, cantidad: r.cantidad };
    this.quickOrderForm = { proveedor: r.nombre_proveedor ?? '', cantidad: r.cantidad || 1, valor_unitario: r.precio_unitario || 0, fecha_requerida: requerida, fecha_solicitud: today, observacion: '' };
    this.quickOrderErrors = {};
    this.showQuickOrderModal = true;
    this.cdr.detectChanges();
  }

  closeQuickOrder(): void { this.showQuickOrderModal = false; this.quickOrderRecurso = null; this.cdr.detectChanges(); }

  submitQuickOrder(): void {
    this.quickOrderErrors = {};
    const f = this.quickOrderForm;
    if (!f.proveedor.trim()) this.quickOrderErrors['proveedor'] = 'El proveedor es obligatorio';
    if (!f.cantidad || f.cantidad <= 0) this.quickOrderErrors['cantidad'] = 'Cantidad inválida';
    if (!f.fecha_requerida) this.quickOrderErrors['fecha_requerida'] = 'Fecha requerida obligatoria';
    if (this.quickOrderExcede > 0 && !f.observacion.trim()) this.quickOrderErrors['observacion'] = 'Justifica el excedente del presupuesto';
    if (Object.keys(this.quickOrderErrors).length) { this.cdr.detectChanges(); return; }

    const r = this.quickOrderRecurso!;
    const valor = Number(f.cantidad) * Number(f.valor_unitario);
    const fechaSolicitudInt = Number(f.fecha_solicitud.replace(/-/g, ''));

    this.quickOrderSaving = true;
    this.api.createPedido({
      fecha_requerida:  f.fecha_requerida,
      fecha_solicitud:  fechaSolicitudInt,
      proveedor:        f.proveedor.trim(),
      detalle:          f.observacion.trim() || null,
      valor,
      items: [{ id_detalle_recurso: r.id, cantidad: Number(f.cantidad), valor_unitario: Number(f.valor_unitario) }],
    }).subscribe({
      next: () => {
        this.quickOrderSaving = false;
        this.orderedResourceIds.add(r.id);
        this.showQuickOrderModal = false;
        this.quickOrderRecurso = null;
        this.cdr.detectChanges();
      },
      error: () => { this.quickOrderSaving = false; this.cdr.detectChanges(); },
    });
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
  private loadExistingPedidos(id: number): void {
    this.api.getPedidosByProject(id).subscribe({
      next: (res: any) => {
        const pedidos: any[] = Array.isArray(res) ? res : (res?.data ?? []);
        for (const pedido of pedidos) {
          for (const item of (pedido.items ?? pedido.detalles ?? [])) {
            if (item.id_detalle_recurso) this.orderedResourceIds.add(item.id_detalle_recurso);
          }
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

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

  // ── Panel de asignación (exclusivo admin) ───────────────────────────────────
  // El director normal solo planifica y delega la fase al coordinador; como el
  // admin ya no tiene una vista Coordinador propia, este panel replica la
  // asignación de operarios/maquinaria/insumos que antes solo existía ahí.
  openAssign(task: any, fase: any): void {
    this.assignTask = task; this.assignFase = fase;
    this.assignTab  = 'operario';
    this.opForm     = { operario_id: null, hora_inicio: '08:00', hora_fin: '18:00' };
    this.maqForm    = { maquinaria_id: null, hora_inicio: '08:00', hora_fin: '18:00', operario_id: null };
    this.opConflict = 'idle'; this.opConflictMsg = ''; this.opConflictDetails = [];
    this.opOccCache = []; this.maqOccCache = [];
    this.pendingOpSlots  = [];
    this.pendingMaqSlots = [];
    this.taskDays         = this.buildDateRange(task.fecha_inicio, task.fecha_fin);
    this.opSelectedDates  = this.taskDays.map(d => this.toStr(d));
    this.maqSelectedDates = this.taskDays.map(d => this.toStr(d));
    this.showAssignPanel  = true;

    const desde = String(task.fecha_inicio ?? '').substring(0, 10);
    const hasta  = String(task.fecha_fin   ?? '').substring(0, 10);
    if (desde && hasta) {
      this.projectSvc.getOperarioOccupancy(desde, hasta).subscribe({ next: d => { this.opOccCache  = d; this.cdr.detectChanges(); }, error: () => {} });
      this.projectSvc.getMaqOccupancy(desde, hasta).subscribe({       next: d => { this.maqOccCache = d; this.cdr.detectChanges(); }, error: () => {} });
    }
  }

  closeAssign(): void { this.showAssignPanel = false; this.assignTask = null; }

  getBusyBlocks(operarioId: number, dateStr: string): Array<{ hi: number; hf: number; info: string; ownProject: boolean }> {
    const op  = this.opOccCache.find((o: any) => o.id === operarioId);
    const dia = (op?.dias ?? []).find((d: any) => d.fecha === dateStr);
    if (!dia) return [];
    return (dia.bloques ?? dia.tareas ?? []).map((b: any) => ({
      hi:   this.normHour(b.hora_inicio),
      hf:   this.normHour(b.hora_fin),
      info: `${b.proyecto ?? ''}: ${b.nombre ?? b.tarea ?? ''}`,
      ownProject: b.proyecto_id === this.project?.id,
    }));
  }

  getMaqBusyBlocks(maqId: number, dateStr: string): Array<{ hi: number; hf: number; info: string; ownProject: boolean }> {
    const maq = this.maqOccCache.find((m: any) => m.id === maqId);
    const dia = (maq?.dias ?? []).find((d: any) => d.fecha === dateStr);
    if (!dia) return [];
    return (dia.bloques ?? dia.tareas ?? []).map((b: any) => ({
      hi:   this.normHour(b.hora_inicio),
      hf:   this.normHour(b.hora_fin),
      info: `${b.proyecto ?? ''}: ${b.nombre ?? b.tarea ?? ''}`,
      ownProject: b.proyecto_id === this.project?.id,
    }));
  }

  openCellModal(tipo: 'op' | 'maq', resource: any, dateStr: string): void {
    const items: Array<{ hora: string; nombre: string }> = [];
    const busy = tipo === 'op' ? this.getBusyBlocks(resource.id, dateStr) : this.getMaqBusyBlocks(resource.id, dateStr);
    busy.forEach(b => items.push({ hora: `${this.fmtHour(b.hi)}–${this.fmtHour(b.hf)}`, nombre: b.info }));

    if (tipo === 'op' && this.opForm.operario_id === resource.id) {
      this.getPendingOpBlocks(dateStr).forEach(pb => {
        const slot = this.pendingOpSlots[pb.idx];
        items.push({ hora: `${slot.hora_inicio}–${slot.hora_fin}`, nombre: `En cola #${pb.idx + 1} (nueva asignación)` });
      });
      if (this.isOpDateSelected(dateStr)) {
        items.push({ hora: `${this.opForm.hora_inicio}–${this.opForm.hora_fin}`, nombre: 'Propuesta (nueva asignación)' });
      }
    }

    if (tipo === 'maq' && this.maqForm.maquinaria_id === resource.id) {
      this.getPendingMaqBlocks(dateStr).forEach(pb => {
        const slot = this.pendingMaqSlots[pb.idx];
        items.push({ hora: `${slot.hora_inicio}–${slot.hora_fin}`, nombre: `En cola #${pb.idx + 1} (nueva asignación)` });
      });
      if (this.isMaqDateSelected(dateStr)) {
        items.push({ hora: `${this.maqForm.hora_inicio}–${this.maqForm.hora_fin}`, nombre: 'Propuesta (nueva asignación)' });
      }
    }

    items.sort((a, b) => a.hora.localeCompare(b.hora));

    const nombreRecurso = tipo === 'op' ? `${resource.nombre} ${resource.apellido}` : resource.nombre;
    const [y, m, d] = dateStr.split('-').map(Number);
    const fecha = new Date(y, (m ?? 1) - 1, d ?? 1);
    this.cellModalTitle = `${nombreRecurso} — ${this.dayName(fecha)} ${this.dayLabel(fecha)}`;
    this.cellModalItems = items;
    this.showCellModal = true;
    this.cdr.detectChanges();
  }

  closeCellModal(): void { this.showCellModal = false; this.cdr.detectChanges(); }

  blockStyle(hi: number, hf: number): Record<string, string> {
    return { left: `${((hi - DAY_START) / DAY_H) * 100}%`, width: `${((hf - hi) / DAY_H) * 100}%` };
  }
  proposedBlockStyle():    Record<string, string> { return this.blockStyle(this.timeToNum(this.opForm.hora_inicio),  this.timeToNum(this.opForm.hora_fin));  }
  maqProposedBlockStyle(): Record<string, string> { return this.blockStyle(this.timeToNum(this.maqForm.hora_inicio), this.timeToNum(this.maqForm.hora_fin)); }

  proposedOverlaps(operarioId: number, dateStr: string): boolean {
    if (!this.opSelectedDates.includes(dateStr)) return false;
    const hi = this.timeToNum(this.opForm.hora_inicio), hf = this.timeToNum(this.opForm.hora_fin);
    return this.getBusyBlocks(operarioId, dateStr).some(b => hi < b.hf && hf > b.hi);
  }
  maqProposedOverlaps(maqId: number, dateStr: string): boolean {
    if (!this.maqSelectedDates.includes(dateStr)) return false;
    const hi = this.timeToNum(this.maqForm.hora_inicio), hf = this.timeToNum(this.maqForm.hora_fin);
    return this.getMaqBusyBlocks(maqId, dateStr).some(b => hi < b.hf && hf > b.hi);
  }

  onOperarioOrHoursChange(): void { this.opConflict = 'idle'; this.opConflictMsg = ''; this.opConflictDetails = []; }

  checkOpConflicts(): void {
    if (!this.opForm.operario_id) { void Swal.fire('Atención', 'Selecciona un operario primero', 'warning'); return; }
    this.opConflict = 'checking'; this.cdr.detectChanges();
    const hi = this.timeToNum(this.opForm.hora_inicio), hf = this.timeToNum(this.opForm.hora_fin);
    const conflicts: Array<{ fecha: string; info: string }> = [];
    for (const d of this.opSelectedDates) {
      for (const b of this.getBusyBlocks(this.opForm.operario_id!, d)) {
        if (hi < b.hf && hf > b.hi) conflicts.push({ fecha: d, info: b.info });
      }
    }
    this.opConflict        = conflicts.length ? 'conflict' : 'ok';
    this.opConflictMsg     = conflicts.length ? `Hay ${conflicts.length} choque(s) de horario.` : 'Horario disponible en todos los días seleccionados.';
    this.opConflictDetails = conflicts;
    this.cdr.detectChanges();
  }

  addOpSlot(): void {
    if (!this.opSelectedDates.length) { void Swal.fire('Atención', 'Selecciona al menos un día', 'warning'); return; }
    this.pendingOpSlots.push({ fechas: [...this.opSelectedDates], hora_inicio: this.opForm.hora_inicio, hora_fin: this.opForm.hora_fin });
    this.opSelectedDates = this.taskDays.map(d => this.toStr(d));
    this.opForm.hora_inicio = '08:00'; this.opForm.hora_fin = '18:00';
    this.opConflict = 'idle'; this.opConflictDetails = [];
    this.cdr.detectChanges();
  }
  removeOpSlot(i: number): void { this.pendingOpSlots.splice(i, 1); this.cdr.detectChanges(); }

  addMaqSlot(): void {
    if (!this.maqSelectedDates.length) { void Swal.fire('Atención', 'Selecciona al menos un día', 'warning'); return; }
    this.pendingMaqSlots.push({ fechas: [...this.maqSelectedDates], hora_inicio: this.maqForm.hora_inicio, hora_fin: this.maqForm.hora_fin });
    this.maqSelectedDates = this.taskDays.map(d => this.toStr(d));
    this.maqForm.hora_inicio = '08:00'; this.maqForm.hora_fin = '18:00';
    this.cdr.detectChanges();
  }
  removeMaqSlot(i: number): void { this.pendingMaqSlots.splice(i, 1); this.cdr.detectChanges(); }

  private reloadOccupancy(): void {
    const desde = String(this.assignTask?.fecha_inicio ?? '').substring(0, 10);
    const hasta  = String(this.assignTask?.fecha_fin   ?? '').substring(0, 10);
    if (!desde || !hasta) return;
    this.projectSvc.getOperarioOccupancy(desde, hasta).subscribe({ next: d => { this.opOccCache  = d; this.cdr.detectChanges(); }, error: () => {} });
    this.projectSvc.getMaqOccupancy(desde, hasta).subscribe({       next: d => { this.maqOccCache = d; this.cdr.detectChanges(); }, error: () => {} });
  }

  saveOperario(): void {
    if (!this.opForm.operario_id || !this.assignTask || !this.assignFase) {
      void Swal.fire('Atención', 'Selecciona un operario', 'warning'); return;
    }
    const slots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [...this.pendingOpSlots];
    if (this.opSelectedDates.length) slots.push({ fechas: [...this.opSelectedDates], hora_inicio: this.opForm.hora_inicio, hora_fin: this.opForm.hora_fin });
    if (!slots.length) { void Swal.fire('Atención', 'Agrega al menos un horario', 'warning'); return; }

    const doSave = () => {
      const op = this.operarios.find(o => o.id === this.opForm.operario_id);
      let done = 0;
      for (const slot of slots) {
        this.projectSvc.assignOperario(this.assignFase!.id, this.assignTask!.id, {
          id_usuario: this.opForm.operario_id, hora_inicio: slot.hora_inicio,
          hora_fin: slot.hora_fin, fechas: slot.fechas,
        }).subscribe({
          next: () => {
            if (op && done === 0) {
              this.assignTask!.operarios.push({ id: op.id, nombre: op.nombre, apellido: op.apellido ?? '', hora_inicio: slot.hora_inicio, hora_fin: slot.hora_fin, fechas: slot.fechas });
              if (this.assignTask!.estado === 'pendiente') this.assignTask!.estado = 'asignada';
            }
            done++;
            if (done === slots.length) {
              this.opForm = { operario_id: null, hora_inicio: '08:00', hora_fin: '18:00' };
              this.pendingOpSlots = [];
              this.opConflict = 'idle'; this.opConflictDetails = [];
              void Swal.fire({ icon: 'success', title: 'Operario asignado', timer: 1500 });
              this.reloadOccupancy();
              this.cdr.detectChanges();
            }
          },
          error: err => void Swal.fire('Error', err?.error?.message ?? 'No se pudo asignar', 'error'),
        });
      }
    };
    if (this.opConflict === 'conflict') {
      void Swal.fire({ title: 'Choque de horario', icon: 'warning', html: '<p>El operario tiene ocupación. Puedes forzar la asignación.</p>', showCancelButton: true, confirmButtonText: 'Forzar asignación', cancelButtonText: 'Revisar', confirmButtonColor: '#00A859' }).then(r => { if (r.isConfirmed) doSave(); });
    } else { doSave(); }
  }

  saveMaquina(): void {
    if (!this.maqForm.maquinaria_id || !this.assignTask || !this.assignFase) {
      void Swal.fire('Atención', 'Selecciona maquinaria', 'warning'); return;
    }
    const slots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [...this.pendingMaqSlots];
    if (this.maqSelectedDates.length) slots.push({ fechas: [...this.maqSelectedDates], hora_inicio: this.maqForm.hora_inicio, hora_fin: this.maqForm.hora_fin });
    if (!slots.length) { void Swal.fire('Atención', 'Agrega al menos un horario', 'warning'); return; }

    let done = 0;
    for (const slot of slots) {
      this.projectSvc.assignMaquinaria(this.assignFase.id, this.assignTask.id, {
        id_maquinaria: this.maqForm.maquinaria_id, hora_inicio: slot.hora_inicio,
        hora_fin: slot.hora_fin, fechas: slot.fechas, id_operario: this.maqForm.operario_id ?? null,
      }).subscribe({
        next: () => {
          const maq = this.maquinas.find(m => m.id === this.maqForm.maquinaria_id);
          if (maq && done === 0) {
            this.assignTask!.maquinarias.push({ id: maq.id, nombre: maq.nombre, hora_inicio: slot.hora_inicio, hora_fin: slot.hora_fin, fechas: slot.fechas });
            if (this.maqForm.operario_id) {
              const op = this.operarios.find(o => o.id === this.maqForm.operario_id);
              if (op && !this.assignTask!.operarios.some((o: any) => o.id === op.id))
                this.assignTask!.operarios.push({ id: op.id, nombre: op.nombre, apellido: op.apellido ?? '', hora_inicio: slot.hora_inicio, hora_fin: slot.hora_fin, fechas: slot.fechas });
            }
            if (this.assignTask!.estado === 'pendiente') this.assignTask!.estado = 'asignada';
          }
          done++;
          if (done === slots.length) {
            this.maqForm = { maquinaria_id: null, hora_inicio: '08:00', hora_fin: '18:00', operario_id: null };
            this.pendingMaqSlots = [];
            void Swal.fire({ icon: 'success', title: 'Maquinaria asignada', timer: 1500 });
            this.reloadOccupancy();
            this.cdr.detectChanges();
          }
        },
        error: err => void Swal.fire('Error', err?.error?.message ?? 'No se pudo asignar', 'error'),
      });
    }
  }

  saveInsumosAsignados(): void {
    if (!this.assignTask || !this.assignFase) return;
    this.projectSvc.saveInsumos(this.assignFase.id, this.assignTask.id, this.assignTask.insumos_aplicados).subscribe({
      next:  () => void Swal.fire({ icon: 'success', title: 'Insumos guardados', timer: 1500 }),
      error: () => void Swal.fire({ icon: 'success', title: 'Insumos guardados (local)', timer: 1500 }),
    });
  }

  toggleAssignInsumo(id: number): void {
    if (!this.assignTask) return;
    const i = this.assignTask.insumos_aplicados.indexOf(id);
    i === -1 ? this.assignTask.insumos_aplicados.push(id) : this.assignTask.insumos_aplicados.splice(i, 1);
  }
  isAssignInsumoSelected(id: number): boolean { return this.assignTask?.insumos_aplicados?.includes(id) ?? false; }

  removeOperario(task: any, opId: number): void {
    const faseId = this.project?.fases?.find((f: any) => f.tareas?.some((t: any) => t.id === task.id))?.id;
    if (faseId) this.projectSvc.removeOperario(faseId, task.id, opId).subscribe({ error: () => {} });
    task.operarios = (task.operarios ?? []).filter((o: any) => o.id !== opId);
    if (!task.operarios.length && !task.maquinarias?.length && task.estado !== 'bloqueada') task.estado = 'pendiente';
    this.cdr.detectChanges();
  }

  removeMaquina(task: any, maqId: number): void {
    const faseId = this.project?.fases?.find((f: any) => f.tareas?.some((t: any) => t.id === task.id))?.id;
    if (faseId) this.projectSvc.removeMaquina(faseId, task.id, maqId).subscribe({ error: () => {} });
    task.maquinarias = (task.maquinarias ?? []).filter((m: any) => m.id !== maqId);
    if (!task.operarios?.length && !task.maquinarias.length && task.estado !== 'bloqueada') task.estado = 'pendiente';
    this.cdr.detectChanges();
  }

  toggleOpDate(d: string): void {
    const i = this.opSelectedDates.indexOf(d); i === -1 ? this.opSelectedDates.push(d) : this.opSelectedDates.splice(i, 1);
    this.onOperarioOrHoursChange();
  }
  toggleMaqDate(d: string): void {
    const i = this.maqSelectedDates.indexOf(d); i === -1 ? this.maqSelectedDates.push(d) : this.maqSelectedDates.splice(i, 1);
  }
  isOpDateSelected(d: string):  boolean { return this.opSelectedDates.includes(d); }
  isMaqDateSelected(d: string): boolean { return this.maqSelectedDates.includes(d); }

  buildDateRange(from: string, to: string, max = 14): Date[] {
    const result: Date[] = [];
    const cur = new Date(`${String(from).substring(0, 10)}T00:00:00`);
    const end = new Date(`${String(to).substring(0, 10)}T00:00:00`);
    while (cur <= end && result.length < max) { result.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return result;
  }
  private timeToNum(t: string): number { const [h, m] = t.split(':').map(Number); return (h ?? 0) + (m ?? 0) / 60; }

  private normHour(val: any): number {
    if (typeof val === 'string') return this.timeToNum(val);
    if (typeof val === 'number' && val > 0 && val < 1) return Math.round(val * 24 * 100) / 100;
    return typeof val === 'number' ? val : 0;
  }

  getPendingOpBlocks(dateStr: string): Array<{ hi: number; hf: number; idx: number }> {
    return this.pendingOpSlots
      .map((s, i) => s.fechas.includes(dateStr) ? { hi: this.timeToNum(s.hora_inicio), hf: this.timeToNum(s.hora_fin), idx: i } : null)
      .filter((b): b is { hi: number; hf: number; idx: number } => b !== null);
  }

  getPendingMaqBlocks(dateStr: string): Array<{ hi: number; hf: number; idx: number }> {
    return this.pendingMaqSlots
      .map((s, i) => s.fechas.includes(dateStr) ? { hi: this.timeToNum(s.hora_inicio), hf: this.timeToNum(s.hora_fin), idx: i } : null)
      .filter((b): b is { hi: number; hf: number; idx: number } => b !== null);
  }

  fmtHour(h: number): string {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
  toStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  dayLabel(d: Date):   string { return String(d.getDate()); }
  dayName(d: Date):    string { return DAYS_SHORT[d.getDay()] ?? ''; }
}
