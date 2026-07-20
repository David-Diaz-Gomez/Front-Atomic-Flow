import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { Api } from '../../../core/services/api';
import { ProjectService } from '../../../shared/services/project.service';

// Normaliza texto quitando tildes y pasando a minúsculas para búsqueda tolerante
function normalizeStr(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface PedidoItem {
  id: number;
  id_pedido: number;
  id_detalle_recurso: number | null;
  nombre_recurso_libre: string | null;
  cantidad: number;
  valor_unitario: number;
  observacion: string | null;
  nombre_recurso: string;
  observaciones_recurso: string | null;
}

interface Pedido {
  id: number;
  fecha_compra: string | null;
  fecha_requerida: string;
  fecha_solicitud: number;
  cantidad_recibida: number;
  cantidad_solicitada: number;
  proveedor: string;
  valor: number;
  detalle: string | null;
  id_estado_pedido: number;
  estado: string;
  id_proyecto: number | null;
  nombre_proyecto: string | null;
  codigo_proyecto: string | null;
  centro_costos: string | null;
  estado_proyecto: string | null;
  items: PedidoItem[];
}

interface ProyectoGroup {
  id_proyecto: number | null;
  nombre_proyecto: string;
  codigo_proyecto: string | null;
  centro_costos: string | null;
  estado_proyecto: string | null;
  pedidos: Pedido[];
  expanded: boolean;
}

interface RecursoOption {
  id_detalle_recurso: number;
  nombre: string;
  presupuesto: number;  // precio_unitario × cantidad del presupuesto del proyecto
}

interface FormItem {
  id_detalle_recurso: number | null;
  nombre_recurso_libre: string;
  cantidad: number | null;
  valor_unitario: number | null;
  observacion: string;
}

interface ExtraValor {
  motivo: string;
  monto: number | null;
}

interface HistoricoDetalleItem {
  id: number;
  id_historico: number;
  id_detalle_pedido_recurso: number;
  cantidad_recibida: number;
  cantidad_pedida: number;
  valor_unitario: number;
  nombre_recurso: string;
  observaciones_recurso: string | null;
}

interface HistoricoEntrada {
  id: number;
  fecha_recibido: string;
  cantidad_recibida: number;
  observaciones: string;
  estado: number;
  items: HistoricoDetalleItem[];
}

interface EntregaFormItem {
  id_detalle_pedido_recurso: number;
  nombre_recurso: string;
  cantidad_pedida: number;
  cantidad_recibida: number | null;
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const ESTADOS_PEDIDO = [
  { id: 1, label: 'Compra Realizada' },
  { id: 2, label: 'Pedido en Bodega Completo' },
  { id: 3, label: 'Pedido en Bodega Incompleto' },
  { id: 4, label: 'Solicitud Pedido' },
];

@Component({
  selector: 'app-estados-compra',
  standalone: false,
  templateUrl: './estados-compra.html',
  styleUrls: ['./estados-compra.scss'],
})
export class EstadosCompra implements OnInit {
  allPedidos: Pedido[] = [];
  grupos: ProyectoGroup[] = [];
  gruposFiltrados: ProyectoGroup[] = [];
  borradores: Pedido[] = [];

  loading = true;
  filterSearch = '';
  filterEstado = '';

  page = 1;
  totalPages = 1;
  total = 0;

  estadosPedido = ESTADOS_PEDIDO;

  // ── Modal crear ───────────────────────────────────────────────────────────
  showModal = false;
  saving = false;
  submitted = false;

  // ── Modal historial ───────────────────────────────────────────────────────
  showHistorialModal = false;
  historialPedido: Pedido | null = null;
  historialEntradas: HistoricoEntrada[] = [];
  historialLoading = false;

  showEntregaForm = false;
  savingEntrega = false;
  entregaForm: { fecha_recibido: string; observaciones: string; items: EntregaFormItem[] } = {
    fecha_recibido: '',
    observaciones: '',
    items: [],
  };

  // ── Modal editar ──────────────────────────────────────────────────────────
  showEditModal = false;
  editingPedido: Pedido | null = null;
  updating = false;
  updateForm = {
    fecha_compra: '',
  };

  // ── Estado badge menú ─────────────────────────────────────────────────────
  openEstadoMenuId: number | null = null;

  // ── Modal Nuevo Recurso (solicitud) ───────────────────────────────────────
  showNuevoRecursoModal = false;
  savingNuevoRecurso = false;
  nuevoRecursoForm = { nombre: '', tipo_recurso: 'materia_prima', precio_unitario: null as number | null, cantidad: null as number | null, observaciones: '' };
  nuevoRecursoSubmitted = false;

  // ── Filtro rápido por proyecto ────────────────────────────────────────────
  filterProyectoId: string = '';  // '' = todos
  proyectosDisponibles: { key: string; label: string }[] = [];

  // ── Paginación UI (client-side sobre grupos) ──────────────────────────────
  uiPageSize = 8;
  uiPage = 0;
  get uiTotalPages(): number { return Math.ceil(this.gruposFiltrados.length / this.uiPageSize); }
  get gruposPaginados(): ProyectoGroup[] {
    return this.gruposFiltrados.slice(this.uiPage * this.uiPageSize, (this.uiPage + 1) * this.uiPageSize);
  }
  prevUiPage(): void { if (this.uiPage > 0) { this.uiPage--; this.cdr.detectChanges(); } }
  nextUiPage(): void { if (this.uiPage < this.uiTotalPages - 1) { this.uiPage++; this.cdr.detectChanges(); } }

  proyectos: any[] = [];
  proyectosFiltrados: any[] = [];
  proyectoSearch = '';
  showProyectoDropdown = false;

  recursos: RecursoOption[] = [];
  loadingRecursos = false;

  // Proveedores existentes para autocomplete
  proveedores: string[] = [];
  proveedoresFiltrados: string[] = [];
  showProveedorDropdown = false;

  // "Sin proyecto": items con nombre libre
  sinProyecto = false;

  form = {
    id_proyecto:     null as number | null,
    proveedor:       '',
    fecha_solicitud: '',
    fecha_requerida: '',
    detalle:         '',
    items:           [] as FormItem[],
    extras:          [] as ExtraValor[],
  };

  get baseValor(): number {
    return this.form.items.reduce((sum, i) =>
      sum + (Number(i.cantidad) || 0) * (Number(i.valor_unitario) || 0), 0);
  }

  get calculatedValor(): number {
    const extrasTotal = this.form.extras.reduce((sum, e) => sum + (Number(e.monto) || 0), 0);
    return this.baseValor + extrasTotal;
  }

  get autoDetalle(): string | null {
    if (!this.form.extras.length) return null;
    return this.form.extras
      .map(e => `${e.motivo}: ${this.fmtMoney(Number(e.monto) || 0)}`)
      .join(' | ');
  }

  get combinedDetalle(): string {
    return [this.form.detalle?.trim(), this.autoDetalle]
      .filter(s => s && s.trim())
      .join('\n');
  }

  get stats() {
    const list = this.allPedidos.filter(p => p.id_estado_pedido !== 5);
    return {
      total:     list.length,
      solicitud: list.filter(p => p.id_estado_pedido === 4).length,
      parcial:   list.filter(p => p.id_estado_pedido === 3).length,
      completo:  list.filter(p => p.id_estado_pedido === 2).length,
    };
  }

  get formErrors(): Record<string, string> {
    const f = this.form;
    const e: Record<string, string> = {};

    if (!this.sinProyecto && !f.id_proyecto)
      e['proyecto'] = 'Selecciona un proyecto';
    if (!f.proveedor.trim())
      e['proveedor'] = 'El proveedor es obligatorio';
    if (!f.fecha_solicitud)
      e['fecha_solicitud'] = 'Campo obligatorio';
    if (!f.fecha_requerida)
      e['fecha_requerida'] = 'Campo obligatorio';
    if (f.fecha_solicitud && f.fecha_requerida && f.fecha_solicitud > f.fecha_requerida)
      e['fecha_rango'] = 'La fecha de solicitud no puede ser posterior a la fecha requerida';
    if (f.items.length === 0)
      e['items'] = 'Agrega al menos un recurso al pedido';

    f.items.forEach((item, i) => {
      if (this.sinProyecto) {
        if (!item.nombre_recurso_libre?.trim()) e[`item_r_${i}`] = 'Nombre del recurso requerido';
      } else {
        if (!item.id_detalle_recurso) e[`item_r_${i}`] = 'Selecciona un recurso';
      }
      if (!item.cantidad || item.cantidad <= 0) e[`item_c_${i}`] = 'Cantidad requerida';
      if (item.valor_unitario === null || item.valor_unitario < 0) e[`item_v_${i}`] = 'Valor inválido';
      // Observación obligatoria cuando supera el presupuesto
      if (!this.sinProyecto && this.itemExcede(item) && !item.observacion?.trim())
        e[`item_o_${i}`] = 'Justifica por qué se supera el presupuesto';
    });

    f.extras.forEach((ex, i) => {
      if (!ex.motivo.trim())            e[`extra_m_${i}`] = 'El motivo es obligatorio';
      if (!ex.monto || ex.monto <= 0)   e[`extra_v_${i}`] = 'Ingresa un monto mayor a 0';
    });

    return e;
  }

  get isFormValid(): boolean {
    return Object.keys(this.formErrors).length === 0;
  }

  // Recurso pre-seleccionado al navegar desde project-detail
  private _pendingRecurso: { id_detalle_recurso: number; nombre: string; nombre_proveedor?: string | null; precio_unitario: number; cantidad: number } | null = null;

  constructor(
    private api: Api,
    private projectSvc: ProjectService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    // navigation state solo está disponible en el constructor
    const nav = this.router.getCurrentNavigation();
    this._pendingRecurso = nav?.extras?.state?.['recurso'] ?? null;
  }

  ngOnInit(): void {
    this.load();
    const proyectoId = this.route.snapshot.queryParamMap.get('abrirPedido');
    if (proyectoId) {
      this.openModal(Number(proyectoId));
    }
  }

  load(): void {
    this.loading = true;
    this.api.getPedidos(this.page).subscribe({
      next: (res: any) => {
        const todos: Pedido[] = res.data ?? [];
        this.borradores  = todos.filter(p => p.id_estado_pedido === 6);
        this.allPedidos  = todos.filter(p => p.id_estado_pedido !== 6);
        this.total       = res.total ?? 0;
        this.totalPages  = res.totalPages ?? 1;
        this.buildGroups();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.allPedidos = [];
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  buildGroups(): void {
    const map = new Map<number | null, ProyectoGroup>();
    for (const p of this.allPedidos) {
      const key = p.id_proyecto ?? null;
      if (!map.has(key)) {
        map.set(key, {
          id_proyecto:     key,
          nombre_proyecto: p.nombre_proyecto ?? 'Sin Proyecto',
          codigo_proyecto: p.codigo_proyecto ?? null,
          centro_costos:   p.centro_costos ?? null,
          estado_proyecto: p.estado_proyecto ?? null,
          pedidos:         [],
          expanded:        true,
        });
      }
      map.get(key)!.pedidos.push(p);
    }
    this.grupos = Array.from(map.values());

    // Construir lista para el filtro rápido de proyecto
    this.proyectosDisponibles = this.grupos.map(g => ({
      key: g.id_proyecto === null ? 'null' : String(g.id_proyecto),
      label: g.codigo_proyecto ? `#${g.codigo_proyecto} ${g.nombre_proyecto}` : g.nombre_proyecto,
    }));

    this.applyFilters();
  }

  applyFilters(): void {
    const q = normalizeStr(this.filterSearch);
    const estado = this.filterEstado;
    const proyId = this.filterProyectoId;

    this.gruposFiltrados = this.grupos
      .filter(g => {
        if (!proyId) return true;
        const gKey = g.id_proyecto === null ? 'null' : String(g.id_proyecto);
        return gKey === proyId;
      })
      .map(g => {
        const pedidos = g.pedidos.filter(p => {
          const matchEstado = estado
            ? String(p.id_estado_pedido) === estado
            : p.id_estado_pedido !== 5;

          const matchSearch = !q ||
            normalizeStr(p.nombre_proyecto ?? '').includes(q) ||
            normalizeStr(p.codigo_proyecto ?? '').includes(q) ||
            normalizeStr(p.centro_costos ?? '').includes(q) ||
            normalizeStr(p.proveedor ?? '').includes(q) ||
            normalizeStr(p.detalle ?? '').includes(q) ||
            p.items.some(i => normalizeStr(i.nombre_recurso).includes(q));

          return matchEstado && matchSearch;
        });
        return { ...g, pedidos };
      })
      .filter(g => g.pedidos.length > 0);

    this.uiPage = 0;
    this.cdr.detectChanges();
  }

  toggleGrupo(g: ProyectoGroup): void {
    g.expanded = !g.expanded;
    this.cdr.detectChanges();
  }

  goPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.load();
  }

  // ── Modal crear ───────────────────────────────────────────────────────────

  openModal(preProyectoId?: number | null): void {
    this.submitted = false;
    this.sinProyecto = false;
    this.form = {
      id_proyecto: preProyectoId ?? null,
      proveedor: this._pendingRecurso?.nombre_proveedor ?? '',
      fecha_solicitud: new Date().toISOString().split('T')[0],
      fecha_requerida: '',
      detalle: '',
      items: [],
      extras: [],
    };
    this.recursos = [];
    this.proyectoSearch = '';
    this.showProyectoDropdown = false;
    this.showProveedorDropdown = false;
    this.showModal = true;

    if (!this.proyectos.length) {
      this.projectSvc.getProjects({ aprobado: 'true', limit: 100 }).subscribe({
        next: r => {
          this.proyectos = r.data ?? [];
          this.proyectosFiltrados = this.proyectos;
          if (preProyectoId) {
            const proy = this.proyectos.find(p => p.id === preProyectoId);
            if (proy) {
              this.proyectoSearch = this.proyectoLabel(proy);
              this.onProyectoChange();
            }
          }
          this.cdr.detectChanges();
        },
        error: () => {},
      });
    } else {
      this.proyectosFiltrados = this.proyectos;
      if (preProyectoId) {
        const proy = this.proyectos.find(p => p.id === preProyectoId);
        if (proy) { this.proyectoSearch = this.proyectoLabel(proy); this.onProyectoChange(); }
      }
    }

    if (!this.proveedores.length) {
      this.api.getProveedoresPedido().subscribe({
        next: list => { this.proveedores = list; this.cdr.detectChanges(); },
        error: () => {},
      });
    }
  }

  proyectoLabel(p: any): string {
    return p.codigo ? `#${p.codigo} ${p.nombre}` : p.nombre;
  }

  toggleSinProyecto(): void {
    this.sinProyecto = !this.sinProyecto;
    this.form.id_proyecto = null;
    this.proyectoSearch = '';
    this.recursos = [];
    this.form.items = [{ id_detalle_recurso: null, nombre_recurso_libre: '', cantidad: null, valor_unitario: null, observacion: '' }];
    this.cdr.detectChanges();
  }

  onProveedorInput(): void {
    const q = normalizeStr(this.form.proveedor);
    this.proveedoresFiltrados = q
      ? this.proveedores.filter(p => normalizeStr(p).includes(q))
      : this.proveedores;
    this.showProveedorDropdown = !!this.proveedoresFiltrados.length;
    this.cdr.detectChanges();
  }

  selectProveedor(p: string): void {
    this.form.proveedor = p;
    this.showProveedorDropdown = false;
    this.cdr.detectChanges();
  }

  blurProveedor(): void {
    setTimeout(() => { this.showProveedorDropdown = false; this.cdr.detectChanges(); }, 150);
  }

  closeModal(): void { this.showModal = false; }

  onProyectoSearchInput(): void {
    const q = normalizeStr(this.proyectoSearch);
    this.proyectosFiltrados = q
      ? this.proyectos.filter(p => normalizeStr(this.proyectoLabel(p)).includes(q) || normalizeStr(p.centro_costos ?? '').includes(q))
      : this.proyectos;
    this.showProyectoDropdown = true;
    this.cdr.detectChanges();
  }

  selectProyecto(p: any): void {
    this.form.id_proyecto = p.id;
    this.proyectoSearch   = this.proyectoLabel(p);
    this.showProyectoDropdown = false;
    this.onProyectoChange();
  }

  blurProyecto(): void {
    setTimeout(() => { this.showProyectoDropdown = false; this.cdr.detectChanges(); }, 150);
  }

  onProyectoChange(): void {
    this.recursos = [];
    this.form.items = [];
    if (!this.form.id_proyecto) return;

    this.loadingRecursos = true;
    this.api.getRecursosParaPedido(this.form.id_proyecto).subscribe({
      next: (list) => {
        this.recursos = list.map(r => {
          const obs = r.observaciones;
          const esJson = obs ? (() => { try { JSON.parse(obs); return true; } catch { return false; } })() : false;
          const label = obs && !esJson ? `${r.nombre_recurso} — ${obs}` : r.nombre_recurso;
          return {
            id_detalle_recurso: r.id_detalle_recurso,
            nombre: label,
            presupuesto: Number(r.precio_unitario ?? 0) * Number(r.cantidad ?? 0),
          };
        });
        this.loadingRecursos = false;

        const pr = this._pendingRecurso;
        if (pr) {
          // Pre-seleccionar el recurso específico con sus cantidades/precio del presupuesto
          this.form.items = [{
            id_detalle_recurso: pr.id_detalle_recurso,
            nombre_recurso_libre: '',
            cantidad: pr.cantidad,
            valor_unitario: pr.precio_unitario,
            observacion: '',
          }];
          this._pendingRecurso = null;
        } else {
          this.addItem();
        }
        this.cdr.detectChanges();
      },
      error: () => { this.loadingRecursos = false; this.cdr.detectChanges(); },
    });
  }

  // ── Items ────────────────────────────────────────────────────────────────

  addItem(): void {
    this.form.items.push({ id_detalle_recurso: null, nombre_recurso_libre: '', cantidad: null, valor_unitario: null, observacion: '' });
    this.cdr.detectChanges();
  }

  removeItem(index: number): void {
    this.form.items.splice(index, 1);
    this.cdr.detectChanges();
  }

  addExtra(): void {
    this.form.extras.push({ motivo: '', monto: null });
    this.cdr.detectChanges();
  }

  removeExtra(index: number): void {
    this.form.extras.splice(index, 1);
    this.cdr.detectChanges();
  }

  submitForm(): void {
    this.submitted = true;
    this.cdr.detectChanges();
    if (!this.isFormValid) return;
    const f = this.form;

    this.saving = true;
    this.api.createPedido({
      fecha_requerida: f.fecha_requerida,
      fecha_solicitud: this.dateToInt(f.fecha_solicitud),
      proveedor:       f.proveedor,
      valor:           this.calculatedValor,
      detalle:         [f.detalle, this.autoDetalle].filter(s => s && s.trim()).join(' | ') || null,
      items: f.items.map(i => ({
        id_detalle_recurso:  this.sinProyecto ? null : i.id_detalle_recurso,
        nombre_recurso_libre: this.sinProyecto ? (i.nombre_recurso_libre || null) : null,
        cantidad:            i.cantidad!,
        valor_unitario:      i.valor_unitario!,
        observacion:         i.observacion || null,
      })),
    }).subscribe({
      next: () => {
        this.saving = false;
        this.showModal = false;
        this.page = 1;
        this.load();
      },
      error: () => { this.saving = false; this.cdr.detectChanges(); },
    });
  }

  // ── Modal historial ───────────────────────────────────────────────────────

  openHistorial(p: Pedido): void {
    this.historialPedido = p;
    this.historialEntradas = [];
    this.historialLoading = true;
    this.showHistorialModal = true;
    this.showEntregaForm = false;
    this.entregaForm = {
      fecha_recibido: '',
      observaciones: '',
      items: p.items.map(i => ({
        id_detalle_pedido_recurso: i.id,
        nombre_recurso: this.labelRecursoItem(i),
        cantidad_pedida: i.cantidad,
        cantidad_recibida: null,
      })),
    };
    this.cdr.detectChanges();
    this.loadHistorial(p.id);
  }

  private loadHistorial(idPedido: number): void {
    this.historialLoading = true;
    this.api.getHistoricoPedido(idPedido).subscribe({
      next: (rows: any[]) => {
        this.historialEntradas = rows as HistoricoEntrada[];
        this.historialLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.historialLoading = false; this.cdr.detectChanges(); },
    });
  }

  closeHistorial(): void {
    this.showHistorialModal = false;
    this.historialPedido = null;
    this.showEntregaForm = false;
  }

  get historialProgreso(): number {
    const p = this.historialPedido;
    if (!p || !p.cantidad_solicitada) return 0;
    return Math.min(100, Math.round((p.cantidad_recibida / p.cantidad_solicitada) * 100));
  }

  submitEntrega(): void {
    if (!this.historialPedido) return;

    if (!this.entregaForm.fecha_recibido) {
      Swal.fire({ icon: 'warning', title: 'Fecha requerida', text: 'Debes ingresar la fecha de entrega', confirmButtonColor: '#3085d6' });
      return;
    }

    const items = this.entregaForm.items
      .filter(i => (Number(i.cantidad_recibida) || 0) > 0)
      .map(i => ({ id_detalle_pedido_recurso: i.id_detalle_pedido_recurso, cantidad_recibida: Number(i.cantidad_recibida!) }));

    if (!items.length) {
      Swal.fire({ icon: 'warning', title: 'Sin cantidades', text: 'Ingresa al menos una cantidad mayor a 0', confirmButtonColor: '#3085d6' });
      return;
    }

    this.savingEntrega = true;
    this.api.crearHistoricoPedido({
      fecha_recibido: this.entregaForm.fecha_recibido,
      observaciones:  this.entregaForm.observaciones,
      id_pedido:      this.historialPedido.id,
      items,
    }).subscribe({
      next: (data: any) => {
        this.savingEntrega = false;
        this.showEntregaForm = false;

        const pedido = this.allPedidos.find(p => p.id === this.historialPedido!.id);
        if (pedido && data) {
          pedido.cantidad_recibida = data.cantidad_recibida_pedido;
          pedido.id_estado_pedido  = data.id_estado_pedido;
          const ep = ESTADOS_PEDIDO.find(e => e.id === data.id_estado_pedido);
          if (ep) pedido.estado = ep.label;
          this.historialPedido = { ...pedido };
          this.buildGroups();
        }

        this.loadHistorial(this.historialPedido!.id);
      },
      error: () => { this.savingEntrega = false; this.cdr.detectChanges(); },
    });
  }

  // ── Modal editar ──────────────────────────────────────────────────────────

  openEditModal(p: Pedido): void {
    this.editingPedido = p;
    this.updateForm = {
      fecha_compra: p.fecha_compra ? p.fecha_compra.substring(0, 10) : '',
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingPedido = null;
  }

  submitUpdate(): void {
    if (!this.editingPedido) return;
    this.updating = true;

    const body: any = { fecha_compra: this.updateForm.fecha_compra || null };
    if (this.updateForm.fecha_compra) body.id_estado_pedido = 1;

    this.api.updatePedido(this.editingPedido.id, body).subscribe({
      next: () => {
        this.updating = false;
        this.showEditModal = false;
        this.load();
      },
      error: () => { this.updating = false; this.cdr.detectChanges(); },
    });
  }

  confirmarInhabilitar(): void {
    if (!this.editingPedido) return;
    Swal.fire({
      title: '¿Inhabilitar pedido?',
      text: 'El pedido quedará inhabilitado y no aparecerá en la consulta.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e53e3e',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Sí, inhabilitar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (!result.isConfirmed || !this.editingPedido) return;
      this.updating = true;
      this.api.inhabilitarPedido(this.editingPedido.id).subscribe({
        next: () => {
          this.updating = false;
          this.showEditModal = false;
          this.load();
        },
        error: () => { this.updating = false; this.cdr.detectChanges(); },
      });
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private dateToInt(dateStr: string): number {
    return parseInt(dateStr.replace(/-/g, ''), 10);
  }

  fmtFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  fmtFechaSolicitud(n: number): string {
    if (!n) return '—';
    const s = String(n);
    const y = s.slice(0, 4), m = Number(s.slice(4, 6)) - 1, d = s.slice(6, 8);
    return `${Number(d)} ${MONTHS[m]} ${y}`;
  }

  fmtMoney(v: string | number): string {
    return Number(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  }

  estadoClass(id: number): string {
    return ({
      1: 'badge-compra',
      2: 'badge-completo',
      3: 'badge-parcial',
      4: 'badge-solicitud',
      5: 'badge-inhabilitado',
    } as any)[id] ?? 'badge-default';
  }

  labelRecursoItem(item: PedidoItem): string {
    const obs = item.observaciones_recurso;
    if (!obs) return item.nombre_recurso;
    try { JSON.parse(obs); return item.nombre_recurso; } catch { /* no es JSON */ }
    return `${item.nombre_recurso} — ${obs}`;
  }

  labelHistoricoItem(item: HistoricoDetalleItem): string {
    const obs = item.observaciones_recurso;
    if (!obs) return item.nombre_recurso;
    try { JSON.parse(obs); return item.nombre_recurso; } catch { /* no es JSON */ }
    return `${item.nombre_recurso} — ${obs}`;
  }

  estadoProyectoLabel(e: string | null): string {
    if (!e) return '';
    return ({ en_produccion: 'En Producción', en_revision: 'En Revisión', aprobado: 'Aprobado', completado: 'Completado', borrador: 'Borrador' } as any)[e] ?? e;
  }

  // ── Presupuesto helpers ───────────────────────────────────────────────────

  getPresupuesto(idDetalleRecurso: number | null): number {
    if (!idDetalleRecurso) return 0;
    return this.recursos.find(r => r.id_detalle_recurso === idDetalleRecurso)?.presupuesto ?? 0;
  }

  itemTotal(item: FormItem): number {
    return (Number(item.cantidad) || 0) * (Number(item.valor_unitario) || 0);
  }

  itemExcede(item: FormItem): boolean {
    const pres = this.getPresupuesto(item.id_detalle_recurso);
    if (!pres) return false;
    return this.itemTotal(item) > pres;
  }

  // ── Modal Nuevo Recurso ───────────────────────────────────────────────────

  openNuevoRecursoModal(): void {
    this.nuevoRecursoForm = { nombre: '', tipo_recurso: 'materia_prima', precio_unitario: null, cantidad: null, observaciones: '' };
    this.nuevoRecursoSubmitted = false;
    this.showNuevoRecursoModal = true;
    this.cdr.detectChanges();
  }

  closeNuevoRecursoModal(): void {
    this.showNuevoRecursoModal = false;
  }

  submitNuevoRecurso(): void {
    this.nuevoRecursoSubmitted = true;
    const f = this.nuevoRecursoForm;
    if (!f.nombre.trim() || !f.precio_unitario || !f.cantidad) {
      this.cdr.detectChanges();
      return;
    }
    if (!this.form.id_proyecto && !this.sinProyecto) return;

    this.savingNuevoRecurso = true;

    // Primero guardamos el pedido como borrador para tener su id
    const hoy = new Date().toISOString().split('T')[0];
    const pedidoBody: any = {
      fecha_solicitud: this.dateToInt(this.form.fecha_solicitud || hoy),
      fecha_requerida: this.form.fecha_requerida || hoy,
      proveedor: this.form.proveedor || 'Pendiente',
      valor: 0,
      id_estado_pedido: 6,  // Borrador
      items: [{ nombre_recurso_libre: f.nombre, cantidad: f.cantidad!, valor_unitario: f.precio_unitario!, id_detalle_recurso: null }],
    };

    this.api.createPedido(pedidoBody).subscribe({
      next: (pedidoRes: any) => {
        const idPedido = pedidoRes?.id ?? pedidoRes?.data?.id;
        this.api.createSolicitudRecurso(this.form.id_proyecto!, {
          nombre: f.nombre.trim(),
          tipo_recurso: f.tipo_recurso,
          precio_unitario: f.precio_unitario!,
          cantidad: f.cantidad!,
          observaciones: f.observaciones || undefined,
          id_pedido: idPedido ?? null,
        }).subscribe({
          next: () => {
            this.savingNuevoRecurso = false;
            this.showNuevoRecursoModal = false;
            this.closeModal();
            this.load();
            Swal.fire({
              icon: 'info', title: 'Solicitud enviada',
              text: 'El pedido quedó como Borrador hasta que se apruebe el recurso en "Mi Proyecto".',
              confirmButtonColor: '#0052cc',
            });
          },
          error: () => { this.savingNuevoRecurso = false; this.cdr.detectChanges(); },
        });
      },
      error: () => { this.savingNuevoRecurso = false; this.cdr.detectChanges(); },
    });
  }

  // ── Estado menú ───────────────────────────────────────────────────────────

  toggleEstadoMenu(pedidoId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openEstadoMenuId = this.openEstadoMenuId === pedidoId ? null : pedidoId;
    this.cdr.detectChanges();
  }

  closeEstadoMenus(): void {
    this.openEstadoMenuId = null;
    this.cdr.detectChanges();
  }

  getEstadoTransitions(currentId: number): { id: number; label: string }[] {
    const all = [
      { id: 4, label: 'Solicitud Pedido' },
      { id: 1, label: 'Compra Realizada' },
      { id: 3, label: 'En Bodega Incompleto' },
      { id: 2, label: 'En Bodega Completo' },
      { id: 5, label: 'Inhabilitado' },
    ];
    return all.filter(s => s.id !== currentId);
  }

  changeEstado(pedido: Pedido, newEstadoId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openEstadoMenuId = null;
    this.api.updateEstadoPedido(pedido.id, newEstadoId).subscribe({
      next: () => { this.load(); },
      error: () => {},
    });
  }
}
