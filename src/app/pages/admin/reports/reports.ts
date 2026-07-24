import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

Chart.register(...registerables);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const CHART_COLORS = [
  '#a5b4fc', '#fcd34d', '#6ee7b7', '#fca5a5',
  '#93c5fd', '#c4b5fd', '#fdba74', '#5eead4',
  '#f9a8d4', '#bef264', '#67e8f9', '#ddd6fe',
];

type Tab = 'grafico' | 'ranking';

@Component({
  selector: 'app-reports',
  standalone: false,
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit, OnDestroy {
  @ViewChild('ocupacionChart')   ocupacionChartRef!:   ElementRef<HTMLCanvasElement>;
  @ViewChild('presupuestoChart') presupuestoChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('estadosChart')     estadosChartRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('fasesChart')       fasesChartRef!:       ElementRef<HTMLCanvasElement>;

  proyectos: any[] = [];
  loadingCatalogos = true;

  // ── Filtros generales ──
  filtroProyecto: number | '' = '';
  filtroProyectoText = '';
  showProyectoDropdown = false;
  filtroEstado: '' | 'activo' | 'finalizado' = '';
  filtroFechaInicio: string;
  filtroFechaFin: string;

  // ── Filtro sección 2 ──
  tipoRecurso: 'operarios' | 'maquinaria' = 'operarios';
  activeTab: Tab = 'grafico';

  // ── Gráfico de torta (ocupación) ──
  ocupacionData: { id_proyecto: number; nombre_proyecto: string; total_horas: number }[] = [];
  loadingOcupacion = false;
  private ocupacionChart: Chart | null = null;

  // ── Gráfico de barras (presupuesto) ──
  presupuestoData: { id_proyecto: number; nombre_proyecto: string; presupuesto_proyectado: number; gasto_real: number }[] = [];
  loadingPresupuesto = false;
  private presupuestoChart: Chart | null = null;

  private estadosChart: Chart | null = null;
  private fasesChart: Chart | null = null;

  // ── Ranking ──
  rankingData: { id_recurso: number; nombre: string; total_horas: number; total_tareas: number }[] = [];
  loadingRanking = false;
  rankingSearch = '';
  rankingSortDir: 'desc' | 'asc' = 'desc';

  // ── KPIs Sección 1 ──
  kpis: {
    total:         number;
    completadas:   { valor: number; pct: number };
    noCompletadas: { valor: number; pct: number };
    conRetraso:    { valor: number; pct: number };
  } | null = null;
  loadingKpis = false;

  // ── Estados de proyectos (Sección 1) ──
  proyectosPorEstado: {
    activos:     { valor: number; pct: number; label: string };
    enRevision:  { valor: number; pct: number; label: string };
    finalizados: { valor: number; pct: number; label: string };
  } | null = null;
  loadingProyectosPorEstado = false;

  // ── Avance por fases (Sección 4) ──
  fasesAvance: {
    id_fase: number; nombre_fase: string; total_tareas: number;
    pendientes: { valor: number; pct: number };
    en_progreso: { valor: number; pct: number };
    completadas: { valor: number; pct: number };
  }[] = [];
  loadingFasesAvance = false;

  constructor(
    private projectSvc: ProjectService,
    private api: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.filtroFechaInicio = isoDate(haceUnMes);
    this.filtroFechaFin    = isoDate(hoy);
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCatalogos();
      this.loadAll();
    }
  }

  ngOnDestroy(): void {
    this.ocupacionChart?.destroy();
    this.presupuestoChart?.destroy();
    this.estadosChart?.destroy();
    this.fasesChart?.destroy();
  }

  // ── Catálogos ──────────────────────────────────────────────────────────────

  loadCatalogos(): void {
    this.loadingCatalogos = true;
    this.projectSvc.getProjects({ limit: 200 }).subscribe({
      next: ({ data }) => { this.proyectos = data; this.loadingCatalogos = false; this.cdr.detectChanges(); },
      error: () => { this.proyectos = []; this.loadingCatalogos = false; this.cdr.detectChanges(); },
    });
  }

  // ── Filtros generales ──────────────────────────────────────────────────────

  /** Proyectos filtrados por estado (para el datalist y para proyectoSeleccionado).
   *  "Activo" = únicamente aprobado o en_produccion (no incluye borrador, en_revision ni pausado). */
  get proyectosFiltrados(): any[] {
    if (!this.filtroEstado) return this.proyectos;
    if (this.filtroEstado === 'finalizado') return this.proyectos.filter(p => p.estado === 'finalizado');
    return this.proyectos.filter(p => p.estado === 'aprobado' || p.estado === 'en_produccion');
  }

  get proyectoSeleccionado(): any | null {
    if (!this.filtroProyecto) return null;
    return this.proyectos.find(p => p.id === this.filtroProyecto) ?? null;
  }

  get proyectosBusqueda(): any[] {
    const q = this.filtroProyectoText.trim().toLowerCase();
    const base = this.proyectosFiltrados;
    return q ? base.filter(p => p.nombre.toLowerCase().includes(q)) : base;
  }

  /** Con un proyecto ya seleccionado el input queda en solo lectura, así que esto
   *  solo puede dispararse mientras se está escribiendo para buscar (sin selección). */
  onProyectoTextChange(text: string): void {
    if (this.filtroProyecto) return;
    this.showProyectoDropdown = true;
    if (!text.trim() && this.filtroProyecto !== '') {
      this.filtroProyecto = '';
      this.onFilterChange();
    }
  }

  /** No reabre el dropdown si ya hay un proyecto elegido — hay que limpiar con la "x" primero. */
  onProyectoFocus(): void {
    if (this.filtroProyecto) return;
    this.showProyectoDropdown = true;
  }

  selectProyecto(p: any): void {
    this.filtroProyectoText = p.nombre;
    this.filtroProyecto = p.id;
    this.showProyectoDropdown = false;
    this.onFilterChange();
  }

  clearProyecto(): void {
    this.filtroProyectoText = '';
    this.filtroProyecto = '';
    this.showProyectoDropdown = false;
    this.onFilterChange();
  }

  onProyectoBlur(): void {
    setTimeout(() => {
      this.showProyectoDropdown = false;
      if (this.filtroProyectoText && !this.filtroProyecto) {
        this.filtroProyectoText = '';
      }
    }, 180);
  }

  /** Cambio de estado: limpiar proyecto si ya no pertenece al estado elegido. */
  onEstadoChange(): void {
    if (this.filtroProyecto) {
      const aun = this.proyectosFiltrados.find(p => p.id === this.filtroProyecto);
      if (!aun) { this.filtroProyecto = ''; this.filtroProyectoText = ''; }
    }
    this.onFilterChange();
  }

  onFilterChange(): void {
    this.loadAll();
  }

  // ── Carga de datos ─────────────────────────────────────────────────────────

  private get currentFilters() {
    return {
      id_proyecto:  this.filtroProyecto  || undefined,
      estado:       this.filtroEstado    || undefined,
      fecha_inicio: this.filtroFechaInicio || undefined,
      fecha_fin:    this.filtroFechaFin   || undefined,
    };
  }

  loadAll(): void {
    this.loadOcupacion();
    this.loadRanking();
    this.loadPresupuesto();
    this.loadKpis();
    this.loadProyectosPorEstado();
    this.loadFasesAvance();
  }

  loadKpis(): void {
    this.loadingKpis = true;
    this.api.getKpisEstadoTareas(this.currentFilters).subscribe({
      next: (data) => {
        if (!data) { this.kpis = null; this.loadingKpis = false; this.cdr.detectChanges(); return; }
        const completadas   = Number(data.tareas_completadas) || 0;
        const noCompletadas = Number(data.tareas_no_completadas) || 0;
        const conRetraso    = Number(data.tareas_entregadas_retraso) || 0;
        // Las tarjetas de % usan el mismo denominador (completadas + no completadas = total en alcance)
        // para que los porcentajes sean comparables entre sí, aunque "con retraso" sea un subconjunto
        // superpuesto de las otras dos, no una categoría mutuamente excluyente.
        const total = completadas + noCompletadas;
        const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
        this.kpis = {
          total,
          completadas:   { valor: completadas,   pct: pct(completadas) },
          noCompletadas: { valor: noCompletadas, pct: pct(noCompletadas) },
          conRetraso:    { valor: conRetraso,    pct: pct(conRetraso) },
        };
        this.loadingKpis = false;
        this.cdr.detectChanges();
      },
      error: () => { this.kpis = null; this.loadingKpis = false; this.cdr.detectChanges(); },
    });
  }

  loadProyectosPorEstado(): void {
    this.loadingProyectosPorEstado = true;
    this.api.getProyectosPorEstado({
      fecha_inicio: this.filtroFechaInicio || undefined,
      fecha_fin:    this.filtroFechaFin    || undefined,
    }).subscribe({
      next: (data) => {
        if (!data) { this.proyectosPorEstado = null; this.loadingProyectosPorEstado = false; this.cdr.detectChanges(); return; }
        const activos     = Number(data.proyectos_activos) || 0;
        const enRevision  = Number(data.proyectos_en_revision) || 0;
        const finalizados = Number(data.proyectos_finalizados) || 0;
        const total = activos + enRevision + finalizados;
        const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
        this.proyectosPorEstado = {
          activos:     { valor: activos,     pct: pct(activos),     label: 'Activos' },
          enRevision:  { valor: enRevision,  pct: pct(enRevision),  label: 'En Revisión' },
          finalizados: { valor: finalizados, pct: pct(finalizados), label: 'Finalizados' },
        };
        this.loadingProyectosPorEstado = false;
        this.cdr.detectChanges();
        this.renderEstadosChart();
      },
      error: () => { this.proyectosPorEstado = null; this.loadingProyectosPorEstado = false; this.cdr.detectChanges(); },
    });
  }

  loadFasesAvance(): void {
    if (!this.filtroProyecto) { this.fasesAvance = []; this.fasesChart?.destroy(); this.fasesChart = null; return; }
    this.loadingFasesAvance = true;
    this.api.getFasesPorAvance({
      id_proyecto:  this.filtroProyecto,
      fecha_inicio: this.filtroFechaInicio || undefined,
      fecha_fin:    this.filtroFechaFin    || undefined,
    }).subscribe({
      next: (data) => {
        this.fasesAvance = data;
        this.loadingFasesAvance = false;
        this.cdr.detectChanges();
        this.renderFasesChart();
      },
      error: () => { this.fasesAvance = []; this.loadingFasesAvance = false; this.cdr.detectChanges(); },
    });
  }

  // Muestra una sola barra cuando hay un estado específico filtrado; las 3 categorías si no hay filtro.
  private renderEstadosChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.estadosChartRef?.nativeElement) return;

    this.estadosChart?.destroy();
    this.estadosChart = null;
    if (!this.proyectosPorEstado) return;

    const pe = this.proyectosPorEstado;
    const opciones: Record<string, { label: string; valor: number; pct: number; color: string }> = {
      activo:     { label: pe.activos.label,     valor: pe.activos.valor,     pct: pe.activos.pct,     color: '#8DC63F' },
      finalizado: { label: pe.finalizados.label,  valor: pe.finalizados.valor, pct: pe.finalizados.pct, color: '#3b82f6' },
    };
    const todas = [
      { label: pe.activos.label,     valor: pe.activos.valor,     pct: pe.activos.pct,     color: '#8DC63F' },
      { label: pe.enRevision.label,  valor: pe.enRevision.valor,  pct: pe.enRevision.pct,  color: '#f59e0b' },
      { label: pe.finalizados.label, valor: pe.finalizados.valor, pct: pe.finalizados.pct, color: '#3b82f6' },
    ];
    const items = this.filtroEstado && opciones[this.filtroEstado] ? [opciones[this.filtroEstado]] : todas;

    const labels = items.map(i => i.label);
    const values = items.map(i => i.valor);
    const colors = items.map(i => i.color);
    const pcts   = items.map(i => i.pct);

    this.estadosChart = new Chart(this.estadosChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 70 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y} proyecto${ctx.parsed.y !== 1 ? 's' : ''} (${pcts[ctx.dataIndex]}%)`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 12 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        },
      },
    });
  }

  private renderFasesChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.fasesChartRef?.nativeElement) return;

    this.fasesChart?.destroy();
    this.fasesChart = null;
    if (!this.fasesAvance.length) return;

    const labels      = this.fasesAvance.map(f => f.nombre_fase);
    const pendientes  = this.fasesAvance.map(f => f.pendientes.pct);
    const enProgreso  = this.fasesAvance.map(f => f.en_progreso.pct);
    const completadas = this.fasesAvance.map(f => f.completadas.pct);
    const valores      = this.fasesAvance.map(f => ({ p: f.pendientes.valor, e: f.en_progreso.valor, c: f.completadas.valor }));

    this.fasesChart = new Chart(this.fasesChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Pendiente',   data: pendientes,  backgroundColor: '#94a3b8', borderRadius: 4 },
          { label: 'En progreso', data: enProgreso,   backgroundColor: '#fbbf24', borderRadius: 4 },
          { label: 'Completada',  data: completadas, backgroundColor: '#22c55e', borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, padding: 16 } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = valores[ctx.dataIndex];
                const n = ctx.datasetIndex === 0 ? v.p : ctx.datasetIndex === 1 ? v.e : v.c;
                return ` ${ctx.dataset.label}: ${n} tarea${n !== 1 ? 's' : ''} (${ctx.parsed.x}%)`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => `${v}%`, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
          y: { stacked: true, ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  loadOcupacion(): void {
    this.loadingOcupacion = true;
    this.api.getOcupacionRecursos(this.tipoRecurso, this.currentFilters).subscribe({
      next: (data) => {
        this.ocupacionData = data;
        this.loadingOcupacion = false;
        this.cdr.detectChanges();
        this.renderOcupacionChart();
      },
      error: () => { this.ocupacionData = []; this.loadingOcupacion = false; this.cdr.detectChanges(); },
    });
  }

  loadRanking(): void {
    this.loadingRanking = true;
    this.api.getRankingRecursos(this.tipoRecurso, this.currentFilters).subscribe({
      next: (data) => { this.rankingData = data; this.loadingRanking = false; this.cdr.detectChanges(); },
      error: () => { this.rankingData = []; this.loadingRanking = false; this.cdr.detectChanges(); },
    });
  }

  loadPresupuesto(): void {
    this.loadingPresupuesto = true;
    this.api.getPresupuesto(this.currentFilters).subscribe({
      next: (data) => {
        this.presupuestoData = data;
        this.loadingPresupuesto = false;
        this.cdr.detectChanges();
        this.renderPresupuestoChart();
      },
      error: () => { this.presupuestoData = []; this.loadingPresupuesto = false; this.cdr.detectChanges(); },
    });
  }

  private renderPresupuestoChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.presupuestoChartRef?.nativeElement) return;

    this.presupuestoChart?.destroy();
    this.presupuestoChart = null;
    if (!this.presupuestoData.length) return;

    const labels    = this.presupuestoData.map(d => d.nombre_proyecto);
    const proyect   = this.presupuestoData.map(d => Number(d.presupuesto_proyectado));
    const real      = this.presupuestoData.map(d => Number(d.gasto_real));

    const fmt = (v: number) =>
      new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

    this.presupuestoChart = new Chart(this.presupuestoChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Proyectado',
            data: proyect,
            backgroundColor: 'rgba(165,180,252,0.75)',
            borderColor: '#6366f1',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Real',
            data: real,
            backgroundColor: 'rgba(253,186,116,0.75)',
            borderColor: '#f97316',
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 12 }, padding: 16 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              maxRotation: 35,
              callback(_val, i) {
                const label = (labels[i] ?? '').toString();
                return label.length > 18 ? label.slice(0, 16) + '…' : label;
              },
            },
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 11 },
              callback: (v) => v !== null ? fmt(Number(v)) : '',
            },
          },
        },
      },
    });
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  setTab(tab: Tab): void {
    this.activeTab = tab;
    if (tab === 'grafico') {
      this.ocupacionChart = null; // canvas fue destruido por *ngIf
      if (this.ocupacionData.length) {
        this.cdr.detectChanges();
        this.renderOcupacionChart();
      }
    }
  }

  onTipoChange(): void {
    this.ocupacionChart?.destroy();
    this.ocupacionChart = null;
    this.rankingSearch = '';
    this.loadAll();
  }

  // ── Gráfico ────────────────────────────────────────────────────────────────

  private renderOcupacionChart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.ocupacionChartRef?.nativeElement) return;

    this.ocupacionChart?.destroy();
    this.ocupacionChart = null;
    if (!this.ocupacionData.length) return;

    const labels = this.ocupacionData.map(d => d.nombre_proyecto);
    const values = this.ocupacionData.map(d => Number(d.total_horas));
    const total  = values.reduce((a, b) => a + b, 0);
    const colors = this.ocupacionData.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const labelTipo = this.tipoRecurso === 'operarios' ? 'Operarios' : 'Maquinaria';

    this.ocupacionChart = new Chart(this.ocupacionChartRef.nativeElement, {
      type: 'pie',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { size: 12 }, padding: 16,
              generateLabels(chart) {
                const ds = chart.data.datasets[0];
                return (chart.data.labels as string[]).map((label, i) => {
                  const val = ds.data[i] as number;
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                  return {
                    text: `${label} — ${pct}%`,
                    fillStyle: (ds.backgroundColor as string[])[i],
                    strokeStyle: '#fff', lineWidth: 2, hidden: false, index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val = ctx.parsed as number;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                return ` ${val.toFixed(2)} h  (${pct}%)  — ${labelTipo}`;
              },
            },
          },
        },
      },
    });
  }

  // ── Ranking ────────────────────────────────────────────────────────────────

  get rankingFiltered() {
    const q = this.rankingSearch.trim().toLowerCase();
    let list = q
      ? this.rankingData.filter(r => r.nombre.toLowerCase().includes(q))
      : [...this.rankingData];

    return this.rankingSortDir === 'asc'
      ? list.sort((a, b) => Number(a.total_horas) - Number(b.total_horas))
      : list.sort((a, b) => Number(b.total_horas) - Number(a.total_horas));
  }

  rankingBarWidth(horas: number): string {
    const max = this.rankingFiltered.reduce((m, r) => Math.max(m, Number(r.total_horas)), 1);
    return `${Math.round((Number(horas) / max) * 100)}%`;
  }

  rankingColor(i: number): string {
    return CHART_COLORS[i % CHART_COLORS.length];
  }

  toggleSortDir(): void {
    this.rankingSortDir = this.rankingSortDir === 'desc' ? 'asc' : 'desc';
  }
}
