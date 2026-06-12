import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';

interface PhaseMachineOcc { nombre: string; porcentaje: number; estado: 'ok' | 'alta' | 'saturada'; }

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador', en_revision: 'En Revisión', rechazado: 'Rechazado',
  aprobado: 'Aprobado', en_produccion: 'En Producción', pausado: 'Pausado',
  completado: 'Completado', cancelado: 'Cancelado',
  pendiente: 'Pendiente', asignada: 'Asignada',
  en_progreso: 'En Progreso', completada: 'Completada', bloqueada: 'Bloqueada',
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
export class ProjectDetail implements OnInit {
  project: any = null;
  activeTab = 'resumen';
  expandedFases = new Set<number>();
  loading = true;
  error = '';

  // Resource summary from API
  resourceSummary: any[] = [];
  totalRecursosValue = 0;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const id = parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10);
      if (id) this.loadProject(id);
      this.catalogSvc.getTiposTarea().subscribe({ next: t => { this.tiposTarea = t; this.cdr.detectChanges(); }, error: () => {} });
    }
  }

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
      asignada: 'state-assigned', pendiente: 'state-pending', bloqueada: 'state-blocked'
    };
    return map[estado] ?? 'state-pending';
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

  // ── Insumos disponibles del proyecto (para selector en delegación/fase) ───
  private loadProjectInsumos(id: number): void {
    this.projectSvc.getProjectResources(id).subscribe({
      next: raw => {
        if (this.project) this.project.insumos = this.extractAllInsumos(raw);
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
    this.phaseInsumos = [...(fase.insumos_aplicados ?? [])];
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
        const updateBody = { ...this.phaseForm, insumos_aplicados: this.phaseInsumos };
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
  taskForm: { nombre: string; descripcion: string; id_tipo_tarea: number; fecha_inicio: string; fecha_fin: string } =
    { nombre: '', descripcion: '', id_tipo_tarea: 2, fecha_inicio: '', fecha_fin: '' };

  tiposTarea: any[] = [];

  openNewTask(fase: any): void {
    this.editingTaskId = null;
    this.taskFaseId    = fase.id;
    this.taskFaseName  = fase.nombre;
    this.taskFase      = fase;
    this.taskForm = {
      nombre: '', descripcion: '', id_tipo_tarea: 2,
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

  private doSaveTask(): void {
    if (!this.project || this.taskFaseId === null) return;
    const body = {
      nombre: this.taskForm.nombre,
      descripcion: this.taskForm.descripcion,
      id_tipo_tarea: this.taskForm.id_tipo_tarea,
      fecha_inicio: `${this.taskForm.fecha_inicio} 07:00:00`,
      fecha_fin:    `${this.taskForm.fecha_fin} 18:00:00`,
    };

    const faseId = this.taskFaseId!;
    if (this.editingTaskId !== null) {
      this.projectSvc.updateTarea(faseId, this.editingTaskId, body).subscribe({
        next: () => {
          void Swal.fire({ icon: 'success', title: 'Tarea actualizada', timer: 1500 });
          this.closeTaskModal();
          this.loadProject(this.project.id);
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

  deleteTask(faseId: number, tarea: any): void {
    if (['en_progreso', 'completada'].includes(tarea.estado)) {
      void Swal.fire('No permitido', 'La tarea está en progreso o completada', 'warning'); return;
    }
    void Swal.fire({
      title: `¿Eliminar tarea "${tarea.nombre}"?`, icon: 'warning',
      showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.projectSvc.changeTareaStatus(faseId, tarea.id, 'bloqueada', 'Eliminada por director').subscribe({
        next: () => this.loadProject(this.project.id),
        error: err => void Swal.fire('Error', err.error?.message ?? 'No se pudo eliminar la tarea', 'error'),
      });
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
