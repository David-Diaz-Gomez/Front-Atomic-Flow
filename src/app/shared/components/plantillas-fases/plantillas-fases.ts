import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../../../core/services/api';
import { CatalogService } from '../../services/catalog.service';

interface PlantillaTarea {
  nombre: string;
  descripcion: string;
  tipo_tarea: string;
  duracion_dias: number;
  hora_inicio: string;
  hora_fin: string;
}

interface PlantillaFase {
  nombre: string;
  descripcion?: string;
  duracion_dias: number;
  tareas: PlantillaTarea[];
}

interface Plantilla {
  id: number;
  nombre: string;
  descripcion: string;
  fases: PlantillaFase[];
}

interface FaseEditable {
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string;
  tareas: TareaEditable[];
  expanded: boolean;
}

interface TareaEditable {
  nombre: string;
  descripcion: string;
  tipo_tarea: string;
  fecha_inicio: string;
  fecha_fin: string;
  hora_inicio: string;
  hora_fin: string;
  depende_de_idx: number | null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

const TIPOS_FALLBACK = ['Carpintería','Impresiones','Diseño','Montaje','Logística','Revisión','Instalación','Pintura','Eléctrico','Otro'];

@Component({
  selector: 'app-plantillas-fases',
  standalone: false,
  templateUrl: './plantillas-fases.html',
  styleUrl: './plantillas-fases.scss',
})
export class PlantillasFases implements OnInit {
  step: 'select' | 'edit' = 'select';

  plantillas: Plantilla[] = [];
  selectedPlantilla: Plantilla | null = null;
  tiposTarea: string[] = [];

  proyectoId: number | null = null;
  proyectoFechaInicio = '';
  proyectoFechaFin = '';
  fases: FaseEditable[] = [];

  isLoading = false;
  isSubmitting = false;

  constructor(
    private http: HttpClient,
    private api: Api,
    private catalogSvc: CatalogService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.proyectoId          = Number(this.route.snapshot.paramMap.get('proyectoId'));
    this.proyectoFechaInicio = this.route.snapshot.queryParamMap.get('fecha_inicio') ?? this.today();
    this.proyectoFechaFin    = this.route.snapshot.queryParamMap.get('fecha_fin')    ?? '';
    this.loadPlantillas();
    this.loadTiposTarea();
  }

  private today(): string { return new Date().toISOString().substring(0, 10); }

  loadTiposTarea(): void {
    this.catalogSvc.getTiposTarea().subscribe({
      next: (data: any[]) => {
        this.tiposTarea = data.length
          ? data.map((t: any) => t.nombre ?? t)
          : TIPOS_FALLBACK;
        this.cdr.detectChanges();
      },
      error: () => { this.tiposTarea = TIPOS_FALLBACK; this.cdr.detectChanges(); },
    });
  }

  loadPlantillas(): void {
    this.isLoading = true;
    this.http.get<Plantilla[]>('/assets/data/plantillas.json').subscribe({
      next: (data) => { this.plantillas = data; this.isLoading = false; this.cdr.detectChanges(); },
      error: ()     => { this.plantillas = []; this.isLoading = false; this.cdr.detectChanges(); },
    });
  }

  selectPlantilla(p: Plantilla): void {
    this.selectedPlantilla = p;
    this.buildFasesFromPlantilla(p);
    this.step = 'edit';
    this.cdr.detectChanges();
  }

  sinPlantilla(): void {
    this.selectedPlantilla = null;
    this.fases = [this.emptyFase()];
    this.step = 'edit';
    this.cdr.detectChanges();
  }

  buildFasesFromPlantilla(p: Plantilla): void {
    let cursor = this.proyectoFechaInicio;
    this.fases = p.fases.map((f) => {
      const faseInicio = cursor;
      const faseFin    = addDays(cursor, f.duracion_dias - 1);
      let tareasCursor = faseInicio;

      const tareas: TareaEditable[] = f.tareas.map((t, idx) => {
        const tFin = addDays(tareasCursor, t.duracion_dias - 1);
        const tarea: TareaEditable = {
          nombre:         t.nombre,
          descripcion:    t.descripcion ?? '',
          tipo_tarea:     t.tipo_tarea.replace(/\[|\]/g, '').trim(),
          fecha_inicio:   tareasCursor,
          fecha_fin:      tFin,
          hora_inicio:    t.hora_inicio,
          hora_fin:       t.hora_fin,
          depende_de_idx: idx > 0 ? idx - 1 : null,
        };
        tareasCursor = addDays(tFin, 1);
        return tarea;
      });

      cursor = addDays(faseFin, 1);
      return { nombre: f.nombre, descripcion: f.descripcion ?? '', fecha_inicio: faseInicio, fecha_fin: faseFin, tareas, expanded: true };
    });
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────

  emptyFase(): FaseEditable {
    return { nombre: '', descripcion: '', fecha_inicio: this.proyectoFechaInicio, fecha_fin: this.proyectoFechaInicio, tareas: [], expanded: true };
  }

  emptyTarea(): TareaEditable {
    return { nombre: '', descripcion: '', tipo_tarea: '', fecha_inicio: this.proyectoFechaInicio, fecha_fin: this.proyectoFechaInicio, hora_inicio: '07:00', hora_fin: '17:00', depende_de_idx: null };
  }

  addFase(): void { this.fases.push(this.emptyFase()); this.cdr.detectChanges(); }
  removeFase(i: number): void { this.fases.splice(i, 1); this.cdr.detectChanges(); }
  addTarea(fase: FaseEditable): void { fase.tareas.push(this.emptyTarea()); this.cdr.detectChanges(); }
  removeTarea(fase: FaseEditable, ti: number): void { fase.tareas.splice(ti, 1); this.cdr.detectChanges(); }

  // ── Validation ────────────────────────────────────────────────────────────

  faseError(f: FaseEditable): string {
    if (!f.nombre.trim()) return 'El nombre de la fase es obligatorio.';
    if (!f.fecha_inicio || !f.fecha_fin) return 'Las fechas de la fase son obligatorias.';
    if (f.fecha_inicio > f.fecha_fin) return 'La fecha de inicio debe ser anterior o igual a la de fin.';
    if (this.proyectoFechaInicio && f.fecha_inicio < this.proyectoFechaInicio)
      return `Inicio anterior al proyecto (${this.proyectoFechaInicio}).`;
    if (this.proyectoFechaFin && f.fecha_fin > this.proyectoFechaFin)
      return `Fin posterior al proyecto (${this.proyectoFechaFin}).`;
    return '';
  }

  tareaError(f: FaseEditable, t: TareaEditable): string {
    if (!t.nombre.trim()) return 'Nombre obligatorio.';
    if (!t.fecha_inicio || !t.fecha_fin) return 'Fechas obligatorias.';
    if (t.fecha_inicio > t.fecha_fin) return 'Inicio posterior al fin.';
    if (f.fecha_inicio && t.fecha_inicio < f.fecha_inicio)
      return `Inicio antes que la fase (${f.fecha_inicio}).`;
    if (f.fecha_fin && t.fecha_fin > f.fecha_fin)
      return `Fin después que la fase (${f.fecha_fin}).`;
    return '';
  }

  get hasErrors(): boolean {
    return this.fases.some(f =>
      !!this.faseError(f) || f.tareas.some(t => !!this.tareaError(f, t))
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  canSubmit(): boolean {
    return this.fases.length > 0 && !this.hasErrors;
  }

  submit(): void {
    if (!this.proyectoId || !this.canSubmit()) return;
    this.isSubmitting = true;

    const payload = this.fases.map(f => ({
      nombre:       f.nombre,
      descripcion:  f.descripcion,
      fecha_inicio: f.fecha_inicio,
      fecha_fin:    f.fecha_fin,
      tareas: f.tareas.map(t => ({
        nombre:         t.nombre,
        descripcion:    t.descripcion,
        tipo_tarea:     t.tipo_tarea,
        fecha_inicio:   t.fecha_inicio,
        fecha_fin:      t.fecha_fin,
        hora_inicio:    t.hora_inicio,
        hora_fin:       t.hora_fin,
        depende_de_idx: t.depende_de_idx,
        operarios:      [],
        maquinaria:     [],
      })),
    }));

    this.api.crearFasesBatch(this.proyectoId, payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigate(['/dashboard/director/gantt'], { queryParams: { proyecto: this.proyectoId } });
        this.cdr.detectChanges();
      },
      error: () => { this.isSubmitting = false; this.cdr.detectChanges(); },
    });
  }

  volver(): void { this.step = 'select'; this.cdr.detectChanges(); }

  get totalTareas(): number { return this.fases.reduce((s, f) => s + f.tareas.length, 0); }

  countTareas(p: Plantilla): number { return p.fases.reduce((s, f) => s + f.tareas.length, 0); }
}
