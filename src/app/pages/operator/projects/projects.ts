import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../../../core/services/api';

@Component({
  selector: 'app-op-projects',
  standalone: false,
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
})
export class OpProjects implements OnInit {
  projects: any[] = [];
  expanded = new Set<number>();
  loading = true;

  constructor(private api: Api, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    const idOperario = this.api.getCurrentUserId();
    if (!idOperario) { this.loading = false; return; }
    this.loading = true;
    this.api.getOperarioProyectos(idOperario).subscribe({
      next: (data: any[]) => {
        this.projects = data ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.projects = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  toggle(id: number): void {
    this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id);
  }

  isExpanded(id: number): boolean { return this.expanded.has(id); }

  progressPct(p: any): number {
    return p.mis_tareas ? Math.round((p.tareas_completadas / p.mis_tareas) * 100) : 0;
  }

  goTask(tareaId: number): void {
    if (tareaId) this.router.navigate(['/dashboard/operator/task', tareaId]);
  }

  estadoLabel(e: string): string {
    const m: Record<string, string> = { pendiente:'Pendiente', asignada:'Asignada', en_progreso:'En Progreso', completada:'Completada' };
    return m[e] ?? e;
  }
}
