import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProjectService } from '../../../shared/services/project.service';
import { CatalogService } from '../../../shared/services/catalog.service';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-reports',
  standalone: false,
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit {
  // ── Datos de catálogo para poblar los filtros (reales, vía API) ──
  proyectos: any[] = [];
  operarios: any[] = [];
  maquinarias: any[] = [];
  loadingCatalogos = true;

  // ── Filtro general ──
  filtroProyecto: number | '' = '';
  filtroEstado: '' | 'activo' | 'finalizado' = '';
  filtroFechaInicio: string;
  filtroFechaFin: string;

  // ── Filtro sección 2 (Ocupación) ──
  filtroOperario: number | '' = '';
  filtroMaquinaria: number | '' = '';

  // ── KPIs Sección 1 (placeholder — pendiente de endpoint de analítica) ──
  kpis = {
    completadas:   { valor: 128, pct: 62 },
    noCompletadas: { valor: 54,  pct: 26 },
    conRetraso:    { valor: 18,  pct: 9  },
    bloqueadas:    { valor: 12,  pct: 6  },
  };

  // Torta "Estados de Proyectos" (Sección 1): solo estas tres categorías de
  // `proyecto.estado` se muestran, el resto (borrador, en_revision, aprobado)
  // queda fuera del gráfico por decisión del equipo.
  proyectosPorEstado = {
    en_produccion: { valor: 9,  pct: 45, label: 'En Producción' },
    pausado:       { valor: 4,  pct: 20, label: 'Pausado' },
    finalizado:    { valor: 7,  pct: 35, label: 'Finalizado' },
  };

  constructor(
    private projectSvc: ProjectService,
    private catalogSvc: CatalogService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    this.filtroFechaInicio = isoDate(haceUnMes);
    this.filtroFechaFin = isoDate(hoy);
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadCatalogos();
    }
  }

  // Carga proyectos, operarios y maquinaria reales para las opciones de los <select>.
  // Los valores mostrados dentro de las gráficas siguen siendo estáticos hasta que
  // existan endpoints de analítica (ver explicación entregada al usuario).
  loadCatalogos(): void {
    this.loadingCatalogos = true;

    this.projectSvc.getProjects({ limit: 200 }).subscribe({
      next: ({ data }) => { this.proyectos = data; },
      error: () => { this.proyectos = []; },
    });

    this.catalogSvc.getUsersByRole(4).subscribe({
      next: (data) => { this.operarios = data; },
      error: () => { this.operarios = []; },
    });

    this.catalogSvc.getMaquinaria().subscribe({
      next: (data) => { this.maquinarias = data; this.loadingCatalogos = false; },
      error: () => { this.maquinarias = []; this.loadingCatalogos = false; },
    });
  }

  get proyectoSeleccionado(): any | null {
    if (!this.filtroProyecto) return null;
    return this.proyectos.find(p => p.id === this.filtroProyecto) ?? null;
  }

  get proyectosFiltrados(): any[] {
    if (!this.filtroEstado) return this.proyectos;
    return this.proyectos.filter(p => {
      const esFinalizado = p.estado === 'finalizado';
      return this.filtroEstado === 'finalizado' ? esFinalizado : !esFinalizado;
    });
  }
}
