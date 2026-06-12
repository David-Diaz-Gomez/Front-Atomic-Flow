import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin, of, interval, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from '../../../shared/services/notification.service';
import { ProjectService } from '../../../shared/services/project.service';
import { Api } from '../../../core/services/api';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const REFRESH_MS = 30_000;

// Estados que se consideran "finalizados" — no se muestran en la bandeja activa
const ESTADOS_INACTIVOS = ['finalizado', 'cancelado', 'Finalizado', 'Cancelado'];

@Component({ selector: 'app-coord-home', standalone: false, templateUrl: './home.html', styleUrl: './home.scss' })
export class CoordHome implements OnInit, OnDestroy {
  loading = true;
  error = '';
  private refreshSub: Subscription | null = null;

  kpi = { proyectos_activos: 0, fases_pendientes: 0, tareas_sin_asignar: 0, evidencias_por_revisar: 0 };

  projects: any[] = [];
  filterEstado = '';

  fases: any[] = [];

  // Evidencias recientes (tareas completadas pendientes de evidencia)
  evidencias: any[] = [];
  get noLeidas(): number { return this.evidencias.filter(e => !e.leida).length; }
  markRead(e: any): void { e.leida = true; }

  constructor(
    private router: Router,
    private notifSvc: NotificationService,
    private projectSvc: ProjectService,
    private apiSvc: Api,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private pid: object,
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.pid)) {
      this.loadData();
      this.refreshSub = interval(REFRESH_MS).subscribe(() => this.loadData());
    }
  }

  ngOnDestroy(): void { this.refreshSub?.unsubscribe(); }

  loadData(): void {
    this.loading = true;
    this.error = '';
    const userId = this.apiSvc.getCurrentUserId();
    const filters: Record<string, any> = { limit: 50 };
    if (userId) filters['coordinador'] = userId;

    // KPIs reales desde el backend
    this.projectSvc.getCoordinadorKpis().pipe(catchError(() => of(null))).subscribe({
      next: kpi => {
        if (kpi) {
          this.kpi.proyectos_activos      = kpi.proyectos_activos      ?? 0;
          this.kpi.fases_pendientes       = kpi.fases_pendientes       ?? 0;
          this.kpi.tareas_sin_asignar     = kpi.tareas_sin_asignar     ?? 0;
          this.kpi.evidencias_por_revisar = kpi.evidencias_por_revisar ?? 0;
          this.cdr.detectChanges();
        }
      }
    });

    // Evidencias recientes — tareas completadas pendientes de evidencia
    if (userId) {
      this.projectSvc.getTareasCompletadas(userId).pipe(catchError(() => of([]))).subscribe({
        next: (tareas: any[]) => {
          const prevLeidas = new Set(this.evidencias.filter(e => e.leida).map(e => e.id));
          this.evidencias = (tareas ?? []).slice(0, 8).map(t => ({
            id: t.id,
            operario: t.operario ?? '—',
            tarea: t.nombre,
            proyecto: t.proyecto,
            hora: this.formatDateTime(t.completado_en),
            leida: prevLeidas.has(t.id),
          }));
          this.cdr.detectChanges();
        }
      });
    }

    // Lista de proyectos + fases para la bandeja
    this.projectSvc.getProjects(filters).subscribe({
      next: ({ data }) => {
        this.projects = data.filter(p => !ESTADOS_INACTIVOS.includes(p.estado ?? ''));

        if (this.projects.length) {
          const faseRequests = this.projects.map(p =>
            this.projectSvc.getFases(p.id).pipe(catchError(() => of([])))
          );
          forkJoin(faseRequests).subscribe({
            next: allFases => {
              this.fases = [];
              allFases.forEach((fasesProj: any[], i: number) => {
                const proj = this.projects[i];
                fasesProj
                  .filter((f: any) => f.delegada_a_mi === true)
                  .forEach((f: any) => {
                    this.fases.push({ ...f, proyecto_id: proj?.id, proyecto_nombre: proj?.nombre });
                  });
              });
              this.loading = false;
              this.cdr.detectChanges();
            },
            error: () => { this.loading = false; this.cdr.detectChanges(); }
          });
        } else {
          this.loading = false;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.error = 'No se pudieron cargar los proyectos.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  get fasesFiltradas(): any[] {
    return this.fases.filter(f => !this.filterEstado || f.estado === this.filterEstado);
  }

  goToProject(id: number): void { this.router.navigate(['/dashboard/coordinator/project', id]); }
  goToEvidences(): void { this.router.navigate(['/dashboard/coordinator/evidences']); }
  goToGantt(): void { this.router.navigate(['/dashboard/coordinator/gantt']); }

  estadoLabel(e: string): string {
    return e === 'pendiente_asignar' ? 'Sin asignar' : e === 'en_progreso' ? 'En progreso' : 'Completada';
  }
  estadoClass(e: string): string {
    return e === 'pendiente_asignar' ? 'st-pending' : e === 'en_progreso' ? 'st-progress' : 'st-done';
  }
  formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  formatDate(d: string): string {
    if (!d) return '';
    const p = d.split(/[-T]/);
    return `${parseInt(p[2]??'1',10)} ${MONTHS[parseInt(p[1]??'1',10)-1]??''}`;
  }
  progressPct(f: any): number {
    return f.total_tareas ? Math.round(((f.tareas_completadas ?? 0) / f.total_tareas) * 100) : 0;
  }
}
