import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import Swal from 'sweetalert2';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

// ── Interfaces ──────────────────────────────────────────────────────────────
interface HorarioBlock {
  resource: string; tipo: 'maquina' | 'operario';
  hora_inicio: number; hora_fin: number;
}
interface TareaHorario {
  [dia: string]: HorarioBlock[];  // key = "YYYY-MM-DD"
}
interface Tarea {
  id: number; nombre: string; estado: string;
  fecha_inicio: string; fecha_fin: string;
  operarios: string[];
  maquinarias: string[];
  tipo: string;
  horario?: TareaHorario;
  horarioLoading?: boolean;
  depende_de?: number | null;
  bloqueada_por_movimiento?: boolean;
}
interface Fase {
  id: number; nombre: string; color: string;
  fecha_inicio: string; fecha_fin: string;
  tareas: Tarea[];
}
interface GanttProject {
  id: number; nombre: string; fecha_inicio: string; fecha_fin: string; fases: Fase[];
}
interface MachineGlobalOcc {
  nombre: string; porcentaje: number; proyectos: string[];
  estado: 'libre' | 'disponible' | 'alta' | 'saturada';
}
interface DateEditState {
  tarea_id: number; fase_id: number; nombre: string;
  fecha_inicio: string; fecha_fin: string;
  conflictCheck: 'idle' | 'checking' | 'ok' | 'conflict';
  conflictMsg: string;
}
interface DiaBloque {
  nombre: string; proyecto_id: number; proyecto: string;
  hora_inicio: string; hora_fin: string; horas: number;
}
interface DiaData {
  fecha: string; horas_ocupadas: number; bloques: DiaBloque[];
}

const DAY_START  = 7;
const DAY_END    = 18;
const DAY_HOURS  = DAY_END - DAY_START;
const HOURS_LABELS = [7,8,9,10,11,12,13,14,15,16,17];
const DAYS_SHORT   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const PHASE_COLORS = ['#8DC63F','#00A859','#E6E13C','#8fb3b3','#e67e22','#9b59b6','#3498db'];
const BAR_CLASSES: Record<string,string> = {
  completada:'bar-done', en_progreso:'bar-progress', asignada:'bar-assigned',
  pendiente:'bar-pending', bloqueada:'bar-blocked'
};
const COLOR_POOL = ['#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#00BCD4'];

@Component({
  selector: 'app-gantt',
  standalone: false,
  templateUrl: './gantt.html',
  styleUrl: './gantt.scss'
})
export class Gantt implements OnInit {
  // ── State ────────────────────────────────────────────────────────────────
  projects: GanttProject[] = [];
  selectedProjectId: number | null = null;
  loading = true;
  error = '';

  ganttDays: Date[]  = [];
  readonly cellWidth = 36;

  machines:  string[] = [];
  operators: string[] = [];
  calendarWeekStart: Date = new Date();
  calendarDays: Date[]    = [];

  showPanel = false;
  panelTask: Tarea | null = null;
  panelFase: Fase | null  = null;
  panelDays: Date[] = [];
  scheduleHours: number[] = HOURS_LABELS;

  globalOcc:  MachineGlobalOcc[] = [];
  weeklyOcc:  any[] = [];
  weeklyOperariosOcc: any[] = [];
  projectColorMap = new Map<number, string>();
  muebleMarkers: { id: number; nombre: string; fecha_fin: string }[] = [];

  dateEdit: DateEditState | null = null;
  tooltip: { text: string; x: number; y: number } | null = null;

  showTaskDetailModal = false;
  modalTask: Tarea | null = null;
  modalFaseName = '';
  modalDays: Date[] = [];

  get selectedProject(): GanttProject | undefined {
    return this.projects.find(p => p.id === this.selectedProjectId);
  }

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private projectSvc: ProjectService,
    private apiSvc: Api,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.calendarWeekStart = this.startOfWeek(new Date());
      this.buildCalendarWeek();
      const preselect = this.route.snapshot.queryParamMap.get('proyecto');
      this.loadProjects(preselect ? Number(preselect) : null);
    }
  }

  // ── Load ─────────────────────────────────────────────────────────────────
  loadProjects(preselectId: number | null = null): void {
    this.loading = true;
    this.error   = '';
    const userId = this.apiSvc.getCurrentUserId();

    this.projectSvc.getProjects({ director: userId, limit: 50 }).subscribe({
  next: ({ data }) => {

    console.log('Proyectos obtenidos:', data);

    // ✅ FILTRAR POR APROBACIÓN REAL
    const approved = data.filter((p: any) => {
      return Number(p.aprobado) === 1;
    });

    console.log(
      approved.length
        ? 'Proyectos aprobados encontrados:'
        : 'No se encontraron proyectos aprobados.',
      approved
    );

    if (!approved.length) {
      this.loading = false;
      this.error = 'No hay proyectos aprobados con fases disponibles.';
      this.cdr.detectChanges();
      return;
    }

    // construir shells — id siempre como número para que los comparadores === funcionen
    this.projects = approved.map((p: any) => ({
      id: Number(p.id),
      nombre: p.nombre,
      fecha_inicio: p.fecha_inicio ?? '',
      fecha_fin: p.fecha_fin ?? '',
      fases: [],
    }));

    console.log('Proyectos cargados en gantt:', this.projects);

    const targetId = preselectId && this.projects.find(p => p.id === preselectId)
      ? preselectId
      : this.projects[0]?.id ?? null;
    this.selectedProjectId = targetId;

    if (this.selectedProjectId) {
      this.loadProjectFull(this.selectedProjectId);
    } else {
      this.loading = false;
    }
  },

  error: () => {
    this.error = 'No se pudieron cargar los proyectos.';
    this.loading = false;
    this.cdr.detectChanges();
  }
});
  }

  loadProjectFull(id: number): void {
    this.loading = true;
    console.log('[Gantt] loadProjectFull →', id, '| selectedProjectId:', this.selectedProjectId);
    this.projectSvc.getProjectFull(id).subscribe({
      next: full => {
        console.log('[Gantt] getProjectFull respuesta id:', id, '| selectedProjectId ahora:', this.selectedProjectId, '| fases:', full.fases?.length);

        // Si el usuario ya cambió a otro proyecto, ignorar este resultado
        if (this.selectedProjectId !== id) {
          console.log('[Gantt] Ignorando respuesta obsoleta de proyecto', id);
          return;
        }

        const fases: Fase[] = (full.fases ?? []).map((f: any, fi: number) => ({
          id:           Number(f.id),
          nombre:       f.nombre,
          color:        PHASE_COLORS[fi % PHASE_COLORS.length],
          fecha_inicio: String(f.fecha_inicio ?? '').substring(0, 10),
          fecha_fin:    String(f.fecha_fin    ?? '').substring(0, 10),
          tareas: (f.tareas ?? []).map((t: any) => this.mapTarea(t)),
        }));

        console.log('[Gantt] Fases mapeadas:', fases.length, '| proyecto:', full.nombre ?? id);

        const idx = this.projects.findIndex(p => p.id === id);
        if (idx >= 0) {
          this.projects[idx] = {
            ...this.projects[idx],
            fecha_inicio: String(full.fecha_inicio ?? this.projects[idx].fecha_inicio).substring(0, 10),
            fecha_fin:    String(full.fecha_fin    ?? this.projects[idx].fecha_fin).substring(0, 10),
            fases,
          };
        }

        console.log('[Gantt] selectedProject después del update:', this.selectedProject?.nombre, '| fases:', this.selectedProject?.fases.length);

        this.extractResources();
        this.buildGanttDays();
        this.buildCalendarWeek();
        this.globalOcc = this.computeGlobalOcc();
        this.loadMuebleMarkers(id);
        this.loading   = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Gantt] Error loadProjectFull', id, err);
        this.loading = false;
        this.error   = 'No se pudo cargar el detalle del proyecto.';
        this.cdr.detectChanges();
      }
    });
  }

  private mapTarea(t: any): Tarea {
    return {
      id:           t.id,
      nombre:       t.nombre ?? t.name ?? '',
      estado:       t.estado ?? 'pendiente',
      fecha_inicio: (t.fecha_inicio ?? '').substring(0, 10),
      fecha_fin:    (t.fecha_fin    ?? '').substring(0, 10),
      operarios:    (t.operarios ?? t.asignados ?? []).map((o: any) =>
                      typeof o === 'string' ? o : (o.nombre ?? o.nombre_completo ?? `${o.nombre ?? ''} ${o.apellido ?? ''}`.trim())),
      maquinarias:  (t.maquinarias ?? t.equipos ?? []).map((m: any) =>
                      typeof m === 'string' ? m : (m.nombre ?? '')),
      tipo:         t.tipo ?? t.tipo_tarea ?? '',
      depende_de:   t.depende_de ?? null,
      bloqueada_por_movimiento: Boolean(t.bloqueada_por_movimiento),
    };
  }

  // El bloqueo ya no se indica con el color de la barra (así se puede seguir viendo si la
  // tarea tiene recursos o no, igual que cualquier otra); el candado es el único indicador
  // de bloqueo, y su color distingue el motivo (ver getLockClass).
  getTareaBadgeClass(t: Tarea): string {
    if (t.estado === 'bloqueada') {
      return (t.operarios?.length || t.maquinarias?.length) ? 'bar-assigned' : 'bar-pending';
    }
    return BAR_CLASSES[t.estado] ?? 'bar-pending';
  }
  getTareaBadgeLabel(t: Tarea): string {
    if (t.estado === 'bloqueada') return t.bloqueada_por_movimiento ? 'Bloqueada: reprogramar' : 'Bloqueada: esperando predecesora';
    return t.estado;
  }
  // Violeta = bloqueada por dependencia (solo espera a que termine la predecesora);
  // rojo = bloqueada por movimiento (perdió recursos, hay que reprogramarla); sin color
  // especial si solo tiene depende_de pero no está bloqueada (la dependencia ya se cumplió).
  getLockClass(t: Tarea): string {
    if (t.estado === 'bloqueada') return t.bloqueada_por_movimiento ? 'lock-move' : 'lock-dep';
    return 'lock-neutral';
  }
  dependenciaNombre(t: Tarea, fase: Fase): string {
    const dep = fase?.tareas?.find(x => x.id === t.depende_de);
    return dep?.nombre ?? `tarea #${t.depende_de}`;
  }

  /** Extrae listas únicas de máquinas y operarios del proyecto cargado. */
  private extractResources(): void {
    const mSet = new Set<string>();
    const oSet = new Set<string>();
    for (const p of this.projects) {
      for (const f of p.fases) {
        for (const t of f.tareas) {
          t.maquinarias.forEach(m => mSet.add(m));
          t.operarios.forEach(o => oSet.add(o));
        }
      }
    }
    this.machines  = [...mSet];
    this.operators = [...oSet];
  }

  onProjectIdChange(id: number): void {
    console.log('[Gantt] onProjectIdChange →', id);
    this.selectedProjectId = Number(id);
    this.showPanel = false; this.dateEdit = null;
    this.loadProjectFull(this.selectedProjectId);
  }

  // ── Gantt days ───────────────────────────────────────────────────────────
  buildGanttDays(): void {
    const p = this.selectedProject;
    if (!p || !p.fecha_inicio) return;
    const start = new Date(p.fecha_inicio), end = new Date(p.fecha_fin);
    this.ganttDays = [];
    const cur = new Date(start);
    while (cur <= end) { this.ganttDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  }

  // ── Calendar week ────────────────────────────────────────────────────────
  buildCalendarWeek(): void {
    this.calendarDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() + i);
      this.calendarDays.push(d);
    }
    this.loadWeeklyOccupancy();
  }

  loadWeeklyOccupancy(): void {
    const desde = this.toDateStr(this.calendarWeekStart);
    const endDay = new Date(this.calendarWeekStart); endDay.setDate(endDay.getDate() + 6);
    const hasta  = this.toDateStr(endDay);
    forkJoin({
      maquinas:  this.projectSvc.getMachineryWeeklyOccupancy(desde, hasta, this.selectedProjectId).pipe(catchError(() => of({}))),
      operarios: this.projectSvc.getOperarioOccupancy(desde, hasta).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ maquinas, operarios }) => {
        this.weeklyOcc = Array.isArray(maquinas)
          ? maquinas
          : ((maquinas as any)?.maquinas ?? (maquinas as any)?.data ?? []);
        this.weeklyOperariosOcc = Array.isArray(operarios)
          ? operarios
          : ((operarios as any)?.data ?? []);
        this.buildProjectColorMap([...this.weeklyOcc, ...this.weeklyOperariosOcc]);
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  getDayData(resource: any, day: Date): DiaData | null {
    const dateStr = this.toDateStr(day);
    const dias = resource.dias;
    if (!dias) return null;

    // Formato nuevo (bloques) o legado (tareas)
    if (Array.isArray(dias)) {
      const found = dias.find((d: any) => d.fecha === dateStr);
      if (!found) return null;
      const items: any[] = found.bloques ?? found.tareas ?? [];
      if (!items.length) return null;
      return {
        fecha:          found.fecha,
        horas_ocupadas: found.horas_ocupadas ?? 0,
        bloques: items.map((b: any) => ({
          nombre:      b.nombre ?? '',
          proyecto_id: b.proyecto_id ?? 0,
          proyecto:    b.proyecto ?? '',
          hora_inicio: this.formatHora(b.hora_inicio ?? 7),
          hora_fin:    this.formatHora(b.hora_fin ?? 18),
          horas:       typeof b.horas === 'number'
                         ? b.horas
                         : this.timeToDecimal(b.hora_fin ?? '18:00') - this.timeToDecimal(b.hora_inicio ?? '07:00'),
        })),
      };
    }

    // Formato legado: objeto { "YYYY-MM-DD": [{...}] }
    const blocks: any[] = dias[dateStr];
    if (!blocks?.length) return null;
    const horas = blocks.reduce((s: number, b: any) => {
      const hi = typeof b.hora_inicio === 'number' ? b.hora_inicio : this.timeToDecimal(b.hora_inicio);
      const hf = typeof b.hora_fin    === 'number' ? b.hora_fin    : this.timeToDecimal(b.hora_fin);
      return s + (hf - hi);
    }, 0);
    return {
      fecha: dateStr,
      horas_ocupadas: horas,
      bloques: blocks.map((b: any) => ({
        nombre:      b.tarea ?? b.nombre ?? '',
        proyecto_id: b.proyecto_id ?? 0,
        proyecto:    b.proyecto ?? '',
        hora_inicio: this.formatHora(b.hora_inicio ?? 7),
        hora_fin:    this.formatHora(b.hora_fin ?? 18),
        horas:       (typeof b.hora_fin === 'number' ? b.hora_fin : this.timeToDecimal(b.hora_fin ?? '18:00'))
                   - (typeof b.hora_inicio === 'number' ? b.hora_inicio : this.timeToDecimal(b.hora_inicio ?? '07:00')),
      })),
    };
  }

  timeToDecimal(t: number | string): number {
    if (typeof t === 'number') return t;
    const [h, m] = String(t).split(':').map(Number);
    return h + (m || 0) / 60;
  }

  formatHora(t: number | string): string {
    if (typeof t === 'number') return `${String(t).padStart(2, '0')}:00`;
    return String(t).substring(0, 5);
  }

  getBloqueStyle(b: DiaBloque, color: string): Record<string, string> {
    const left  = ((this.timeToDecimal(b.hora_inicio) - 7) / 11) * 100;
    const width = ((this.timeToDecimal(b.hora_fin) - this.timeToDecimal(b.hora_inicio)) / 11) * 100;
    return { position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: color, borderRadius: '3px' };
  }

  getCeldaBg(resource: any, day: Date): string {
    const d = this.getDayData(resource, day);
    if (!d?.bloques?.length) return '';
    return this.getProjectColor(d.bloques[0].proyecto_id) + '26';
  }

  calcDayPct(diaData: DiaData): number {
    return Math.min(100, Math.round((diaData.horas_ocupadas / 11) * 100));
  }

  getDayTooltip(resource: any, day: Date): string {
    const d = this.getDayData(resource, day);
    return d ? this.buildDayTooltip(d) : '';
  }

  buildDayTooltip(diaData: DiaData): string {
    return (diaData.bloques ?? [])
      .map(b => `${b.proyecto}  ·  ${b.nombre}\n${b.hora_inicio} – ${b.hora_fin}  (${b.horas}h)`)
      .join('\n─────────────\n');
  }

  getProjectColor(proyectoId: number): string {
    if (!this.projectColorMap.has(proyectoId)) {
      const idx = this.projectColorMap.size % COLOR_POOL.length;
      this.projectColorMap.set(proyectoId, COLOR_POOL[idx]);
    }
    return this.projectColorMap.get(proyectoId)!;
  }

  private buildProjectColorMap(resources: any[]): void {
    if (!Array.isArray(resources)) return;
    this.projectColorMap.clear();
    for (const res of resources) {
      for (const dia of (res.dias ?? [])) {
        for (const b of (dia.bloques ?? [])) {
          if (b.proyecto_id != null) this.getProjectColor(b.proyecto_id);
        }
      }
    }
  }

  get projectColorLegend(): { nombre: string; color: string }[] {
    const legend: { nombre: string; color: string }[] = [];
    this.projectColorMap.forEach((color, id) => {
      let nombre = `Proyecto ${id}`;
      outer: for (const res of [...this.weeklyOcc, ...this.weeklyOperariosOcc]) {
        for (const dia of (res.dias ?? [])) {
          for (const b of (dia.bloques ?? [])) {
            if (b.proyecto_id === id) { nombre = b.proyecto; break outer; }
          }
        }
      }
      legend.push({ nombre, color });
    });
    return legend;
  }

  private startOfWeek(d: Date): Date {
    const day = new Date(d);
    const diff = day.getDay() === 0 ? -6 : 1 - day.getDay();
    day.setDate(day.getDate() + diff);
    return day;
  }

  prevWeek(): void {
    const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() - 7);
    this.calendarWeekStart = d; this.buildCalendarWeek();
  }
  nextWeek(): void {
    const d = new Date(this.calendarWeekStart); d.setDate(d.getDate() + 7);
    this.calendarWeekStart = d; this.buildCalendarWeek();
  }

  getCellClass(maq: any, day: Date): string {
    const dayStr     = this.toDateStr(day);
    const ocupaciones: any[] = maq.dias?.[dayStr] ?? [];
    if (!ocupaciones.length) return 'cal-cell';
    const activa = ocupaciones.find((o: any) => o.es_proyecto_activo);
    return activa ? 'cal-cell occ-activo' : 'cal-cell occ-otro';
  }

  getCellTooltip(maq: any, day: Date): string {
    const dayStr = this.toDateStr(day);
    const items: any[] = maq.dias?.[dayStr] ?? [];
    if (!items.length) return '';
    return items.map((o: any) => `${o.proyecto} — ${o.tarea}`).join('\n');
  }

  // ── Global occupancy (calculated from tarea.maquinarias/fecha_inicio/fin) ─
  computeGlobalOcc(): MachineGlobalOcc[] {
    const result: MachineGlobalOcc[] = [];
    for (const machineName of this.machines) {
      const projectsUsing = new Set<string>();
      let peakDayH = 0;

      for (const proj of this.projects) {
        for (const fase of proj.fases) {
          for (const tarea of fase.tareas) {
            if (!tarea.maquinarias.includes(machineName)) continue;
            projectsUsing.add(proj.nombre);
            // Si tiene horario real, suma horas; si no, estima jornada completa
            if (tarea.horario) {
              for (const blocks of Object.values(tarea.horario)) {
                const machineH = (blocks as HorarioBlock[])
                  .filter(b => b.resource === machineName && b.tipo === 'maquina')
                  .reduce((s, b) => s + (b.hora_fin - b.hora_inicio), 0);
                peakDayH = Math.max(peakDayH, machineH);
              }
            } else {
              peakDayH = Math.max(peakDayH, DAY_HOURS); // estimado sin horario
            }
          }
        }
      }

      if (!projectsUsing.size) {
        result.push({ nombre: machineName, porcentaje: 0, proyectos: [], estado: 'libre' });
        continue;
      }
      const pct = Math.min(Math.round((peakDayH / DAY_HOURS) * 100), 100);
      const estado: MachineGlobalOcc['estado'] =
        pct >= 100 ? 'saturada' : pct >= 75 ? 'alta' : pct > 0 ? 'disponible' : 'libre';
      result.push({ nombre: machineName, porcentaje: pct, proyectos: [...projectsUsing], estado });
    }
    return result;
  }

  hasSaturatedMachines(): boolean { return this.globalOcc.some(o => o.estado === 'saturada'); }

  // ── Task panel ───────────────────────────────────────────────────────────
  openTaskPanel(task: Tarea, fase: Fase): void {
    this.panelTask = task; this.panelFase = fase;
    this.showPanel = true; this.dateEdit = null;
    this.buildPanelDays(task);
    if (!task.horario && !task.horarioLoading) this.loadTareaHorario(task, fase.id);
  }

  closePanel(): void { this.showPanel = false; this.panelTask = null; this.dateEdit = null; }

  private buildPanelDays(task: Tarea): void {
    this.panelDays = [];
    const start = new Date(task.fecha_inicio), end = new Date(task.fecha_fin);
    const cur = new Date(start);
    while (cur <= end && this.panelDays.length < 14) {
      this.panelDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1);
    }
  }

  loadTareaHorario(task: Tarea, faseId: number): void {
    task.horarioLoading = true;
    this.projectSvc.getTareaHorario(faseId, task.id).subscribe({
      next: data => {
        task.horario = this.mapHorario(data);
        task.horarioLoading = false;
        this.globalOcc = this.computeGlobalOcc();
        this.cdr.detectChanges();
      },
      error: () => { task.horarioLoading = false; this.cdr.detectChanges(); }
    });
  }

  private mapHorario(data: any): TareaHorario {
    if (!data) return {};
    const result: TareaHorario = {};
    const dias: any[] = Array.isArray(data) ? data : (data?.dias ?? data?.bloques ?? []);
    for (const dia of dias) {
      const key = (dia.fecha ?? dia.dia ?? '').substring(0, 10);
      if (!key) continue;
      const blocks: HorarioBlock[] = (dia.bloques ?? dia.recursos ?? []).map((b: any) => ({
        resource:    b.nombre ?? b.recurso ?? '',
        tipo:        b.tipo   === 'maquina' ? 'maquina' : 'operario',
        hora_inicio: b.hora_inicio ?? 7,
        hora_fin:    b.hora_fin    ?? 18,
      }));
      result[key] = blocks;
    }
    return result;
  }

  openTaskDetailModal(task: Tarea, fase: Fase): void {
    this.modalTask     = task;
    this.modalFaseName = fase.nombre;
    this.modalDays     = [];
    const start = new Date(task.fecha_inicio), end = new Date(task.fecha_fin);
    const cur   = new Date(start);
    while (cur <= end && this.modalDays.length < 14) {
      this.modalDays.push(new Date(cur)); cur.setDate(cur.getDate() + 1);
    }
    this.showTaskDetailModal = true;
  }

  closeTaskDetailModal(): void { this.showTaskDetailModal = false; this.modalTask = null; }

  // ── Schedule helpers ─────────────────────────────────────────────────────
  getScheduleResources(task: Tarea): Array<{ name: string; tipo: 'maquina' | 'operario' }> {
    const result: Array<{ name: string; tipo: 'maquina' | 'operario' }> = [];
    for (const m of task.maquinarias) result.push({ name: m, tipo: 'maquina' });
    for (const o of task.operarios)   result.push({ name: o, tipo: 'operario' });
    return result;
  }

  getBlocksForDay(task: Tarea, resource: string, day: Date): HorarioBlock[] {
    if (!task.horario) return [];
    return (task.horario[this.toDateStr(day)] ?? []).filter(b => b.resource === resource);
  }

  getResourceDayOccupancy(task: Tarea, resource: string, day: Date): number {
    const blocks = this.getBlocksForDay(task, resource, day);
    const h = blocks.reduce((s, b) => s + (b.hora_fin - b.hora_inicio), 0);
    return Math.round((h / DAY_HOURS) * 100);
  }

  getBlockStyle(block: HorarioBlock): Record<string, string> {
    const left  = ((block.hora_inicio - DAY_START) / DAY_HOURS) * 100;
    const width = ((block.hora_fin - block.hora_inicio) / DAY_HOURS) * 100;
    return { left: `${left}%`, width: `${width}%` };
  }

  blockLabel(block: HorarioBlock): string { return `${block.hora_inicio}:00–${block.hora_fin}:00`; }

  hasAnySchedule(task: Tarea): boolean {
    return task.operarios.length > 0 || task.maquinarias.length > 0;
  }

  hasHorario(task: Tarea): boolean {
    return !!task.horario && Object.keys(task.horario).length > 0;
  }

  // ── Date editing with real API ───────────────────────────────────────────
  startDateEdit(task: Tarea, fase: Fase): void {
    this.dateEdit = {
      tarea_id:      task.id,
      fase_id:       fase.id,
      nombre:        task.nombre,
      fecha_inicio:  task.fecha_inicio,
      fecha_fin:     task.fecha_fin,
      conflictCheck: 'idle',
      conflictMsg:   '',
    };
  }

  // ── Límites de fecha para los inputs (min/max) ──────────────────────────
  get taskDateMin(): string { return this.panelFase?.fecha_inicio ?? this.selectedProject?.fecha_inicio ?? ''; }
  get taskDateMax(): string { return this.panelFase?.fecha_fin    ?? this.selectedProject?.fecha_fin    ?? ''; }

  checkDateConflict(): void {
    if (!this.dateEdit || !this.selectedProject) return;

    const { fecha_inicio: di, fecha_fin: df } = this.dateEdit;
    const proj  = this.selectedProject;
    const fase  = this.panelFase;

    // 1. Orden básico
    if (di > df) {
      this.dateEdit.conflictCheck = 'conflict';
      this.dateEdit.conflictMsg   = 'La fecha de inicio no puede ser posterior a la de fin.';
      this.cdr.detectChanges(); return;
    }

    // 2. Dentro del proyecto
    if (di < proj.fecha_inicio || df > proj.fecha_fin) {
      this.dateEdit.conflictCheck = 'conflict';
      this.dateEdit.conflictMsg   =
        `Fuera del rango del proyecto: ${proj.fecha_inicio} → ${proj.fecha_fin}.`;
      this.cdr.detectChanges(); return;
    }

    // 3. Dentro de la fase
    if (fase && (di < fase.fecha_inicio || df > fase.fecha_fin)) {
      this.dateEdit.conflictCheck = 'conflict';
      this.dateEdit.conflictMsg   =
        `Fuera de la fase "${fase.nombre}": ${fase.fecha_inicio} → ${fase.fecha_fin}.`;
      this.cdr.detectChanges(); return;
    }

    // 4. Verificar con el backend (conflictos de recursos)
    this.dateEdit.conflictCheck = 'checking';
    this.cdr.detectChanges();

    this.projectSvc.validateFaseDates(proj.id, { fecha_inicio: di, fecha_fin: df }).subscribe({
      next: data => {
        if (!this.dateEdit) return;
        if (data?.viable === false || data?.conflictos?.length) {
          this.dateEdit.conflictCheck = 'conflict';
          this.dateEdit.conflictMsg   = data?.mensaje ?? 'Hay conflicto de recursos en ese rango.';
        } else {
          this.dateEdit.conflictCheck = 'ok';
          this.dateEdit.conflictMsg   = data?.mensaje ?? 'Fechas disponibles.';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        if (!this.dateEdit) return;
        // Si el backend no está listo, la validación local ya pasó → permitir guardar
        this.dateEdit.conflictCheck = 'ok';
        this.dateEdit.conflictMsg   = 'Fechas válidas (sin verificación de recursos por ahora).';
        this.cdr.detectChanges();
      }
    });
  }

  saveDateEdit(): void {
    if (!this.dateEdit || !this.panelTask) return;
    const { fase_id, tarea_id, fecha_inicio, fecha_fin } = this.dateEdit;

    this.projectSvc.rescheduleTarea(fase_id, tarea_id, { fecha_inicio, fecha_fin }).subscribe({
      next: (resp: any) => {
        if (!this.panelTask || !this.dateEdit) return;
        const nombreTarea = this.panelTask.nombre;
        const hijas: any[] = resp?.hijas_afectadas ?? [];
        const reconciliacion = resp?.reconciliacion_recursos;
        const hayReconciliacion = !!(reconciliacion?.reasignados?.length || reconciliacion?.no_disponibles?.length);
        this.dateEdit = null;

        if (hijas.length === 0 && !hayReconciliacion) {
          if (this.selectedProjectId) this.loadProjectFull(this.selectedProjectId);
          void Swal.fire({ icon: 'success', title: 'Fechas actualizadas', text: `"${nombreTarea}" reprogramada.`, timer: 1800 });
          this.cdr.detectChanges();
          return;
        }

        // El sistema no mueve a las hijas por su cuenta: se bloquean y pierden recursos
        // hasta que se reprogramen una por una (mismo flujo que en project-detail).
        // Se cierra el panel (showPanel Y panelTask, no solo panelTask) antes del reload:
        // el grid reserva una columna para el panel mientras showPanel siga en true, aunque
        // el panel mismo ya no se renderice, dejando un hueco sin expandir en el Gantt.
        this.showPanel = false;
        this.panelTask = null;
        if (this.selectedProjectId) this.loadProjectFull(this.selectedProjectId);
        let html = `<p>"${nombreTarea}" reprogramada correctamente.</p>`;
        if (hijas.length > 0) {
          html += `<p><b>${hijas.length} tarea(s) dependiente(s)</b> perdieron sus operarios/maquinaria y quedaron bloqueadas:</p>`;
          html += '<ul style="text-align:left">' + hijas.map(h => `<li>${h.nombre}</li>`).join('') + '</ul>';
          html += '<p>Búscalas en el Gantt (barra roja "Bloqueada: reprogramar") y ajusta sus fechas una por una.</p>';
        }
        if (reconciliacion?.no_disponibles?.length) {
          html += `<p><b>${reconciliacion.no_disponibles.length} recurso(s)</b> ya no estaban disponibles y deben reasignarse manualmente.</p>`;
        }
        void Swal.fire({ icon: 'warning', title: 'Tareas dependientes afectadas', html, confirmButtonText: 'Entendido' });
        this.cdr.detectChanges();
      },
      error: err => {
        void Swal.fire('Error', err.error?.message ?? 'No se pudieron guardar las fechas.', 'error');
      }
    });
  }

  cancelDateEdit(): void { this.dateEdit = null; }

  // ── Calendar: rango activo del proyecto ──────────────────────────────────
  isInProjectRange(day: Date): boolean {
    const p = this.selectedProject;
    if (!p?.fecha_inicio) return false;
    const s = this.toDateStr(day);
    return s >= p.fecha_inicio && s <= p.fecha_fin;
  }

  /** Devuelve la fase activa en ese día (para colorear el calendario). */
  getFaseForDay(day: Date): Fase | null {
    const p = this.selectedProject;
    if (!p) return null;
    const s = this.toDateStr(day);
    return p.fases.find(f => s >= f.fecha_inicio && s <= f.fecha_fin) ?? null;
  }

  // ── Mueble markers ───────────────────────────────────────────────────────
  loadMuebleMarkers(projectId: number): void {
    this.projectSvc.getProjectMuebles(projectId).subscribe({
      next: muebles => {
        this.muebleMarkers = muebles.map((m: any) => ({
          id:       m.id,
          nombre:   m.nombre,
          fecha_fin: String(m.fecha_fin).substring(0, 10),
        }));
        this.cdr.detectChanges();
      },
      error: () => { this.muebleMarkers = []; }
    });
  }

  markerLeft(fecha_fin: string): number | null {
    const p = this.selectedProject;
    if (!p) return null;
    const ps  = new Date(p.fecha_inicio).getTime();
    const mft = new Date(fecha_fin).getTime();
    const off = Math.round((mft - ps) / 86400000);
    if (off < 0 || off >= this.ganttDays.length) return null;
    return off * this.cellWidth + this.cellWidth / 2;
  }

  // ── Gantt bars ───────────────────────────────────────────────────────────
  getGanttBarStyle(row: { fecha_inicio: string; fecha_fin: string }): Record<string,string> {
    const p = this.selectedProject;
    if (!p || !this.ganttDays.length) return { display: 'none' };
    const ps = new Date(p.fecha_inicio).getTime();
    const rs = new Date(row.fecha_inicio).getTime();
    const re = new Date(row.fecha_fin).getTime();
    const off = Math.round((rs - ps) / 86400000);
    const w   = Math.round((re - rs) / 86400000) + 1;
    if (off < 0 || w <= 0) return { display: 'none' };
    return { left: `${off * this.cellWidth}px`, width: `${w * this.cellWidth - 4}px` };
  }

  getGanttBarClass(estado: string): string { return BAR_CLASSES[estado] ?? 'bar-pending'; }

  // ── Calendar occupancy ───────────────────────────────────────────────────
  isTodayMarker(day: Date): boolean {
    const t = new Date();
    return day.getDate() === t.getDate() && day.getMonth() === t.getMonth() && day.getFullYear() === t.getFullYear();
  }
  isWeekend(day: Date): boolean { return day.getDay() === 0; }  // solo domingo

  getOccupancy(resource: string, day: Date): { projectName: string; taskName: string; hours: number } | null {
    const dayStr = this.toDateStr(day);
    let totalHours = 0; let firstProject = ''; let firstTask = '';

    for (const proj of this.projects) {
      for (const fase of proj.fases) {
        for (const tarea of fase.tareas) {
          if (dayStr < tarea.fecha_inicio || dayStr > tarea.fecha_fin) continue;
          if (!tarea.maquinarias.includes(resource) && !tarea.operarios.includes(resource)) continue;
          if (!firstProject) { firstProject = proj.nombre; firstTask = tarea.nombre; }
          if (tarea.horario?.[dayStr]) {
            const h = (tarea.horario[dayStr] ?? [])
              .filter(b => b.resource === resource)
              .reduce((s, b) => s + (b.hora_fin - b.hora_inicio), 0);
            totalHours += h;
          } else {
            totalHours += 6; // estimado
          }
        }
      }
    }
    return firstProject ? { projectName: firstProject, taskName: firstTask, hours: totalHours } : null;
  }

  getOccupancyClass(resource: string, day: Date): string {
    const occ = this.getOccupancy(resource, day);
    if (!occ) return '';
    const pct = Math.round((occ.hours / DAY_HOURS) * 100);
    if (pct >= 100) return 'occ-saturada-cell';
    const idx = this.projects.findIndex(p => p.nombre === occ.projectName);
    return ['occ-proj1','occ-proj2','occ-proj3'][idx] ?? 'occ-default';
  }

  showTooltip(resource: string, day: Date, event: MouseEvent): void {
    const occ = this.getOccupancy(resource, day);
    if (!occ) return;
    const pct = Math.round((occ.hours / DAY_HOURS) * 100);
    this.tooltip = {
      text: `${occ.projectName} · ${occ.taskName} (${occ.hours}h = ${pct}% jornada)`,
      x: event.clientX, y: event.clientY,
    };
  }
  hideTooltip(): void { this.tooltip = null; }

  // ── Utils ────────────────────────────────────────────────────────────────
  toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  dayLabel(d: Date): string    { return String(d.getDate()); }
  monthLabel(d: Date): string  { return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][d.getMonth()] ?? ''; }
  weekDayLabel(d: Date): string { return DAYS_SHORT[d.getDay()] ?? ''; }
  panelDayLabel(d: Date): string { return `${DAYS_SHORT[d.getDay()] ?? ''} ${d.getDate()} ${this.monthLabel(d)}`; }

  getEstadoLabel(e: string): string {
    const l: Record<string,string> = { completada:'Completada', en_progreso:'En Progreso', asignada:'Asignada', pendiente:'Pendiente', bloqueada:'Bloqueada' };
    return l[e] ?? e;
  }
  getEstadoBadge(e: string): string {
    const m: Record<string,string> = { completada:'tbadge-done', en_progreso:'tbadge-progress', asignada:'tbadge-assigned', pendiente:'tbadge-pending' };
    return m[e] ?? 'tbadge-pending';
  }
  occStateClass(occ: MachineGlobalOcc): string {
    return occ.estado === 'saturada' ? 'gocc-saturada' : occ.estado === 'alta' ? 'gocc-alta' : occ.estado === 'disponible' ? 'gocc-ok' : 'gocc-libre';
  }
  occIcon(occ: MachineGlobalOcc): string {
    return occ.estado === 'saturada' ? 'fa-times-circle' : occ.estado === 'alta' ? 'fa-exclamation-circle' : 'fa-check-circle';
  }

  get ganttWidth(): number { return this.ganttDays.length * this.cellWidth; }
  get calendarWeekLabel(): string {
    const end = new Date(this.calendarWeekStart); end.setDate(end.getDate() + 6);
    return `${this.dayLabel(this.calendarWeekStart)} ${this.monthLabel(this.calendarWeekStart)} — ${this.dayLabel(end)} ${this.monthLabel(end)} ${end.getFullYear()}`;
  }
}
