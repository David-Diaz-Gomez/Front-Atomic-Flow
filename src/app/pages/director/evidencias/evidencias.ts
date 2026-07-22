import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Api } from '../../../core/services/api';

interface EvidenciaItem {
  id: number;
  url_imagen: string;
  descripcion: string;
  fecha_subida: string;
}

interface TareaEvidencia {
  tarea_id: number;
  tarea: string;
  estado: string;
  tarea_fecha_inicio: string;
  tarea_fecha_fin: string;
  fase: string;
  proyecto: string;
  proyecto_id: number;
  operario: string;
  id_operario: number;
  completado_en: string;
  horario_fin_programado: string;
  verificador: string;
  id_verificador: number;
  verificado_en: string;
  coordinador: string;
  id_coordinador: number;
  evidencia_subida_en: string;
  evidencias: EvidenciaItem[];
  expanded: boolean;
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Component({
  selector: 'app-director-evidencias',
  standalone: false,
  templateUrl: './evidencias.html',
  styleUrl: './evidencias.scss',
})
export class DirectorEvidencias implements OnInit {
  tareas: TareaEvidencia[] = [];
  loading = true;
  lightboxImg: string | null = null;

  constructor(private api: Api, private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadEvidencias(); }

  loadEvidencias(): void {
    this.loading = true;
    const idDirector = this.api.getCurrentUserId() ?? 0;
    const params = new HttpParams().set('id_director', String(idDirector));
    this.http.get<any>(`${this.api.baseUrl}/director/evidencias`, { params }).subscribe({
      next: (r: any) => {
        const raw = r?.data?.rows ?? r?.data ?? r?.rows ?? r ?? [];
        this.tareas = raw.map((t: any) => ({ ...t, expanded: false }));
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.tareas = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  toggleExpand(t: TareaEvidencia): void { t.expanded = !t.expanded; this.cdr.detectChanges(); }

  openLightbox(url: string): void { this.lightboxImg = url; this.cdr.detectChanges(); }
  closeLightbox(): void           { this.lightboxImg = null; this.cdr.detectChanges(); }

  fmt(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  minutosEntre(a: string, b: string): string {
    if (!a || !b) return '';
    const diff = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
    if (diff < 60)  return `${diff} min`;
    if (diff < 1440) return `${Math.round(diff / 60)} h`;
    return `${Math.round(diff / 1440)} días`;
  }

  /** Compara completado_en con el último bloque de horario programado del operario */
  vsHorario(t: TareaEvidencia): { label: string; tipo: 'early' | 'late' | 'ok' } | null {
    if (!t.horario_fin_programado || !t.completado_en) return null;
    const programado = new Date(t.horario_fin_programado).getTime();
    const real       = new Date(t.completado_en).getTime();
    const diffMin    = Math.round((real - programado) / 60000);
    if (Math.abs(diffMin) < 5) return { label: 'A tiempo', tipo: 'ok' };
    if (diffMin < 0) {
      const abs = Math.abs(diffMin);
      const txt = abs < 60 ? `${abs} min antes` : `${Math.round(abs / 60)} h antes`;
      return { label: txt, tipo: 'early' };
    }
    const txt = diffMin < 60 ? `${diffMin} min tarde` : `${Math.round(diffMin / 60)} h tarde`;
    return { label: txt, tipo: 'late' };
  }

  /** Cuánto tardó el coordinador en aprobar: desde que el operario marcó hasta verificado_en */
  tiempoAprobacion(t: TareaEvidencia): string {
    const desde = t.completado_en;
    const hasta = t.verificado_en;
    if (!desde || !hasta) return '';
    return this.minutosEntre(desde, hasta);
  }
}
