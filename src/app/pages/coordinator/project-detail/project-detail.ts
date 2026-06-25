import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';
import { Api } from '../../../core/services/api';

const HOURS = [7,8,9,10,11,12,13,14,15,16,17,18];
const DAY_START = 7; const DAY_H = 11;
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

@Component({
  selector: 'app-coord-project-detail',
  standalone: false,
  templateUrl: './project-detail.html',
  styleUrl:    './project-detail.scss',
})
export class CoordProjectDetail implements OnInit {
  project: any = null;
  loading = true;
  error = '';

  activeTab = 'fases';
  expandedFases = new Set<number>();

  operarios: any[] = [];
  maquinas:  any[] = [];

  showAssignPanel = false;
  assignTask: any = null;
  assignFase: any = null;
  assignTab: 'operario' | 'maquinaria' | 'insumos' = 'operario';

  opForm = { operario_id: null as number | null, hora_inicio: '07:00', hora_fin: '14:00' };
  opSelectedDates: string[] = [];
  opConflict: 'idle' | 'checking' | 'ok' | 'conflict' = 'idle';
  opConflictMsg = '';
  opConflictDetails: Array<{ fecha: string; info: string }> = [];
  pendingOpSlots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [];

  maqForm = { maquinaria_id: null as number | null, hora_inicio: '07:00', hora_fin: '14:00', operario_id: null as number | null };
  maqSelectedDates: string[] = [];
  pendingMaqSlots: Array<{ fechas: string[]; hora_inicio: string; hora_fin: string }> = [];

  taskDays: Date[] = [];
  private opOccCache:  any[] = [];
  private maqOccCache: any[] = [];

  readonly HOURS     = HOURS;
  readonly DAY_START = DAY_START;
  readonly DAY_H     = DAY_H;

  constructor(
    private route:      ActivatedRoute,
    private router:     Router,
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    private api:        Api,
    private cdr:        ChangeDetectorRef,
    @Inject(PLATFORM_ID) private pid: object,
  ) {}

  get isMobile(): boolean {
    return isPlatformBrowser(this.pid) && window.innerWidth <= 768;
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.pid)) {
      const id = parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10);
      this.loadAll(id);
    }
  }

  loadAll(projectId: number): void {
    this.loading = true;
    forkJoin({
      project:   this.projectSvc.getProjectFull(projectId).pipe(catchError(() => of(null))),
      operarios: this.projectSvc.getOperarios().pipe(catchError(() => of([]))),
      maquinas:  this.projectSvc.getMaquinaria().pipe(catchError(() => of([]))),
      recursos:  this.projectSvc.getProjectResources(projectId).pipe(catchError(() => of({}))),
    }).subscribe({
      next: ({ project, operarios, maquinas, recursos }) => {
        this.operarios = operarios;
        this.maquinas  = maquinas;
        if (project) {
          project.fases = (project.fases ?? []).map((f: any) => ({
            ...f,
            delegada_a_mi:          f.delegada_a_mi ?? true,
            instrucciones_director: f.instrucciones ?? f.instrucciones_director ?? null,
            tareas: (f.tareas ?? []).map((t: any) => this.normalizeTarea(t)),
          }));
          project.insumos = this.extractInsumos(recursos);
          this.project = project;
          const primera = project.fases[0];
          if (primera) this.expandedFases.add(primera.id);
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'No se pudo cargar el proyecto.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private normalizeTarea(t: any): any {
    const tipoRaw = t.tipo_tarea;
    const tipoLabel = typeof tipoRaw === 'string'
      ? tipoRaw
      : (tipoRaw?.nombre ?? tipoRaw?.name ?? t.tipo ?? '');
    return {
      ...t,
      tipo_tarea: tipoLabel,
      operarios: (t.operarios ?? t.asignados ?? []).map((o: any) => ({
        id: o.id ?? o.id_usuario, nombre: o.nombre ?? '', apellido: o.apellido ?? '',
        hora_inicio: o.hora_inicio ?? '07:00', hora_fin: o.hora_fin ?? '18:00', fechas: o.fechas ?? [],
      })),
      maquinarias: (t.maquinarias ?? t.maquinaria ?? []).map((m: any) => ({
        id: m.id ?? m.id_maquinaria, nombre: m.nombre ?? '',
        hora_inicio: m.hora_inicio ?? '07:00', hora_fin: m.hora_fin ?? '18:00', fechas: m.fechas ?? [],
      })),
      insumos_aplicados:     (t.insumos_aplicados ?? (t.insumos ?? []).map((i: any) => i.id ?? i)),
      evidencias_pendientes: t.evidencias_pendientes ?? 0,
    };
  }

  private extractInsumos(recursos: any): any[] {
    const labelMap: Record<string, string> = {
      materia_prima: 'Materia Prima', proveedores: 'Proveedor',
      impresiones: 'Impresiones', carpinteria: 'Carpintería', mano_de_obra: 'Mano de Obra',
    };
    const all: any[] = [];
    if (!recursos) return all;

    // Formato A: claves directas { materia_prima: [...], proveedores: [...] }
    if (recursos.materia_prima || recursos.proveedores || recursos.carpinteria || recursos.impresiones || recursos.mano_de_obra) {
      Object.entries(labelMap).forEach(([key, label]) => {
        (recursos[key] ?? []).forEach((item: any) => {
          if (item.nombre) all.push({ id: item.id ?? item.id_recurso ?? item.detalle_id, nombre: item.nombre, tipo: label });
        });
      });
      return all;
    }

    // Formato B: array o { categorias/grupos/secciones: [...] }
    const cats: any[] = Array.isArray(recursos) ? recursos : (recursos?.categorias ?? recursos?.grupos ?? recursos?.secciones ?? []);
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

  // ── Navegación ─────────────────────────────────────────────────────────────
  setTab(t: string): void { this.activeTab = t; }
  toggleFase(id: number): void { this.expandedFases.has(id) ? this.expandedFases.delete(id) : this.expandedFases.add(id); }
  isFaseExpanded(id: number): boolean { return this.expandedFases.has(id); }
  goBack():    void { this.router.navigate(['/dashboard/coordinator/home']); }
  goToGantt(): void { this.router.navigate(['/dashboard/coordinator/gantt']); }

  // ── Panel de asignación ────────────────────────────────────────────────────
  openAssign(task: any, fase: any): void {
    this.assignTask = task; this.assignFase = fase;
    this.assignTab  = 'operario';
    this.opForm     = { operario_id: null, hora_inicio: '07:00', hora_fin: '14:00' };
    this.maqForm    = { maquinaria_id: null, hora_inicio: '07:00', hora_fin: '14:00', operario_id: null };
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

  // ── Ocupación ─────────────────────────────────────────────────────────────
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

  // ── Modal de celda (calendario de disponibilidad) ──────────────────────────
  showCellModal = false;
  cellModalTitle = '';
  cellModalItems: Array<{ hora: string; nombre: string }> = [];

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

  // ── Multi-slot ────────────────────────────────────────────────────────────
  addOpSlot(): void {
    if (!this.opSelectedDates.length) { void Swal.fire('Atención', 'Selecciona al menos un día', 'warning'); return; }
    this.pendingOpSlots.push({ fechas: [...this.opSelectedDates], hora_inicio: this.opForm.hora_inicio, hora_fin: this.opForm.hora_fin });
    this.opSelectedDates = this.taskDays.map(d => this.toStr(d));
    this.opForm.hora_inicio = '07:00'; this.opForm.hora_fin = '14:00';
    this.opConflict = 'idle'; this.opConflictDetails = [];
    this.cdr.detectChanges();
  }
  removeOpSlot(i: number): void { this.pendingOpSlots.splice(i, 1); this.cdr.detectChanges(); }

  addMaqSlot(): void {
    if (!this.maqSelectedDates.length) { void Swal.fire('Atención', 'Selecciona al menos un día', 'warning'); return; }
    this.pendingMaqSlots.push({ fechas: [...this.maqSelectedDates], hora_inicio: this.maqForm.hora_inicio, hora_fin: this.maqForm.hora_fin });
    this.maqSelectedDates = this.taskDays.map(d => this.toStr(d));
    this.maqForm.hora_inicio = '07:00'; this.maqForm.hora_fin = '14:00';
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

  // ── Guardar ────────────────────────────────────────────────────────────────
  saveOperario(): void {
    if (!this.opForm.operario_id || !this.assignTask || !this.assignFase) {
      void Swal.fire('Atención', 'Selecciona un operario', 'warning'); return;
    }
    // Construir slots: los pendientes + el actual si tiene fechas seleccionadas
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
              this.opForm = { operario_id: null, hora_inicio: '07:00', hora_fin: '14:00' };
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
            this.maqForm = { maquinaria_id: null, hora_inicio: '07:00', hora_fin: '14:00', operario_id: null };
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

  saveInsumos(): void {
    if (!this.assignTask || !this.assignFase) return;
    this.projectSvc.saveInsumos(this.assignFase.id, this.assignTask.id, this.assignTask.insumos_aplicados).subscribe({
      next:  () => void Swal.fire({ icon: 'success', title: 'Insumos guardados', timer: 1500 }),
      error: () => void Swal.fire({ icon: 'success', title: 'Insumos guardados (local)', timer: 1500 }),
    });
  }

  toggleInsumo(id: number): void {
    if (!this.assignTask) return;
    const i = this.assignTask.insumos_aplicados.indexOf(id);
    i === -1 ? this.assignTask.insumos_aplicados.push(id) : this.assignTask.insumos_aplicados.splice(i, 1);
  }
  isInsumoSelected(id: number): boolean { return this.assignTask?.insumos_aplicados?.includes(id) ?? false; }

  removeOperario(task: any, opId: number): void {
    const faseId = this.project?.fases?.find((f: any) => f.tareas?.some((t: any) => t.id === task.id))?.id;
    if (faseId) this.projectSvc.removeOperario(faseId, task.id, opId).subscribe({ error: () => {} });
    task.operarios = (task.operarios ?? []).filter((o: any) => o.id !== opId);
    // El backend nunca cambia el estado al quitar un recurso; si la tarea está bloqueada
    // (por dependencia o por movimiento), debe seguir bloqueada sin importar sus recursos.
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

  get fasesDelegate(): any[] { return this.project?.fases?.filter((f: any) => f.delegada_a_mi !== false) ?? []; }
  get fasesAll():      any[] { return this.project?.fases ?? []; }

  insumoNombre(id: number): string { return this.project?.insumos?.find((i: any) => i.id === id)?.nombre ?? `#${id}`; }
  insumoTipo(id: number):   string { return this.project?.insumos?.find((i: any) => i.id === id)?.tipo   ?? ''; }

  progressPct(fase: any): number {
    if (!fase.tareas?.length) return 0;
    return Math.round((fase.tareas.filter((t: any) => t.estado === 'completada').length / fase.tareas.length) * 100);
  }

  buildDateRange(from: string, to: string, max = 14): Date[] {
    const result: Date[] = []; const cur = new Date(from); const end = new Date(to);
    while (cur <= end && result.length < max) { result.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return result;
  }
  private timeToNum(t: string): number { const [h, m] = t.split(':').map(Number); return (h ?? 0) + (m ?? 0) / 60; }

  // Normaliza hora desde cualquier formato que mande el back (decimal de día, string "HH:MM", número entero)
  private normHour(val: any): number {
    if (typeof val === 'string') return this.timeToNum(val);
    if (typeof val === 'number' && val > 0 && val < 1) return Math.round(val * 24 * 100) / 100;
    return typeof val === 'number' ? val : 0;
  }

  // ── Nueva tarea ───────────────────────────────────────────────────────────
  showNewTaskModal = false;
  newTaskFase: any = null;
  tiposTarea: { id: number; nombre: string }[] = [];
  taskForm = { nombre: '', descripcion: '', id_tipo_tarea: null as number | null, fecha_inicio: '', fecha_fin: '', depende_de: null as number | null };
  taskSaving = false;

  // Tareas de la misma fase que pueden usarse como predecesora (regla de negocio:
  // una tarea solo puede depender de otra de su misma fase), excluyendo la propia en edición.
  tareasParaDependencia(fase: any, excludeId: number | null = null): any[] {
    return (fase?.tareas ?? []).filter((t: any) => t.id !== excludeId);
  }

  openNewTask(fase: any): void {
    this.newTaskFase = fase;
    this.taskForm = {
      nombre: '', descripcion: '', id_tipo_tarea: null, depende_de: null,
      fecha_inicio: String(fase.fecha_inicio ?? '').substring(0, 10),
      fecha_fin:    String(fase.fecha_fin    ?? '').substring(0, 10),
    };
    this.showNewTaskModal = true;
    if (!this.tiposTarea.length) {
      this.catalogSvc.getTiposTarea().subscribe({
        next: (d: any[]) => {
          this.tiposTarea = d.map(t => ({ id: t.id, nombre: t.nombre ?? String(t) }));
          this.cdr.detectChanges();
        },
        error: () => { this.tiposTarea = []; },
      });
    }
    this.cdr.detectChanges();
  }

  closeNewTask(): void { this.showNewTaskModal = false; this.newTaskFase = null; this.cdr.detectChanges(); }

  // ── Editar tarea ──────────────────────────────────────────────────────────
  showEditTaskModal = false;
  editTask: any = null;
  editTaskFase: any = null;
  editForm = { nombre: '', descripcion: '', id_tipo_tarea: null as number | null, fecha_inicio: '', fecha_fin: '', depende_de: null as number | null };
  editSaving = false;

  openEditTask(task: any, fase: any): void {
    this.editTask = task;
    this.editTaskFase = fase;
    const resolveTipoId = () => typeof task.tipo_tarea === 'string'
      ? (this.tiposTarea.find(t => t.nombre === task.tipo_tarea)?.id ?? null)
      : (task.id_tipo_tarea ?? null);
    this.editForm = {
      nombre:        task.nombre ?? '',
      descripcion:   task.descripcion ?? '',
      id_tipo_tarea: resolveTipoId(),
      fecha_inicio:  String(task.fecha_inicio ?? '').substring(0, 10),
      fecha_fin:     String(task.fecha_fin    ?? '').substring(0, 10),
      depende_de:    task.depende_de ?? null,
    };
    this.showEditTaskModal = true;
    if (!this.tiposTarea.length) {
      // La primera vez que se abre este modal, tiposTarea aún no cargó: si task.tipo_tarea
      // venía como string, resolveTipoId() no lo encuentra y queda null (botón deshabilitado
      // hasta la próxima apertura). Se recalcula apenas la lista termine de cargar.
      this.catalogSvc.getTiposTarea().subscribe({
        next: (d: any[]) => {
          this.tiposTarea = d.map(t => ({ id: t.id, nombre: t.nombre ?? String(t) }));
          if (this.editForm.id_tipo_tarea === null) this.editForm.id_tipo_tarea = resolveTipoId();
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    }
    this.cdr.detectChanges();
  }

  closeEditTask(): void { this.showEditTaskModal = false; this.editTask = null; this.cdr.detectChanges(); }

  saveEditTask(): void {
    if (!this.editTask || !this.editTaskFase) return;
    this.editSaving = true;
    this.projectSvc.updateTarea(this.editTaskFase.id, this.editTask.id, {
      nombre:        this.editForm.nombre,
      descripcion:   this.editForm.descripcion  || null,
      id_tipo_tarea: this.editForm.id_tipo_tarea,
      fecha_inicio:  this.editForm.fecha_inicio || null,
      fecha_fin:     this.editForm.fecha_fin    || null,
      depende_de:    this.editForm.depende_de,
    }).subscribe({
      next: (resp: any) => {
        this.editSaving = false;
        const editedTask = this.editTask;
        const hijas: any[] = resp?.hijas_afectadas ?? [];
        const reconciliacion = resp?.reconciliacion_recursos;
        const hayReconciliacion = !!(reconciliacion?.reasignados?.length || reconciliacion?.no_disponibles?.length);
        // Cambiar fecha_inicio/fecha_fin/depende_de puede recalcular el estado de ESTA tarea
        // (p.ej. de "bloqueada por movimiento" a "esperando predecesora") sin que eso se
        // refleje como hijas_afectadas ni reconciliacion_recursos en la respuesta — esos campos
        // solo cubren efectos sobre OTRAS tareas. Por eso, si se tocó alguno de esos campos,
        // se recarga siempre en vez de confiar en el parche local (Object.assign).
        const fechasOdependenciaCambiaron =
          this.editForm.fecha_inicio !== String(editedTask.fecha_inicio ?? '').substring(0, 10) ||
          this.editForm.fecha_fin    !== String(editedTask.fecha_fin    ?? '').substring(0, 10) ||
          this.editForm.depende_de   !== (editedTask.depende_de ?? null);
        this.closeEditTask();

        if (hijas.length === 0 && !hayReconciliacion && !fechasOdependenciaCambiaron) {
          const tipoNombre = this.tiposTarea.find(t => t.id === this.editForm.id_tipo_tarea)?.nombre ?? editedTask.tipo_tarea;
          Object.assign(editedTask, {
            nombre: this.editForm.nombre, descripcion: this.editForm.descripcion || null, tipo_tarea: tipoNombre,
            fecha_inicio: this.editForm.fecha_inicio, fecha_fin: this.editForm.fecha_fin, depende_de: this.editForm.depende_de,
            estado: resp?.estado ?? editedTask.estado, bloqueada_por_movimiento: resp?.bloqueada_por_movimiento ?? false,
          });
          void Swal.fire({ icon: 'success', title: 'Tarea actualizada', timer: 1400, showConfirmButton: false });
          this.cdr.detectChanges();
          return;
        }

        // Se tocaron fechas/dependencia, o hubo efectos sobre otras tareas (hijas bloqueadas /
        // recursos reconciliados): se recarga el proyecto para que estados, badges y
        // asignaciones queden frescos (incluye el calendario de ocupación al reabrir "Asignar").
        this.loadAll(this.project.id);
        if (hijas.length > 0 || hayReconciliacion) {
          this.notifyHijasAfectadas(hijas, reconciliacion);
        } else {
          void Swal.fire({ icon: 'success', title: 'Tarea actualizada', timer: 1400, showConfirmButton: false });
        }
      },
      error: (err: any) => {
        this.editSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo actualizar', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  // Tras editar fechas, el backend resetea recursos y bloquea a las hijas directas
  // (no las mueve solo). Se avisa de inmediato con los nombres; la lista recién
  // recargada las marca con el badge "Bloqueada" (pasa el mouse para ver el motivo).
  private notifyHijasAfectadas(hijas: any[], reconciliacion: any): void {
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

  // ── Subir evidencia ───────────────────────────────────────────────────────
  showEvidModal = false;
  evidTask: any = null;
  evidFiles: File[] = [];
  evidPreviews: string[] = [];
  evidDesc = '';
  evidSaving = false;

  openEvidModal(task: any): void {
    this.evidTask = task;
    this.evidFiles = [];
    this.evidPreviews = [];
    this.evidDesc = '';
    this.showEvidModal = true;
    this.cdr.detectChanges();
  }

  closeEvidModal(): void { this.showEvidModal = false; this.evidTask = null; this.cdr.detectChanges(); }

  onEvidFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.evidFiles = Array.from(input.files).slice(0, 10);
    this.evidPreviews = [];
    for (const f of this.evidFiles) {
      const reader = new FileReader();
      reader.onload = (e: any) => { this.evidPreviews.push(e.target.result); this.cdr.detectChanges(); };
      reader.readAsDataURL(f);
    }
    this.cdr.detectChanges();
  }

  removeEvidFile(i: number): void {
    this.evidFiles.splice(i, 1);
    this.evidPreviews.splice(i, 1);
    this.cdr.detectChanges();
  }

  subirEvidencia(): void {
    if (!this.evidFiles.length || !this.evidTask) return;
    this.evidSaving = true;
    const fd = new FormData();
    for (const f of this.evidFiles) fd.append('imagen', f);
    fd.append('descripcion', this.evidDesc);
    fd.append('id_coordinador', String(this.api.getCurrentUserId() ?? ''));

    this.projectSvc.subirEvidencias(this.evidTask.id, fd).subscribe({
      next: () => {
        this.evidSaving = false;
        void Swal.fire({ icon: 'success', title: 'Evidencia subida', timer: 1500, showConfirmButton: false });
        this.closeEvidModal();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.evidSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo subir la evidencia', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  saveNewTask(): void {
    if (!this.taskForm.nombre.trim() || !this.newTaskFase || !this.project) return;
    this.taskSaving = true;
    this.projectSvc.createTarea(this.newTaskFase.id, {
      nombre:          this.taskForm.nombre,
      descripcion:     this.taskForm.descripcion  || null,
      id_tipo_tarea:   this.taskForm.id_tipo_tarea,
      fecha_inicio:    this.taskForm.fecha_inicio || null,
      fecha_fin:       this.taskForm.fecha_fin    || null,
      depende_de:      this.taskForm.depende_de,
    }).subscribe({
      next: (nueva: any) => {
        this.taskSaving = false;
        const fase = this.project.fases.find((f: any) => f.id === this.newTaskFase!.id);
        if (fase) {
          const tipoNombre = this.tiposTarea.find(t => t.id === this.taskForm.id_tipo_tarea)?.nombre ?? '';
          fase.tareas.push(this.normalizeTarea({ ...nueva, tipo_tarea: tipoNombre }));
        }
        void Swal.fire({ icon: 'success', title: 'Tarea creada', timer: 1400, showConfirmButton: false });
        this.closeNewTask();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.taskSaving = false;
        void Swal.fire('Error', err?.error?.message ?? 'No se pudo crear la tarea', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  readonly SLOT_COLORS = ['#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#0d9488'];
  slotColor(i: number): string { return this.SLOT_COLORS[i % this.SLOT_COLORS.length]; }

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
  monthLabel(d: Date): string { return MONTHS[d.getMonth()] ?? ''; }
  formatDate(s: string): string {
    if (!s) return ''; const p = s.split(/[-T]/);
    return `${parseInt(p[2] ?? '1', 10)} ${MONTHS[parseInt(p[1] ?? '1', 10) - 1] ?? ''}`;
  }
  estadoLabel(t: any): string {
    const e = t?.estado ?? t;
    if (e === 'bloqueada') return 'Bloqueada';
    const m: Record<string, string> = { pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En Progreso', completada: 'Completada', en_revision: 'En Revisión' };
    return m[e] ?? e;
  }
  estadoBadge(t: any): string {
    const e = t?.estado ?? t;
    // Mismo color que "Pendiente": el motivo del bloqueo se explica en el tooltip, no con un color de alarma.
    if (e === 'bloqueada') return 'tbadge-pending';
    const m: Record<string, string> = { pendiente: 'tbadge-pending', asignada: 'tbadge-assigned', en_progreso: 'tbadge-progress', completada: 'tbadge-done', en_revision: 'tbadge-review' };
    return m[e] ?? 'tbadge-pending';
  }
  estadoTooltip(t: any): string {
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
  hourLabel(h: number): string { return `${h}:00`; }
}
