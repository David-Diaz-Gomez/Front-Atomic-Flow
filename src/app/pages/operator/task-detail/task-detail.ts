import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../../../core/services/api';
import { ProjectService } from '../../../shared/services/project.service';

interface Evidencia {
  id: number;
  url: string;
  descripcion: string;
  fecha: string;
  hora: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  motivo_rechazo?: string;
}

interface RegistroHoras {
  id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  horas: number;
  actividad: string;
}

@Component({
  selector: 'app-op-task-detail',
  standalone: false,
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.scss',
})
export class OpTaskDetail implements OnInit {
  task: any = null;
  loading = true;
  activeTab: 'info' | 'evidencias' | 'horas' = 'info';

  // Evidence
  showEvidForm = false;
  evDescripcion = '';
  evPreview: string | null = null;
  evFile: File | null = null;
  submitting = false;

  // Hours
  showHoraForm = false;
  horaForm = { fecha: '', hora_inicio: '07:00', hora_fin: '12:00', actividad: '' };
  savingHora = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: Api,
    private projectSvc: ProjectService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;
    this.api.getTareaDetalle(id).subscribe({
      next: (data: any) => {
        this.task = data ? {
          ...data,
          evidencias: data.evidencias ?? [],
          registros: data.registros ?? [],
          maquinaria: data.maquinaria ?? [],
        } : null;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.task = null;
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
    const today = new Date();
    this.horaForm.fecha = this.toDateStr(today);
  }

  back(): void { window.history.back(); }

  private toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  private nowStr(): string {
    const n = new Date();
    return `${this.toDateStr(n)}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:00`;
  }

  // ── Estado helpers ─────────────────────────────────────────────────────────
  get canStart(): boolean {
    return this.task && ['pendiente','asignada'].includes(this.task.estado);
  }
  get isInProgress(): boolean { return this.task?.estado === 'en_progreso'; }
  get isCompleted(): boolean  { return this.task?.estado === 'completada' || this.task?.estado === 'en_revision'; }
  get hasRejected(): boolean  { return (this.task?.evidencias ?? []).some((e: Evidencia) => e.estado === 'rechazada'); }

  // ── Iniciar tarea ──────────────────────────────────────────────────────────
  iniciarTarea(): void {
    const idOperario = this.api.getCurrentUserId();
    if (!idOperario) return;
    this.submitting = true;
    this.api.iniciarTarea(this.task.id, idOperario).subscribe({
      next: () => {
        this.task.estado = 'en_progreso';
        this.task.inicio_real = this.nowStr();
        this.submitting = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ── Evidencia ──────────────────────────────────────────────────────────────
  onFileChange(event: Event): void {
    const f = (event.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.evFile = f;
    const reader = new FileReader();
    reader.onload = (e) => this.evPreview = e.target?.result as string;
    reader.readAsDataURL(f);
  }

  submitEvidencia(): void {
    if (!this.evDescripcion.trim()) return;
    this.submitting = true;

    const fd = new FormData();
    fd.append('descripcion', this.evDescripcion);
    if (this.evFile) fd.append('evidencias', this.evFile);

    this.projectSvc.subirEvidencias(this.task.id, fd).subscribe({
      next: () => {
        const now = new Date();
        const ev: Evidencia = {
          id: Date.now(),
          url: this.evPreview ?? '',
          descripcion: this.evDescripcion,
          fecha: this.toDateStr(now),
          hora: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
          estado: 'pendiente',
        };
        this.task.evidencias.unshift(ev);
        this.task.estado = 'en_revision';
        this.task.fin_real = this.nowStr();
        this.showEvidForm = false;
        this.evDescripcion = '';
        this.evPreview = null;
        this.evFile = null;
        this.submitting = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  // Reintentar tras rechazo
  reintentar(): void {
    this.showEvidForm = true;
    this.activeTab = 'evidencias';
  }

  // ── Horas ──────────────────────────────────────────────────────────────────
  get horasDuracion(): string {
    const [sh, sm] = this.horaForm.hora_inicio.split(':').map(Number);
    const [eh, em] = this.horaForm.hora_fin.split(':').map(Number);
    const h = (eh + em/60) - (sh + sm/60);
    return h > 0 ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : '—';
  }

  submitHoras(): void {
    if (!this.horaForm.actividad.trim()) return;
    this.savingHora = true;

    this.api.registrarHoras(this.task.id, this.horaForm).subscribe({
      next: () => {
        const [sh, sm] = this.horaForm.hora_inicio.split(':').map(Number);
        const [eh, em] = this.horaForm.hora_fin.split(':').map(Number);
        this.task.registros.unshift({
          id: Date.now(),
          fecha: this.horaForm.fecha,
          hora_inicio: this.horaForm.hora_inicio,
          hora_fin: this.horaForm.hora_fin,
          horas: (eh + em/60) - (sh + sm/60),
          actividad: this.horaForm.actividad,
        });
        this.showHoraForm = false;
        this.horaForm.actividad = '';
        this.savingHora = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.savingHora = false;
        this.cdr.detectChanges();
      },
    });
  }

  get totalHoras(): string {
    const h = (this.task?.registros ?? []).reduce((s: number, r: RegistroHoras) => s + r.horas, 0);
    return h % 1 === 0 ? String(h) : h.toFixed(1);
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  estadoLabel(e: string): string {
    const m: Record<string, string> = {
      pendiente:'Pendiente', asignada:'Asignada', en_progreso:'En Progreso',
      completada:'Completada', en_revision:'En Revisión'
    };
    return m[e] ?? e;
  }

  estadoBadge(e: string): string { return `badge-${e}`; }

  evEstadoLabel(e: string): string {
    return e === 'aprobada' ? 'Aprobada' : e === 'rechazada' ? 'Rechazada' : 'Pendiente revisión';
  }

  formatDateTime(dt: string | null): string {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  get pendingEvidencias(): number {
    return (this.task?.evidencias ?? []).filter((e: Evidencia) => e.estado === 'pendiente').length;
  }
}
