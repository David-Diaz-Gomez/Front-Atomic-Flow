import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Api } from '../../../core/services/api';

function normalizeStr(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface PedidoItem {
  id: number; id_pedido: number; nombre_recurso: string;
  cantidad: number; valor_unitario: number; observacion: string | null;
}

interface Pedido {
  id: number; fecha_solicitud: number; fecha_requerida: string; fecha_compra: string | null;
  proveedor: string; valor: number; detalle: string | null;
  id_estado_pedido: number; estado: string;
  id_proyecto: number | null; nombre_proyecto: string | null;
  codigo_proyecto: string | null; centro_costos: string | null; estado_proyecto: string | null;
  items: PedidoItem[];
}

interface ProyectoGroup {
  id_proyecto: number | null; nombre_proyecto: string;
  codigo_proyecto: string | null; centro_costos: string | null;
  pedidos: Pedido[]; expanded: boolean;
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ESTADOS_PEDIDO = [
  { id: 1, label: 'Compra Realizada' }, { id: 2, label: 'Pedido en Bodega Completo' },
  { id: 3, label: 'Pedido en Bodega Incompleto' }, { id: 4, label: 'Solicitud Pedido' },
];

@Component({
  selector: 'app-coord-estados-compra',
  standalone: false,
  templateUrl: './estados-compra.html',
  styleUrls: ['./estados-compra.scss'],
})
export class CoordEstadosCompra implements OnInit {
  allPedidos: Pedido[] = [];
  grupos: ProyectoGroup[] = [];
  gruposFiltrados: ProyectoGroup[] = [];
  loading = true;
  filterSearch = '';
  filterEstado = '';
  estadosPedido = ESTADOS_PEDIDO;

  constructor(private api: Api, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getPedidos(1).subscribe({
      next: (res: any) => {
        // getPedidos devuelve data directamente (ya mapeado en api.ts)
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        this.allPedidos = list;
        this.buildGroups();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  buildGroups(): void {
    const map = new Map<number | null, ProyectoGroup>();
    for (const p of this.allPedidos) {
      const key = p.id_proyecto ?? null;
      if (!map.has(key)) {
        map.set(key, {
          id_proyecto: key,
          nombre_proyecto: p.nombre_proyecto ?? 'Sin Proyecto',
          codigo_proyecto: p.codigo_proyecto ?? null,
          centro_costos: p.centro_costos ?? null,
          pedidos: [], expanded: true,
        });
      }
      map.get(key)!.pedidos.push(p);
    }
    this.grupos = Array.from(map.values());
    this.applyFilters();
  }

  applyFilters(): void {
    const q = normalizeStr(this.filterSearch);
    const estado = this.filterEstado;
    this.gruposFiltrados = this.grupos
      .map(g => ({
        ...g,
        pedidos: g.pedidos.filter(p => {
          const matchEstado = estado ? String(p.id_estado_pedido) === estado : p.id_estado_pedido !== 5;
          const matchSearch = !q ||
            normalizeStr(p.nombre_proyecto ?? '').includes(q) ||
            normalizeStr(p.codigo_proyecto ?? '').includes(q) ||
            normalizeStr(p.centro_costos ?? '').includes(q) ||
            normalizeStr(p.proveedor ?? '').includes(q) ||
            p.items.some(i => normalizeStr(i.nombre_recurso).includes(q));
          return matchEstado && matchSearch;
        }),
      }))
      .filter(g => g.pedidos.length > 0);
    this.cdr.detectChanges();
  }

  toggleGrupo(g: ProyectoGroup): void { g.expanded = !g.expanded; this.cdr.detectChanges(); }

  proyectoLabel(g: ProyectoGroup): string {
    return g.codigo_proyecto ? `#${g.codigo_proyecto} ${g.nombre_proyecto}` : g.nombre_proyecto;
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  fmtFechaSolicitud(n: number): string {
    if (!n) return '—';
    const s = String(n);
    const y = s.slice(0,4), m = Number(s.slice(4,6))-1, d = s.slice(6,8);
    return `${Number(d)} ${MONTHS[m]} ${y}`;
  }

  fmtMoney(v: string | number): string {
    return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  estadoClass(id: number): string {
    return ({1:'badge-compra',2:'badge-completo',3:'badge-parcial',4:'badge-solicitud',5:'badge-inhabilitado'} as any)[id] ?? 'badge-default';
  }

  estadoProyectoLabel(e: string | null): string {
    return ({en_produccion:'En Producción',en_revision:'En Revisión',aprobado:'Aprobado',completado:'Completado',borrador:'Borrador'} as any)[e ?? ''] ?? (e ?? '');
  }

  get stats() {
    const list = this.allPedidos.filter(p => p.id_estado_pedido !== 5);
    return {
      total: list.length,
      solicitud: list.filter(p => p.id_estado_pedido === 4).length,
      parcial:   list.filter(p => p.id_estado_pedido === 3).length,
      completo:  list.filter(p => p.id_estado_pedido === 2).length,
    };
  }
}
