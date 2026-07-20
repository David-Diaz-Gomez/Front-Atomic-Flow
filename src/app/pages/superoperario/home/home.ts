import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { forkJoin, of, interval, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Api } from '../../../core/services/api';

const REFRESH_MS = 30_000;

interface Operario { id: number; nombre: string; apellido: string; correo: string; }

interface TareaKiosko {
  id: number; nombre: string; descripcion: string; instrucciones: string;
  fase: string; proyecto: string; hora_inicio: string; hora_fin: string;
  estado: string; completado_en: string | null; id_operario: number; operario: string;
  yo_complete: boolean;
  total_operarios: number;
  operarios_completados: number;
}

interface LayoutItem { task: TareaKiosko; col: number; cols: number; }

const OP_COLORS = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899','#06b6d4'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function startOfWeek(d: Date): Date {
  const day = new Date(d);
  const diff = day.getDay() === 0 ? -6 : 1 - day.getDay();
  day.setDate(day.getDate() + diff);
  return day;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

@Component({
  selector: 'app-superop-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class SuperOpHome implements OnInit, OnDestroy {
  view: 'calendar' | 'planner' | 'semana' = 'calendar';

  operarios: Operario[] = [];
  tareas: TareaKiosko[] = [];
  filteredTareas: TareaKiosko[] = [];

  selectedOperarioId: number | null = null;
  filterPassword = '';
  isFiltered = false;
  filterError = '';
  filteredOperario: Operario | null = null;
  isLoading = false;

  showTaskModal = false;
  selectedTarea: TareaKiosko | null = null;

  showInactivityModal = false;
  countdown = 30;

  // Kiosk mode
  kioskMode: 'libre' | 'fijado' = 'libre';

  // Day offset for navigation (0 = today, 1 = tomorrow, etc.)
  dayOffset = 0;

  // Anuncio de nueva tarea asignada
  showAnnouncementModal = false;
  currentAnnouncement: { operarioNombre: string; tareas: string[] } | null = null;
  announcementQueue: Array<{ operarioNombre: string; tareas: string[] }> = [];
  private previousTaskIds = new Set<number>();
  private previousFilteredTaskIds = new Set<number>();
  private _initialTaskLoad = true;
  private _initialFilteredLoad = true;
  private dismissTimeout: any = null;

  // Week view
  weekOffset = 0;
  weekDays: Date[] = [];
  weekData: { [key: string]: TareaKiosko[] } = {};
  weekLoading = false;

  private inactivityTimeout: any = null;
  private countdownInterval: any = null;
  private readonly activityHandler = () => this.onActivity();
  private refreshSub: Subscription | null = null;

  readonly HOURS = [7,8,9,10,11,12,13,14,15,16,17,18];
  readonly DAY_H  = 11;
  private readonly todayRealKey = toDateKey(new Date());

  constructor(private api: Api, private cdr: ChangeDetectorRef) {}

  // ── Dynamic date getters ──────────────────────────────────────────────────

  get todayKey(): string { return toDateKey(addDays(new Date(), this.dayOffset)); }

  get todayLabel(): string {
    return addDays(new Date(), this.dayOffset)
      .toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  get fiveDayTabs(): Array<{ key: string; label: string; isToday: boolean }> {
    return Array.from({ length: 5 }, (_, i) => {
      const d = addDays(new Date(), i);
      return {
        key: toDateKey(d),
        label: `${DAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`,
        isToday: i === 0,
      };
    });
  }

  // ── Kiosk mode ────────────────────────────────────────────────────────────

  toggleKioskMode(): void {
    this.kioskMode = this.kioskMode === 'fijado' ? 'libre' : 'fijado';
    localStorage.setItem('kioskMode', this.kioskMode);
    this.cdr.detectChanges();
  }

  // ── Day navigation ────────────────────────────────────────────────────────

  prevDay(): void { this.dayOffset--; this.loadTareas(this.isFiltered ? this.filteredOperario?.id : undefined); }
  nextDay(): void { this.dayOffset++; this.loadTareas(this.isFiltered ? this.filteredOperario?.id : undefined); }
  setDayOffset(offset: number): void { this.dayOffset = offset; this.loadTareas(this.isFiltered ? this.filteredOperario?.id : undefined); }

  ngOnInit(): void {
    const savedMode = localStorage.getItem('kioskMode');
    if (savedMode === 'fijado' || savedMode === 'libre') this.kioskMode = savedMode;

    this.loadOperarios();
    this.loadTareas();
    this.buildWeek();
    this.refreshSub = interval(REFRESH_MS).subscribe(() => {
      this.loadTareas(this.isFiltered ? this.filteredOperario?.id : undefined);
      if (this.view === 'semana') this.loadWeekData();
    });
  }
  ngOnDestroy(): void { this.clearTimers(); this.removeListeners(); this.refreshSub?.unsubscribe(); }

  // ── Week navigation ───────────────────────────────────────────────────────

  buildWeek(): void {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + this.weekOffset * 7);
    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d;
    });
  }

  switchView(v: 'calendar' | 'planner' | 'semana'): void {
    this.view = v;
    if (v === 'semana' && !Object.keys(this.weekData).length) this.loadWeekData();
    this.cdr.detectChanges();
  }

  prevWeek(): void { this.weekOffset--; this.buildWeek(); this.loadWeekData(); }
  nextWeek(): void { this.weekOffset++; this.buildWeek(); this.loadWeekData(); }

  loadWeekData(): void {
    this.weekLoading = true;
    const idOp = this.isFiltered ? this.filteredOperario?.id : undefined;
    const calls = this.weekDays.map(d => {
      const key = toDateKey(d);
      return this.api.getSuperOpTareas(key, idOp).pipe(
        map((data: any[]) => ({ key, tasks: data ?? [] })),
        catchError(() => of({ key, tasks: [] as TareaKiosko[] }))
      );
    });
    forkJoin(calls).subscribe({
      next: results => {
        this.weekData = {};
        results.forEach((r: any) => this.weekData[r.key] = r.tasks);
        this.weekLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.weekLoading = false; this.cdr.detectChanges(); },
    });
  }

  getDayTareas(d: Date): TareaKiosko[] { return this.weekData[toDateKey(d)] ?? []; }
  isToday(d: Date): boolean { return toDateKey(d) === this.todayRealKey; }
  dayLabel(d: Date): string { return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`; }

  get weekLabel(): string {
    if (!this.weekDays.length) return '';
    const f = this.weekDays[0], l = this.weekDays[6];
    return `${f.getDate()} ${MONTHS_SHORT[f.getMonth()]} – ${l.getDate()} ${MONTHS_SHORT[l.getMonth()]} ${l.getFullYear()}`;
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadOperarios(): void {
    this.api.getSuperOpOperarios().subscribe({
      next: (d: any[]) => { this.operarios = d ?? []; this.cdr.detectChanges(); },
      error: ()         => { this.operarios = []; this.cdr.detectChanges(); },
    });
  }

  loadTareas(idOp?: number): void {
    this.api.getSuperOpTareas(this.todayKey, idOp).subscribe({
      next: (d: any[]) => {
        const res = d ?? [];
        if (!idOp) {
          if (this._initialTaskLoad) {
            this._initialTaskLoad = false;
          } else if (this.kioskMode === 'fijado' && this.dayOffset === 0) {
            // Only announce in fijado mode viewing today
            const newTasks = res.filter((t: any) => !this.previousTaskIds.has(t.id));
            if (newTasks.length > 0) {
              const byOp = new Map<string, string[]>();
              for (const t of newTasks) {
                const name: string = t.operario || 'Operario';
                if (!byOp.has(name)) byOp.set(name, []);
                byOp.get(name)!.push(t.nombre);
              }
              for (const [operarioNombre, tareas] of byOp) {
                this.announcementQueue.push({ operarioNombre, tareas });
              }
              this.processQueue();
            }
          }
          this.previousTaskIds = new Set(res.map((t: any) => t.id));
          this.tareas = res;
        } else {
          // Filtered operario — track new tasks for fijado mode
          if (!this._initialFilteredLoad && this.kioskMode === 'fijado' && this.dayOffset === 0) {
            const newTasks = res.filter((t: any) => !this.previousFilteredTaskIds.has(t.id));
            if (newTasks.length > 0 && this.filteredOperario) {
              this.announcementQueue.push({ operarioNombre: this.filteredOperario.nombre, tareas: newTasks.map((t: any) => t.nombre) });
              this.processQueue();
            }
          }
          this._initialFilteredLoad = false;
          this.previousFilteredTaskIds = new Set(res.map((t: any) => t.id));
          this.filteredTareas = res;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        const res: TareaKiosko[] = [];
        idOp ? (this.filteredTareas = res) : (this.tareas = res);
        this.cdr.detectChanges();
      },
    });
  }

  processQueue(): void {
    if (this.showAnnouncementModal || this.announcementQueue.length === 0) return;
    this.currentAnnouncement = this.announcementQueue.shift()!;
    this.showAnnouncementModal = true;
    this.cdr.detectChanges();
    this.speak(this.currentAnnouncement.operarioNombre);
    clearTimeout(this.dismissTimeout);
    this.dismissTimeout = setTimeout(() => this.dismissAnnouncement(), 5000);
  }

  dismissAnnouncement(): void {
    clearTimeout(this.dismissTimeout);
    this.showAnnouncementModal = false;
    this.currentAnnouncement = null;
    this.cdr.detectChanges();
    if (this.announcementQueue.length > 0) {
      this.dismissTimeout = setTimeout(() => this.processQueue(), 600);
    }
  }

  private speak(name: string): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(`Nueva tarea asignada a ${name}`);
    utt.lang = 'es-ES';
    utt.rate = 0.9;
    utt.pitch = 1;
    utt.volume = 1;
    window.speechSynthesis.speak(utt);
  }

  get displayTareas(): TareaKiosko[] { return this.isFiltered ? this.filteredTareas : this.tareas; }
  get plannerTareas(): TareaKiosko[] { return [...this.displayTareas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)); }

  // ── Overlap layout ────────────────────────────────────────────────────────

  private timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  getLayout(tasks: TareaKiosko[]): LayoutItem[] {
    if (!tasks.length) return [];
    const sorted = [...tasks].sort((a, b) => this.timeToMin(a.hora_inicio) - this.timeToMin(b.hora_inicio));

    if (this.isFiltered) {
      const colEnds: number[] = [];
      const items: LayoutItem[] = [];
      for (const task of sorted) {
        const start = this.timeToMin(task.hora_inicio);
        let col = colEnds.findIndex(end => end <= start);
        if (col === -1) { col = colEnds.length; colEnds.push(0); }
        colEnds[col] = this.timeToMin(task.hora_fin);
        items.push({ task, col, cols: 0 });
      }
      const maxCols = colEnds.length || 1;
      items.forEach(it => it.cols = maxCols);
      return items;
    }

    const presentIds = [...new Set(sorted.map(t => t.id_operario))];
    presentIds.sort((a, b) => {
      const ia = this.operarios.findIndex(o => o.id === a);
      const ib = this.operarios.findIndex(o => o.id === b);
      return ia - ib;
    });
    const cols = presentIds.length || 1;
    return sorted.map(task => ({ task, col: presentIds.indexOf(task.id_operario), cols }));
  }

  get calendarLayout(): LayoutItem[] { return this.getLayout(this.displayTareas); }

  getWeekLayout(tasks: TareaKiosko[]): LayoutItem[] { return this.getLayout(tasks); }

  // ── Filter ────────────────────────────────────────────────────────────────

  doFilter(): void {
    const op = this.operarios.find(o => o.id === this.selectedOperarioId);
    if (!op)                         { this.filterError = 'Selecciona un operario.'; return; }
    if (!this.filterPassword.trim()) { this.filterError = 'Ingresa tu contraseña.';  return; }
    this.filterError = '';
    this.isLoading   = true;
    this.api.verifyOperario(op.correo, this.filterPassword).subscribe({
      next: () => {
        this.isLoading        = false;
        this.isFiltered       = true;
        this.filteredOperario = op;
        this.filterPassword   = '';
        this._initialFilteredLoad = true;
        this.previousFilteredTaskIds.clear();
        this.loadTareas(op.id);
        if (this.view === 'semana') this.loadWeekData();
        this.startInactivityWatch();
        // Post-login queue: show today's assigned tasks in fijado mode
        if (this.kioskMode === 'fijado') {
          this.api.getSuperOpTareas(this.todayRealKey, op.id).subscribe({
            next: (tasks: any[]) => {
              if (tasks?.length > 0) {
                this.announcementQueue.push({ operarioNombre: op.nombre, tareas: tasks.map((t: any) => t.nombre) });
                this.processQueue();
              }
            },
            error: () => {}
          });
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoading   = false;
        this.filterError = err?.error?.message ?? 'Contraseña incorrecta.';
        this.cdr.detectChanges();
      },
    });
  }

  clearFilter(): void {
    this.isFiltered = false; this.filteredOperario = null; this.selectedOperarioId = null;
    this.filterPassword = ''; this.filterError = ''; this.filteredTareas = [];
    this.showTaskModal = false; this.showInactivityModal = false;
    this.weekData = {};
    this._initialFilteredLoad = true;
    this.previousFilteredTaskIds.clear();
    this.clearTimers(); this.removeListeners();
    this.cdr.detectChanges();
  }

  // ── Task modal ────────────────────────────────────────────────────────────

  openTask(t: TareaKiosko): void {
    if (!this.isFiltered) return;
    this.selectedTarea = { ...t }; this.showTaskModal = true; this.cdr.detectChanges();
  }
  closeTask(): void { this.showTaskModal = false; this.selectedTarea = null; this.cdr.detectChanges(); }

  marcarCompletada(): void {
    if (!this.selectedTarea || !this.filteredOperario) return;
    this.isLoading = true;
    this.api.completarTarea(this.selectedTarea.id, this.filteredOperario.id).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        const nuevoEstado = res?.estado ?? 'en_progreso';
        const now = new Date().toISOString();
        const updateList = (list: TareaKiosko[]) => {
          const t = list.find(x => x.id === this.selectedTarea!.id);
          if (t) {
            t.estado = nuevoEstado;
            t.yo_complete = true;
            if (nuevoEstado === 'en_revision') t.completado_en = now;
            t.operarios_completados = res?.pendientes != null
              ? (t.total_operarios - res.pendientes)
              : t.total_operarios;
          }
        };
        updateList(this.filteredTareas); updateList(this.tareas);
        Object.values(this.weekData).forEach(updateList);
        if (this.selectedTarea) {
          this.selectedTarea.estado = nuevoEstado;
          this.selectedTarea.yo_complete = true;
          if (nuevoEstado === 'en_revision') this.selectedTarea.completado_en = now;
          this.selectedTarea.operarios_completados = res?.pendientes != null
            ? (this.selectedTarea.total_operarios - res.pendientes)
            : this.selectedTarea.total_operarios;
        }
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); },
    });
  }

  // ── Inactivity ────────────────────────────────────────────────────────────

  startInactivityWatch(): void {
    ['mousemove','mousedown','keydown','touchstart'].forEach(ev => document.addEventListener(ev, this.activityHandler, true));
    this.scheduleTimeout();
  }
  removeListeners(): void {
    ['mousemove','mousedown','keydown','touchstart'].forEach(ev => document.removeEventListener(ev, this.activityHandler, true));
  }
  scheduleTimeout(): void {
    clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => { if (this.isFiltered && !this.showInactivityModal) this.startCountdown(); }, 60_000);
  }
  onActivity(): void { if (!this.showInactivityModal) this.scheduleTimeout(); }
  startCountdown(): void {
    this.countdown = 30; this.showInactivityModal = true; this.cdr.detectChanges();
    this.countdownInterval = setInterval(() => { this.countdown--; this.cdr.detectChanges(); if (this.countdown <= 0) this.clearFilter(); }, 1000);
  }
  continueSession(): void { clearInterval(this.countdownInterval); this.showInactivityModal = false; this.scheduleTimeout(); this.cdr.detectChanges(); }
  clearTimers(): void {
    clearTimeout(this.inactivityTimeout);
    clearInterval(this.countdownInterval);
    clearTimeout(this.dismissTimeout);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ── Visual helpers ────────────────────────────────────────────────────────

  getBlockTop(t: TareaKiosko): number {
    const [h, m] = t.hora_inicio.split(':').map(Number);
    return ((h + m / 60 - 7) / this.DAY_H) * 100;
  }
  getBlockHeight(t: TareaKiosko): number {
    const [sh, sm] = t.hora_inicio.split(':').map(Number);
    const [eh, em] = t.hora_fin.split(':').map(Number);
    return ((eh + em / 60 - sh - sm / 60) / this.DAY_H) * 100;
  }
  getGridTop(i: number): number { return (i / this.DAY_H) * 100; }
  getColor(idOp: number): string {
    const idx = this.operarios.findIndex(o => o.id === idOp);
    return OP_COLORS[(idx >= 0 ? idx : 0) % OP_COLORS.length];
  }
  estadoLabel(e?: string): string {
    return ({ asignada:'Asignada', en_progreso:'En Progreso', completada:'Completada', en_revision:'Lista para revisar', pendiente:'Pendiente', reasignada:'Reasignada' })[e ?? ''] ?? (e ?? '');
  }
  completadaHora(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
  }
}
