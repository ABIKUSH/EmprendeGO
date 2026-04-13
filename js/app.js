// ===== ESTADO GLOBAL =====
let currentUser = null;
let historial = [];
let productos = [];
let proveedoresDB = [];
let currentCat = 'Todas';
let currentResult = '';
let pantallaAnterior = 'buscar';
let provActual = null;
let chatMsgs = [];
let buscarTab = 'productos';
let productoActual = null;
let pantallaAnteriorProd = 'inicio';

// ===== FAVORITOS =====
let favs = [];
try { favs = JSON.parse(localStorage.getItem('eg_favs') || '[]'); } catch(e) { favs = []; }

function guardarFavs() {
  try { localStorage.setItem('eg_favs', JSON.stringify(favs)); } catch(e) {}
  refreshFavBadge();
}
function refreshFavBadge() {
  const b = document.getElementById('fav-badge');
  if (!b) return;
  if (favs.length > 0) { b.style.display = 'flex'; b.textContent = favs.length; }
  else b.style.display = 'none';
}
function esFav(id) { return favs.some(f => String(f.id) === String(id)); }
function toggleFav(id) {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  const idx = favs.findIndex(f => String(f.id) === String(id));
  if (idx >= 0) { favs.splice(idx, 1); showToast('Eliminado de favoritos'); }
  else { favs.push(p); showToast('¡Guardado en favoritos!'); }
  guardarFavs();
  renderFavs();
}
function toggleFavActual() {
  if (!provActual) return;
  toggleFav(provActual.id);
  const btn = document.getElementById('det-fav-btn');
  if (btn) btn.textContent = esFav(provActual.id) ? '❤️' : '♡';
}
function renderFavs() {
  const el = document.getElementById('favs-list');
  if (!el) return;
  if (!favs.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6B7A99"><div style="font-size:3rem;margin-bottom:12px">❤️</div><p style="font-size:.88rem;line-height:1.6">Todavia no guardaste favoritos.<br>Toca el corazon en cualquier proveedor.</p></div>';
    return;
  }
  const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
  el.innerHTML = favs.map((p, i) => {
    const pid = String(p.id);
    const bg = bgs[i % bgs.length];
    const ini = (p.inicial || p.nombre.substring(0,2)).toUpperCase();
    const avgR = getProvRating(pid).avg.toFixed(1);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #E2E8F8;margin-bottom:12px;overflow:hidden;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
          ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover"></div>`
          : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${ini}</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Sora',sans-serif;font-size:.93rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
          <div style="font-size:.75rem;color:#6B7A99;margin-top:2px">${p.rubro || ''}${p.provincia ? ' · ' + p.provincia : ''}</div>
        </div>
        <div style="font-size:.76rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avgR} ★</div>
      </div>
      <div style="padding:0 14px 13px">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:9px">${p.desc || ''}</p>
        <div style="display:flex;gap:7px">
          <button data-favid="${pid}" style="background:#FFF0F5;color:#F43F8E;border:none;border-radius:9px;padding:7px 12px;font-size:.76rem;font-weight:700;cursor:pointer">❤️ Quitar</button>
        </div>
      </div>
    </div>`;
  }).join('');
  el.onclick = function(e) {
    const fb = e.target.closest('[data-favid]');
    const card = e.target.closest('[data-id]');
    if (fb) { e.stopPropagation(); toggleFav(fb.dataset.favid); return; }
    if (card) abrirDetalle(card.dataset.id);
  };
}

// ===== SUPABASE =====
async function cargarProveedores() {
  try {
    const { data, error } = await sb.from('proveedores').select('*').eq('estado','aprobado').order('created_at',{ascending:false});
    if (error) throw error;
    if (data && data.length > 0) {
      proveedoresDB = data.map(p => ({
        id: String(p.id), nombre: p.nombre, rubro: p.rubro || 'General',
        desc: p.descripcion || '', pro: p.plan === 'pro',
        inicial: p.nombre.substring(0,2).toUpperCase(), whatsapp: p.whatsapp || '',
        provincia: p.provincia || '', pedido_minimo: p.pedido_minimo || 'Sin minimo',
        envios: p.envios || 'Consultar', instagram: p.instagram || '',
        logo_url: p.logo_url || ''
      }));
    } else { proveedoresDB = proveedoresDEMO; }
  } catch(e) { proveedoresDB = proveedoresDEMO; }
  renderProvs(proveedoresDB);
  renderMapaProvincias();
  renderMapaAllProvs();
}

const proveedoresDEMO = [
  {id:'1',nombre:'TechMayor BA',rubro:'Tecnologia',desc:'Mayorista de accesorios y electronica. Precios desde $500. Envio a todo el pais.',pro:true,inicial:'TM',provincia:'Buenos Aires',whatsapp:'5491112345678',pedido_minimo:'Desde $10.000',envios:'Si, a todo el pais',instagram:'@techmayor_ba'},
  {id:'2',nombre:'HomeDeco Sur',rubro:'Hogar',desc:'Articulos de decoracion y hogar al por mayor. Minimo 10 unidades.',pro:false,inicial:'HD',provincia:'Buenos Aires',pedido_minimo:'10 unidades',envios:'Solo zona local',instagram:''},
  {id:'3',nombre:'Modas del Litoral',rubro:'Moda',desc:'Ropa de mujer y accesorios. Colecciones actualizadas cada temporada.',pro:true,inicial:'ML',provincia:'Santa Fe',whatsapp:'5493412345678',pedido_minimo:'Desde $5.000',envios:'Si, a todo el pais',instagram:'@modaslitoral'},
  {id:'4',nombre:'Bazar Mayorista GBA',rubro:'Bazar',desc:'Todo para el bazar: utensilios, limpieza, papeleria. Bajo precio.',pro:false,inicial:'BM',provincia:'Buenos Aires',pedido_minimo:'Sin minimo',envios:'GBA y CABA',instagram:''},
  {id:'5',nombre:'AlimVerde SRL',rubro:'Alimentos',desc:'Productos naturales y organicos al por mayor. Certificados.',pro:true,inicial:'AV',provincia:'Cordoba',whatsapp:'5493514444444',pedido_minimo:'Desde $20.000',envios:'Si, a todo el pais',instagram:''},
  {id:'6',nombre:'CelularPro Dist.',rubro:'Tecnologia',desc:'Distribucion de celulares y repuestos. Garantia de fabrica.',pro:true,inicial:'CP',provincia:'CABA',whatsapp:'5491187654321',pedido_minimo:'Desde $50.000',envios:'Si, a todo el pais',instagram:''},
  {id:'7',nombre:'RopaKids Mayoreo',rubro:'Moda',desc:'Ropa infantil al por mayor. Talles 0 a 14. Stock permanente.',pro:false,inicial:'RK',provincia:'Buenos Aires',pedido_minimo:'Desde $8.000',envios:'GBA',instagram:''},
  {id:'8',nombre:'CasaFacil Dist.',rubro:'Hogar',desc:'Muebles flat-pack y articulos de cocina. Entrega en 48hs.',pro:false,inicial:'CF',provincia:'Cordoba',pedido_minimo:'Desde $15.000',envios:'Cordoba',instagram:''}
];

// ===== RESEÑAS (Supabase real) =====
// Cache en memoria para no pedir siempre lo mismo
const resenasCache = {};

function renderStarsHTML(rating, size) {
  const sizes = {sm:'1rem', xs:'.78rem'};
  const s = sizes[size] || '1rem';
  return [1,2,3,4,5].map(n => `<span style="color:${n<=Math.round(rating)?'#F59E0B':'#d1d5db'};font-size:${s}">★</span>`).join('');
}

function calcRatingStats(resenas) {
  if (!resenas.length) return { avg: 0, count: 0, dist: [0,0,0,0,0] };
  const dist = [0,0,0,0,0];
  resenas.forEach(r => { if(r.rating >= 1 && r.rating <= 5) dist[r.rating-1]++; });
  const avg = resenas.reduce((s,r) => s + r.rating, 0) / resenas.length;
  return { avg, count: resenas.length, dist };
}

// Función para leer desde Supabase
async function cargarResenas(provId) {
  const pid = String(provId);
  // Si ya las tenemos en cache, las devolvemos
  if (resenasCache[pid]) return resenasCache[pid];
  try {
    const { data, error } = await sb
      .from('resenas')
      .select('*')
      .eq('proveedor_id', pid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    resenasCache[pid] = (data || []).map(r => ({ ...r, autor: r.usuario_nombre, rating: r.estrellas, fecha: r.created_at }));
    return resenasCache[pid];
  } catch(e) {
    return [];
  }
}

// También expone rating para cards (sin await — usa cache o 0)
function getProvRating(provId) {
  const pid = String(provId);
  const cached = resenasCache[pid];
  if (!cached || !cached.length) return { avg: 0, count: 0, dist: [0,0,0,0,0] };
  return calcRatingStats(cached);
}

async function renderRatingSummary(provId) {
  const pid = String(provId);

  // Mostrar loading mientras carga
  const listEl = document.getElementById('det-resenas-list');
  if (listEl) listEl.innerHTML = '<p style="font-size:.82rem;color:var(--gray);text-align:center;padding:12px 0">Cargando reseñas...</p>';

  const resenas = await cargarResenas(pid);
  const { avg, count, dist } = calcRatingStats(resenas);

  // Avg
  const avgEl = document.getElementById('det-rating-avg');
  if (avgEl) avgEl.textContent = count > 0 ? avg.toFixed(1) : '—';

  // Stars
  const starsEl = document.getElementById('det-rating-stars');
  if (starsEl) starsEl.innerHTML = renderStarsHTML(avg, 'sm');

  // Count
  const countEl = document.getElementById('det-rating-count');
  if (countEl) countEl.textContent = count > 0 ? `${count} reseña${count!==1?'s':''}` : 'Sin reseñas aún';

  // Barras
  const barsEl = document.getElementById('det-rating-bars');
  if (barsEl) {
    barsEl.innerHTML = [5,4,3,2,1].map(n => {
      const c = dist[n-1];
      const pct = count > 0 ? Math.round((c/count)*100) : 0;
      return `<div class="rating-bar-row">
        <span class="rating-bar-label">${n}</span>
        <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
        <span class="rating-bar-count">${c}</span>
      </div>`;
    }).join('');
  }

  // Lista de reseñas
  if (listEl) {
    if (!resenas.length) {
      listEl.innerHTML = '<p style="font-size:.82rem;color:var(--gray);text-align:center;padding:8px 0">Sé el primero en dejar una reseña ✍️</p>';
    } else {
      listEl.innerHTML = resenas.slice(0,5).map(r => {
        const fechaStr = r.fecha ? timeAgo(new Date(r.fecha)) : 'Reciente';
        return `<div class="resena-card">
          <div class="resena-header">
            <div>
              <div class="resena-autor">${r.autor}</div>
              <div style="display:flex;gap:2px;margin-top:2px">${renderStarsHTML(r.rating,'xs')}</div>
            </div>
            <div class="resena-fecha">${fechaStr}</div>
          </div>
          <div class="resena-texto">${r.texto}</div>
        </div>`;
      }).join('');
    }
  }

  // Actualizar rating en cards si están visibles
  filterProvs();
}

let resenaRatingActual = 0;
function openResenaModal() {
  if (!provActual) return;
  resenaRatingActual = 0;
  document.getElementById('resena-prov-name').textContent = provActual.nombre;
  document.getElementById('resena-autor-input').value = currentUser ? currentUser.name : '';
  document.getElementById('resena-texto-input').value = '';
  document.getElementById('resena-rating-label').textContent = 'Tocá para calificar';
  document.querySelectorAll('#resenaStars .star').forEach(s => s.classList.remove('filled'));
  document.getElementById('resenaModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeResenaModal() {
  document.getElementById('resenaModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeResenaOnBg(e) { if (e.target === document.getElementById('resenaModal')) closeResenaModal(); }

function setResenaRating(val) {
  resenaRatingActual = val;
  const labels = ['','Muy malo 😕','Malo 😐','Regular 🙂','Bueno 😊','Excelente 🤩'];
  document.getElementById('resena-rating-label').textContent = labels[val] || '';
  document.querySelectorAll('#resenaStars .star').forEach(s => {
    s.classList.toggle('filled', parseInt(s.dataset.val) <= val);
  });
}

async function submitResena() {
  if (!resenaRatingActual) { showToast('Por favor calificá primero ⭐'); return; }
  const autor = document.getElementById('resena-autor-input').value.trim() || 'Anónimo';
  const texto = document.getElementById('resena-texto-input').value.trim();
  if (!texto) { showToast('Escribí tu experiencia'); return; }

  const pid = String(provActual.id);
  // Usamos los nombres de columna reales de tu tabla Supabase
  const nuevaResena = {
    proveedor_id:   pid,
    usuario_nombre: autor,
    estrellas:      resenaRatingActual,
    texto
  };

  // Guardar en Supabase
  try {
    const { data, error } = await sb.from('resenas').insert(nuevaResena).select().single();
    if (error) throw error;
    // Normalizar y agregar al cache
    if (!resenasCache[pid]) resenasCache[pid] = [];
    const normalizada = { ...data, autor: data.usuario_nombre, rating: data.estrellas, fecha: data.created_at };
    resenasCache[pid].unshift(normalizada);
    showToast('¡Reseña publicada! Gracias 🙌');
  } catch(e) {
    console.error('Error guardando reseña:', e);
    // Fallback local si falla Supabase
    if (!resenasCache[pid]) resenasCache[pid] = [];
    resenasCache[pid].unshift({ usuario_nombre: autor, autor, estrellas: resenaRatingActual, rating: resenaRatingActual, texto, fecha: new Date().toISOString() });
    showToast('Reseña guardada (sin conexión)');
  }

  closeResenaModal();
  renderRatingSummary(pid);
}

// ===== NOTIFICACIONES =====
let notificaciones = [];
let notifLeidas = new Set();
try { notifLeidas = new Set(JSON.parse(localStorage.getItem('eg_notif_leidas') || '[]')); } catch(e) {}

function initNotificaciones() {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  notificaciones = [
    { id:'n1', tipo:'new', icon:'🆕', titulo:'Nuevo proveedor: ' + (lista[0]?.nombre || 'TechMayor BA'), texto:'Se acaba de unir a EmprendeGo. ¡Mirá su catálogo!', tiempo:'Hace 5 min', provId: lista[0]?.id },
    { id:'n2', tipo:'tip', icon:'💡', titulo:'Tip del día', texto:'Los proveedores de Moda en Santa Fe tienen los mejores precios esta semana.', tiempo:'Hace 1 hora' },
    { id:'n3', tipo:'new', icon:'🆕', titulo:'Nuevo proveedor: ' + (lista[2]?.nombre || 'Modas del Litoral'), texto:'Nuevos modelos de temporada disponibles.', tiempo:'Hace 2 horas', provId: lista[2]?.id },
    { id:'n4', tipo:'promo', icon:'🔥', titulo:'Oferta limitada', texto:'3 proveedores de Bazar lanzaron precios especiales por fin de mes.', tiempo:'Hace 3 horas' },
    { id:'n5', tipo:'tip', icon:'💡', titulo:'Consejo', texto:'Usá el comparador para elegir mejor entre proveedores similares.', tiempo:'Ayer' }
  ];
  const tieneNoLeidas = notificaciones.some(n => !notifLeidas.has(n.id));
  document.getElementById('notifDot').classList.toggle('show', tieneNoLeidas);
  const d2 = document.getElementById('notifDot2');
  if (d2) d2.classList.toggle('show', tieneNoLeidas);
}

function renderNotifPanel() {
  const el = document.getElementById('notifList');
  if (!el) return;
  el.innerHTML = notificaciones.map(n => `
    <div class="notif-item ${notifLeidas.has(n.id) ? '' : 'unread'}" onclick="onNotifClick('${n.id}','${n.provId||''}')">
      <div class="notif-icon ${n.tipo}">${n.icon}</div>
      <div class="notif-text"><strong>${n.titulo}</strong><span>${n.texto}</span></div>
      <div class="notif-time">${n.tiempo}</div>
    </div>`).join('');
}
function onNotifClick(id, provId) {
  notifLeidas.add(id);
  try { localStorage.setItem('eg_notif_leidas', JSON.stringify([...notifLeidas])); } catch(e) {}
  document.getElementById('notifDot').classList.remove('show');
  const d2 = document.getElementById('notifDot2');
  if (d2) d2.classList.remove('show');
  closeNotifPanel();
  if (provId) { setTimeout(() => abrirDetalle(provId), 150); }
}
function toggleNotifPanel() {
  const p = document.getElementById('notifPanel');
  const bg = document.getElementById('notifPanelBg');
  if (p.style.display === 'none' || !p.style.display) {
    renderNotifPanel();
    p.style.display = 'block';
    bg.style.display = 'block';
  } else { closeNotifPanel(); }
}
function closeNotifPanel() {
  document.getElementById('notifPanel').style.display = 'none';
  document.getElementById('notifPanelBg').style.display = 'none';
}

// ===== COMPARADOR =====
let comparadorList = [];
function toggleComparar() {
  if (!provActual) return;
  const idx = comparadorList.findIndex(p => String(p.id) === String(provActual.id));
  if (idx >= 0) {
    comparadorList.splice(idx, 1);
    showToast('Quitado del comparador');
  } else {
    if (comparadorList.length >= 3) { showToast('Máximo 3 proveedores a la vez'); return; }
    comparadorList.push(provActual);
    showToast('Agregado al comparador ✓');
  }
  updateComparadorFab();
  updateDetCompBtn();
}
function updateComparadorFab() {
  const fab = document.getElementById('comparadorFab');
  const cnt = document.getElementById('comparadorCount');
  fab.classList.toggle('show', comparadorList.length >= 2);
  cnt.textContent = comparadorList.length;
}
function updateDetCompBtn() {
  const btn = document.getElementById('det-comp-btn');
  if (!btn || !provActual) return;
  const enComp = comparadorList.some(p => String(p.id) === String(provActual.id));
  btn.textContent = enComp ? '✓ En comparador' : '⚖ Comparar';
  btn.style.background = enComp ? 'rgba(0,166,81,.3)' : 'rgba(255,255,255,.15)';
}
function openComparador() {
  if (comparadorList.length < 2) { showToast('Agregá al menos 2 proveedores'); return; }
  renderComparadorModal();
  document.getElementById('comparadorModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeComparador() {
  document.getElementById('comparadorModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeComparadorOnBg(e) { if (e.target === document.getElementById('comparadorModal')) closeComparador(); }

function renderComparadorModal() {
  const el = document.getElementById('compModalBody');
  if (!el) return;
  const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED'];
  const campos = [
    { key:'rubro', label:'Rubro' },
    { key:'provincia', label:'Provincia' },
    { key:'pedido_minimo', label:'Pedido mínimo' },
    { key:'envios', label:'Envíos' },
    { key:'pro', label:'Plan' },
    { key:'_rating', label:'Rating' }
  ];

  // Headers
  let thead = '<thead><tr><th style="width:90px">Atributo</th>';
  comparadorList.forEach((p,i) => {
    const ini = (p.inicial || p.nombre.substring(0,2)).toUpperCase();
    thead += `<th><div class="comp-header-cell">
      <div class="comp-header-ini" style="background:${bgs[i]}">${ini}</div>
      <div class="comp-header-name">${p.nombre}</div>
      ${p.pro ? '<span style="font-size:.62rem;font-weight:800;background:linear-gradient(90deg,#1847C8,#7C3AED);color:white;padding:2px 7px;border-radius:10px">PRO</span>' : ''}
    </div></th>`;
  });
  thead += '</tr></thead>';

  // Rows
  let tbody = '<tbody>';
  campos.forEach(c => {
    tbody += `<tr><td>${c.label}</td>`;
    comparadorList.forEach(p => {
      let val = '';
      if (c.key === '_rating') {
        const { avg, count } = getProvRating(p.id);
        val = count > 0 ? `${avg.toFixed(1)} ★ (${count})` : 'Sin reseñas';
      } else if (c.key === 'pro') {
        val = p.pro ? '⭐ PRO' : 'Gratis';
      } else {
        val = p[c.key] || '—';
      }
      tbody += `<td>${val}</td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  el.innerHTML = `
    <div style="overflow-x:auto;margin-bottom:20px">
      <table class="comp-table">${thead}${tbody}</table>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${comparadorList.map(p => `
        <button onclick="closeComparador();abrirDetalle('${p.id}')" style="background:var(--blue-light);color:var(--blue);border:none;border-radius:12px;padding:12px;font-family:'Sora',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer">
          Ver perfil de ${p.nombre} →
        </button>`).join('')}
      <button onclick="comparadorList=[];updateComparadorFab();closeComparador();showToast('Comparador limpiado')" style="background:#fee2e2;color:#ef4444;border:none;border-radius:12px;padding:10px;font-family:'Sora',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;margin-top:4px">
        Limpiar comparador
      </button>
    </div>`;
}

// ===== MAPA PROVINCIAS =====
const provinciaEmojis = {
  'Buenos Aires':'🌆','CABA':'🏙️','Cordoba':'🏛️','Santa Fe':'🌾',
  'Mendoza':'🍇','Otra':'📍'
};

function getProvsPorProvincia() {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const mapa = {};
  lista.forEach(p => {
    const prov = p.provincia || 'Otra';
    if (!mapa[prov]) mapa[prov] = [];
    mapa[prov].push(p);
  });
  return mapa;
}

function renderMapaProvincias() {
  const el = document.getElementById('provinciasGrid');
  if (!el) return;
  const mapa = getProvsPorProvincia();
  const total = Object.values(mapa).reduce((s,a) => s+a.length, 0);
  const provincias = Object.keys(mapa).sort((a,b) => mapa[b].length - mapa[a].length);
  el.innerHTML = provincias.map(prov => {
    const count = mapa[prov].length;
    const pct = Math.round((count/total)*100);
    const emoji = provinciaEmojis[prov] || '📍';
    return `<div class="prov-tile" data-prov="${prov}" onclick="filtrarPorProvincia('${prov}')">
      <div style="position:relative;z-index:1">
        <div style="font-size:1.1rem;margin-bottom:3px">${emoji}</div>
        <div class="prov-tile-name">${prov}</div>
        <div class="prov-tile-count">${count} proveedor${count!==1?'es':''}</div>
      </div>
      <div class="prov-tile-bar" style="width:${pct}%"></div>
    </div>`;
  }).join('');
}

function renderMapaAllProvs() {
  const el = document.getElementById('mapaAllList');
  if (!el) return;
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  el.innerHTML = lista.slice(0,6).map((p,i) => renderProvCardMini(p,i)).join('');
  el.onclick = function(e) {
    const card = e.target.closest('[data-id]');
    if (card) abrirDetalle(card.dataset.id);
  };
}

function filtrarPorProvincia(prov) {
  document.querySelectorAll('.prov-tile').forEach(t => t.classList.toggle('selected', t.dataset.prov === prov));
  const mapa = getProvsPorProvincia();
  const lista = mapa[prov] || [];
  document.getElementById('mapaResultados').style.display = 'block';
  document.getElementById('mapaAllProvs').style.display = 'none';
  document.getElementById('mapaResultLabel').textContent = `${lista.length} en ${prov}`;
  const el = document.getElementById('mapaProvList');
  el.innerHTML = lista.map((p,i) => renderProvCardMini(p,i)).join('');
  el.onclick = function(e) {
    const card = e.target.closest('[data-id]');
    if (card) abrirDetalle(card.dataset.id);
  };
}

function clearMapaFilter() {
  document.querySelectorAll('.prov-tile').forEach(t => t.classList.remove('selected'));
  document.getElementById('mapaResultados').style.display = 'none';
  document.getElementById('mapaAllProvs').style.display = 'block';
}

function renderProvCardMini(p, i) {
  const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
  const bg = bgs[i % bgs.length];
  const ini = (p.inicial || p.nombre.substring(0,2)).toUpperCase();
  const { avg, count } = getProvRating(p.id);
  return `<div data-id="${p.id}" style="background:white;border-radius:14px;border:1px solid var(--border);padding:13px;cursor:pointer;display:flex;align-items:center;gap:12px">
    <div style="width:42px;height:42px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.95rem;color:white;font-family:'Sora',sans-serif;flex-shrink:0">${ini}</div>
    <div style="flex:1;min-width:0">
      <div style="font-family:'Sora',sans-serif;font-size:.88rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nombre}</div>
      <div style="font-size:.73rem;color:var(--gray)">${p.rubro}${p.provincia ? ' · ' + p.provincia : ''}</div>
      ${count > 0 ? `<div style="font-size:.7rem;color:var(--yellow);margin-top:2px;font-weight:700">${avg.toFixed(1)} ★ · ${count} reseña${count!==1?'s':''}</div>` : ''}
    </div>
    ${p.pro ? '<span style="font-size:.62rem;font-weight:800;background:linear-gradient(90deg,#1847C8,#7C3AED);color:white;padding:3px 8px;border-radius:10px;flex-shrink:0">PRO</span>' : ''}
  </div>`;
}

// ===== RENDER PROVEEDORES =====
function renderProvs(list) {
  const el = document.getElementById('provList');
  if (!list || !list.length) {
    el.innerHTML = '<p style="color:var(--gray);text-align:center;padding:30px 0">No se encontraron proveedores</p>';
    return;
  }
  const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
  el.innerHTML = list.map((p, i) => {
    const pid = String(p.id);
    const fav = esFav(pid);
    const bg = bgs[i % bgs.length];
    const ini = (p.inicial || p.nombre.substring(0,2)).toUpperCase();
    const { avg, count } = getProvRating(pid);
    const enComp = comparadorList.some(x => String(x.id) === pid);
    return `<div data-id="${pid}" style="background:white;border-radius:16px;border:1px solid #E2E8F8;margin-bottom:4px;overflow:hidden;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px;padding:12px 14px 8px">
        ${p.logo_url
          ? `<div style="width:44px;height:44px;border-radius:11px;overflow:hidden;flex-shrink:0"><img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover"></div>`
          : `<div style="width:44px;height:44px;border-radius:11px;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;color:white;flex-shrink:0;font-family:'Sora',sans-serif">${ini}</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-family:'Sora',sans-serif;font-size:.93rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
          <div style="font-size:.75rem;color:#6B7A99;margin-top:2px">${p.rubro || 'General'}${p.provincia ? ' · ' + p.provincia : ''}</div>
        </div>
        ${count > 0 ? `<div style="font-size:.75rem;font-weight:700;color:#F59E0B;flex-shrink:0">${avg.toFixed(1)} ★</div>` : ''}
      </div>
      <div style="padding:0 14px 13px">
        <p style="font-size:.79rem;color:#6B7A99;line-height:1.45;margin-bottom:9px">${p.desc || ''}</p>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
          <span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:#EEF2FF;color:#1847C8">${p.rubro || 'General'}</span>
          ${p.pro ? '<span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:linear-gradient(90deg,#1847C8,#7C3AED);color:white">PRO</span>' : ''}
          <span style="font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:20px;background:#E6F7EE;color:#00A651">✓ Verificado</span>
        </div>
        <div class="prov-card-actions">
          ${p.pro
            ? `<button data-wa="${p.whatsapp||''}" style="background:#25d366;color:white;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer">💬 WhatsApp</button>`
            : `<button data-chatid="${pid}" style="background:#EEF2FF;color:#1847C8;border:none;border-radius:9px;padding:7px 14px;font-size:.76rem;font-weight:700;cursor:pointer">💬 Chat</button>`}
          <button data-favid="${pid}" style="background:#f4f7ff;border:none;border-radius:9px;padding:7px 10px;cursor:pointer;font-size:.95rem;flex-shrink:0">${fav ? '❤️' : '♡'}</button>
          <button data-compid="${pid}" class="comparar-btn ${enComp ? 'added' : ''}" style="padding:7px 10px;font-size:.72rem">${enComp ? '✓' : '⚖'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  el.onclick = function(e) {
    const fb   = e.target.closest('[data-favid]');
    const wb   = e.target.closest('[data-wa]');
    const cb   = e.target.closest('[data-chatid]');
    const compb= e.target.closest('[data-compid]');
    const card = e.target.closest('[data-id]');
    if (fb)    { e.stopPropagation(); toggleFav(fb.dataset.favid); return; }
    if (wb)    { e.stopPropagation(); abrirWA(wb.dataset.wa); return; }
    if (cb)    { e.stopPropagation(); abrirChatDirecto(cb.dataset.chatid); return; }
    if (compb) { e.stopPropagation(); toggleCompararById(compb.dataset.compid); return; }
    if (card)  abrirDetalle(card.dataset.id);
  };
}

function toggleCompararById(id) {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  const idx = comparadorList.findIndex(x => String(x.id) === String(id));
  if (idx >= 0) { comparadorList.splice(idx, 1); showToast('Quitado del comparador'); }
  else {
    if (comparadorList.length >= 3) { showToast('Máximo 3 proveedores'); return; }
    comparadorList.push(p); showToast('Agregado al comparador ⚖');
  }
  updateComparadorFab();
  filterProvs();
}

function filterProvs() {
  const q    = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const prov = document.getElementById('fil-prov')?.value || '';
  const plan = document.getElementById('fil-plan')?.value || '';
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  renderProvs(lista.filter(p => {
    const mc  = currentCat === 'Todas' || p.rubro === currentCat;
    const mq  = !q    || p.nombre.toLowerCase().includes(q) || (p.rubro||'').toLowerCase().includes(q);
    const mp  = !prov || p.provincia === prov;
    const mpl = !plan || (plan === 'pro' ? p.pro : !p.pro);
    return mc && mq && mp && mpl;
  }));
}

function setChip(el, cat) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentCat = cat;
  if (buscarTab === 'productos') renderProdBuscar(currentCat, document.getElementById('searchInput')?.value || '');
  else filterProvs();
}

function filterCat(cat) {
  goTo('buscar');
  currentCat = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.textContent.trim() === cat));
  switchBuscarTab('proveedores', document.getElementById('tab-proveedores'));
  filterProvs();
}

function abrirWA(num) {
  const n = (num || '').replace(/[^0-9]/g, '');
  if (n) window.open('https://wa.me/' + n, '_blank');
  else showToast('WhatsApp no disponible');
}

async function cargarProductosDetalle(proveedorId) {
  const el = document.getElementById('det-productos-grid');
  if (!el) return;
  el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">Cargando productos...</div>';
  try {
    const { data, error } = await sb.from('productos').select('*').eq('proveedor_id', proveedorId).order('created_at', {ascending:false});
    if (error || !data || !data.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">Este proveedor todavia no cargo productos.</div>';
      return;
    }
    const iconM = {'Tecnologia':'📱','Tecnología':'📱','Moda':'👗','Hogar':'🏠','Bazar':'🛒','Alimentos':'🍫','Otro':'📦'};
    const bgsColores = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
    // Agregar productos al listado global para que sean clickeables
    data.forEach((p, i) => {
      const existente = productosReales.find(x => x.idReal == p.id);
      if (!existente) {
        productosReales.push({
          id: 'real_' + p.id,
          idReal: p.id,
          nombre: p.nombre,
          precio: p.precio || 0,
          pedido_minimo: p.stock ? 'Stock: ' + p.stock + ' unidades' : 'Consultar',
          cat: p.categoria || 'General',
          emoji: getEmojiCat(p.categoria),
          provId: String(p.proveedor_id),
          provNombre: provActual?.nombre || 'Proveedor',
          provRubro: (provActual?.rubro || '') + (provActual?.provincia ? ' · ' + provActual.provincia : ''),
          provColor: bgsColores[i % bgsColores.length],
          imgUrl: p.imagen_url || '',
          whatsapp: provActual?.whatsapp || '',
          esPro: provActual?.pro || false
        });
      }
    });
    el.innerHTML = data.map((p, i) => {
      const prodId = 'real_' + p.id;
      const img = p.imagen_url
        ? `<img src="${p.imagen_url}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
        : (iconM[p.categoria] || '📦');
      return `
      <div onclick="abrirDetalleProd('${prodId}')" style="background:white;border-radius:12px;overflow:hidden;border:1px solid var(--border);cursor:pointer;transition:transform .15s;active:transform:scale(.97)">
        <div style="width:100%;height:80px;background:${bgsColores[i%bgsColores.length]}18;display:flex;align-items:center;justify-content:center;font-size:1.8rem;overflow:hidden;position:relative">${img}</div>
        <div style="padding:8px 10px 10px">
          <div style="font-family:'Sora',sans-serif;font-size:.82rem;font-weight:800;color:var(--navy);margin-bottom:3px;line-height:1.3">${p.nombre}</div>
          <div style="font-size:.95rem;font-weight:900;color:var(--blue)">$${Number(p.precio||0).toLocaleString('es-AR')}</div>
          <div style="font-size:.68rem;color:var(--gray);margin-top:2px">${p.stock ? 'Stock: '+p.stock : 'Consultar stock'}</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--gray);font-size:.82rem">No se pudieron cargar los productos.</div>';
  }
}

// ===== DETALLE PROVEEDOR =====
function abrirDetalle(id) {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  provActual = p;
  const active = document.querySelector('.screen.active');
  pantallaAnterior = active ? active.id.replace('screen-', '') : 'buscar';
  addToHistorial(p);

  const detLogoEl = document.getElementById('det-logo');
  const detIni = (p.inicial||p.nombre.substring(0,2)).toUpperCase();
  if (p.logo_url) {
    detLogoEl.innerHTML = `<img src="${p.logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:14px">`;
  } else {
    detLogoEl.textContent = detIni;
  }
  document.getElementById('det-nombre').textContent   = p.nombre;
  document.getElementById('det-rubro').textContent    = (p.rubro || 'General') + (p.provincia ? ' · ' + p.provincia : '');
  document.getElementById('det-desc').textContent     = p.desc || p.descripcion || 'Sin descripcion.';
  document.getElementById('det-minimo').textContent   = p.pedido_minimo || 'Sin minimo';
  document.getElementById('det-envios').textContent   = p.envios || 'Consultar';
  document.getElementById('det-provincia').textContent = p.provincia || '-';
  document.getElementById('det-instagram').textContent = p.instagram || '-';
  document.getElementById('det-pro-badge').style.display = p.pro ? 'inline-flex' : 'none';
  document.getElementById('det-fav-btn').textContent  = esFav(p.id) ? '❤️' : '♡';
  document.getElementById('det-wa-btn').style.display = (p.pro && p.whatsapp) ? 'flex' : 'none';

  // Reset calc
  ['calc-costo','calc-venta','calc-cantidad'].forEach(id => { const e = document.getElementById(id); if(e) e.value=''; });
  const cr = document.getElementById('calc-result');
  if (cr) cr.style.display = 'none';

  // Rating (async — carga desde Supabase)
  renderRatingSummary(p.id);

  // Comp button
  updateDetCompBtn();

  try { sb.from('busquedas').insert({termino: p.nombre}); } catch(e) {}
  cargarProductosDetalle(p.id);
  goTo('detalle');
}

function volverDetalle() { goTo(pantallaAnterior); }
function detWA() { if (provActual && provActual.whatsapp) abrirWA(provActual.whatsapp); else showToast('WhatsApp no disponible'); }
function detChat() { if (provActual) abrirChatDirecto(provActual.id); }

// ===== CALCULADORA =====
function calcGanancia() {
  const costo = parseFloat(document.getElementById('calc-costo').value);
  const venta = parseFloat(document.getElementById('calc-venta').value);
  const cantidad = parseFloat(document.getElementById('calc-cantidad').value);
  const resEl = document.getElementById('calc-result');
  if (!costo || !venta || !cantidad || costo<=0 || venta<=0 || cantidad<=0) { if(resEl) resEl.style.display='none'; return; }
  const inv = costo*cantidad, tot = venta*cantidad, gan = tot-inv;
  const mrg = ((gan/inv)*100).toFixed(0);
  document.getElementById('calc-inv').textContent = '$'+inv.toLocaleString('es-AR');
  document.getElementById('calc-gan').textContent = '$'+gan.toLocaleString('es-AR');
  document.getElementById('calc-mrg').textContent = mrg+'%';
  document.getElementById('calc-tot').textContent = '$'+tot.toLocaleString('es-AR');
  if(resEl) resEl.style.display='grid';
}

// ===== CHAT =====
async function abrirChatDirecto(id) {
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const p = lista.find(x => String(x.id) === String(id));
  if (!p) return;
  provActual = p;
  const active = document.querySelector('.screen.active');
  pantallaAnterior = active ? active.id.replace('screen-', '') : 'buscar';
  document.getElementById('chat-nombre').textContent = p.nombre;
  document.getElementById('chat-rubro').textContent  = p.rubro || 'Proveedor';

  // Mensaje inicial de bienvenida (solo si no hay historial)
  chatMsgs = [{ tipo:'recv', texto:'Hola! Soy '+p.nombre+'. En que te puedo ayudar?', hora:'', nombre: p.nombre }];
  renderChat();
  goTo('chat');

  // Cargar historial real desde Supabase
  try {
    const { data } = await sb.from('mensajes')
      .select('*')
      .eq('proveedor_id', p.id)
      .order('created_at', { ascending: true });
    if (data && data.length) {
      // Filtrar solo mensajes del proveedor + mensajes del usuario actual
      // Mostrar todos los mensajes: los del usuario (de_nombre) + los del proveedor (de_tipo)
      const misMsgs = data.filter(m =>
        m.de_tipo === 'proveedor' ||
        m.de_nombre === currentUser?.name ||
        m.usuario_email === currentUser?.email
      );
      if (misMsgs.length) {
        chatMsgs = misMsgs.map(m => ({
          tipo:   m.de_tipo === 'proveedor' ? 'recv' : 'sent',
          texto:  m.texto,
          hora:   m.created_at ? timeAgo(new Date(m.created_at)) : '',
          dbId:   m.id,
          nombre: m.de_tipo === 'proveedor' ? p.nombre : null
        }));
        renderChat();
      } else if (data.length) {
        // Fallback: mostrar todos si no podemos filtrar
        chatMsgs = data.map(m => ({
          tipo:   m.de_tipo === 'proveedor' ? 'recv' : 'sent',
          texto:  m.texto,
          hora:   m.created_at ? timeAgo(new Date(m.created_at)) : '',
          dbId:   m.id,
          nombre: m.de_tipo === 'proveedor' ? p.nombre : null
        }));
        renderChat();
      }
    }
  } catch(e) {}

  iniciarChatPolling(p.id);
}
function volverChat() { detenerChatPolling(); goTo(pantallaAnterior); }
function getHora() { return new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}); }
function renderChat() {
  const el = document.getElementById('chat-msgs');
  if (!el) return;
  el.innerHTML = chatMsgs.map(m => {
    const nombre = m.tipo === 'recv' && m.nombre ? '<div style="font-size:.68rem;font-weight:700;color:var(--blue);margin-bottom:3px">' + m.nombre + '</div>' : '';
    return '<div style="display:flex;flex-direction:column;align-items:' + (m.tipo === 'sent' ? 'flex-end' : 'flex-start') + '">' + nombre + '<div class="chat-msg ' + m.tipo + '">' + (m.texto||'').replace(/\n/g,'<br>') + '<div class="chat-msg-time">' + m.hora + '</div></div></div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
let chatPollingInterval = null;

function iniciarChatPolling(provId) {
  if (chatPollingInterval) clearInterval(chatPollingInterval);
  chatPollingInterval = setInterval(async () => {
    if (!provActual) return;
    try {
      const { data } = await sb.from('mensajes')
        .select('*')
        .eq('proveedor_id', provId)
        .eq('de_tipo', 'proveedor')
        .order('created_at', { ascending: true });
      if (!data || !data.length) return;
      // Ver si hay mensajes nuevos del proveedor
      const hayNuevos = data.some(m => {
        const yaEsta = chatMsgs.some(cm => cm.dbId === m.id);
        return !yaEsta;
      });
      if (hayNuevos) {
        // Recargar todos los mensajes de la conversación
        const { data: todos } = await sb.from('mensajes')
          .select('*')
          .eq('proveedor_id', provId)
          .order('created_at', { ascending: true });
        if (todos) {
          chatMsgs = todos.map(m => ({
            tipo: m.de_tipo === 'proveedor' ? 'recv' : 'sent',
            texto: m.texto,
            hora: timeAgo(new Date(m.created_at)),
            dbId: m.id,
            nombre: m.de_tipo === 'proveedor' ? (provActual?.nombre || 'Proveedor') : null
          }));
          renderChat();
        }
      }
    } catch(e) {}
  }, 8000); // cada 8 segundos
}

function detenerChatPolling() {
  if (chatPollingInterval) { clearInterval(chatPollingInterval); chatPollingInterval = null; }
}

async function sendMsg() {
  const inp = document.getElementById('chat-inp');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  chatMsgs.push({tipo:'sent',texto:txt,hora:getHora()});
  renderChat();

  // Guardar en Supabase
  if (provActual) {
    try {
      await sb.from('mensajes').insert({
        proveedor_id: provActual.id,
        de_tipo: 'usuario',
        de_nombre: currentUser ? currentUser.name : 'Anónimo',
        usuario_email: currentUser ? currentUser.email : null,
        texto: txt,
        leido: false
      });
    } catch(e) {}
  }

  // Respuesta automática inteligente (hasta que el proveedor tenga panel de chat real)
  const t = txt.toLowerCase();
  let resp = '✅ Recibimos tu mensaje. Te respondemos a la brevedad por este chat o por WhatsApp.';
  if (t.includes('precio')||t.includes('cuanto')||t.includes('costo')) {
    resp = '💰 Los precios dependen del volumen. ¿Cuántas unidades necesitás? Te paso la lista.';
  } else if (t.includes('envio')||t.includes('manda')||t.includes('despacho')) {
    resp = '🚚 Sí, enviamos a todo el país por Andreani y OCA. El costo de envío lo acordamos al confirmar el pedido.';
  } else if (t.includes('minimo')||t.includes('cantidad')) {
    resp = '📦 El pedido mínimo lo podés ver en nuestro perfil. Podés combinar productos para llegar al mínimo.';
  } else if (t.includes('hola')||t.includes('buenas')||t.includes('buen dia')) {
    resp = '👋 ¡Hola! Bienvenido/a. ¿En qué te puedo ayudar hoy?';
  } else if (t.includes('gracias')||t.includes('ok')||t.includes('dale')) {
    resp = '😊 ¡De nada! Cualquier consulta no dudes en escribirme.';
  } else if (t.includes('pedido')||t.includes('comprar')||t.includes('quiero')) {
    resp = '🛒 ¡Genial! Contame qué productos te interesan y en qué cantidad para prepararte una cotización.';
  } else if (t.includes('whatsapp')||t.includes('llamar')||t.includes('telefono')) {
    resp = provActual?.pro && provActual?.whatsapp 
      ? `📲 Podés escribirnos directo al WhatsApp desde nuestro perfil.`
      : '📲 Por este chat podemos coordinar todo. ¿Qué necesitás?';
  }

  setTimeout(() => {
    chatMsgs.push({tipo:'recv',texto:resp,hora:getHora()});
    renderChat();
  }, 1000);
}

// ===== AUTH =====
async function simulateGoogleLogin() {
  try {
    const { data, error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin } });
    if (error) throw error;
  } catch(e) { showToast('Error al iniciar sesion. Intenta de nuevo.'); }
}
async function checkSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      const user = session.user;
      const name = user.user_metadata?.full_name || user.email.split('@')[0];
      const email = user.email;
      const picture = user.user_metadata?.avatar_url || '';
      const { data: provList } = await sb.from('proveedores').select('id,nombre,plan,rubro,provincia,descripcion,whatsapp,instagram,pedido_minimo,envios,estado,email').eq('email', email.toLowerCase().trim());
      const prov = provList && provList.length > 0 ? provList[0] : null;
      if (prov && prov.estado === 'aprobado') {
        handleLogin({name:prov.nombre||name,email,picture,type:'proveedor',proveedorId:prov.id,provData:prov});
      } else {
        handleLogin({name,email,picture,type:'user'});
      }
    }
  } catch(e) {}
}
function handleLogin(user) { currentUser = user; updatePerfilUI(); updateTopbar(); }
function logout() {
  currentUser = null; historial = [];
  document.getElementById('perfil-login').style.display = 'block';
  document.getElementById('perfil-user').style.display = 'none';
  document.getElementById('perfil-proveedor').style.display = 'none';
  updateTopbar(); showToast('Sesion cerrada');
}
function updateTopbar() {
  const btn = document.getElementById('topbar-login-btn');
  if (btn) btn.textContent = currentUser ? currentUser.name.split(' ')[0] : '→ Ingresar';
}
function updatePerfilUI() {
  if (!currentUser) return;
  document.getElementById('perfil-login').style.display = 'none';
  if (currentUser.type === 'proveedor') {
    document.getElementById('perfil-user').style.display = 'none';
    document.getElementById('perfil-proveedor').style.display = 'block';
    document.getElementById('dash-nombre').textContent = currentUser.name;
    document.getElementById('dash-avatar-initials').textContent = currentUser.name.substring(0,2).toUpperCase();
    if (currentUser.provData) {
      const pd = currentUser.provData;
      const rl = document.getElementById('dash-rubro-label');
      if (rl) rl.textContent = (pd.rubro||'Rubro') + ' · ' + (pd.provincia||'Argentina');
      const en = document.getElementById('edit-nombre'); if(en) en.value = pd.nombre||'';
      const ed = document.getElementById('edit-desc'); if(ed) ed.value = pd.descripcion||'';
    }
    cargarProductosProveedor();
    cargarLogoProveedor();
  } else {
    document.getElementById('perfil-user').style.display = 'block';
    document.getElementById('perfil-proveedor').style.display = 'none';
    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-email').textContent = currentUser.email;
    document.getElementById('user-avatar-placeholder').textContent = currentUser.name.substring(0,1).toUpperCase();
    if (currentUser.picture) {
      const img = document.getElementById('user-avatar-img');
      img.src = currentUser.picture; img.style.display = 'block';
      document.getElementById('user-avatar-placeholder').style.display = 'none';
    }
    cargarAvatarUsuario();
    cargarHistorial();
  }
}

// ===== HISTORIAL =====
async function addToHistorial(proveedor) {
  if (!currentUser || currentUser.type !== 'user') return;
  historial = historial.filter(h => h.id !== proveedor.id);
  historial.unshift({...proveedor, visitedAt: new Date()});
  if (historial.length > 10) historial = historial.slice(0,10);
}
async function cargarHistorial() {
  const el = document.getElementById('historialList');
  if (!historial.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">🔍</div><p>Todavía no exploraste proveedores.<br>¡Empezá a buscar!</p></div>';
  } else {
    el.innerHTML = historial.map(p => `
      <div class="hist-item" onclick="abrirDetalle('${p.id}')">
        <div class="hist-logo">${(p.inicial||p.nombre.substring(0,2)).toUpperCase()}</div>
        <div class="hist-info"><strong>${p.nombre}</strong><span>${p.rubro||''}${p.pro?' · PRO':''}</span></div>
        <span class="hist-time">${timeAgo(p.visitedAt)}</span>
      </div>`).join('');
  }
  // Cargar conversaciones reales desde Supabase
  await cargarMisConversaciones();
}

async function cargarMisConversaciones() {
  const el = document.getElementById('mis-conversaciones-list');
  if (!el || !currentUser) return;
  try {
    // Paso 1: traer todos los proveedor_id donde el usuario envió mensajes
    const { data: misEnvios } = await sb.from('mensajes')
      .select('proveedor_id')
      .eq('de_tipo', 'usuario')
      .eq('de_nombre', currentUser.name);

    const provIds = [...new Set((misEnvios||[]).map(m => m.proveedor_id).filter(Boolean))];
    if (!provIds.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    // Paso 2: traer nombre del proveedor por separado (sin join, por diferencia de tipos)
    const provNombres = {};
    const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
    provIds.forEach(pid => {
      const prov = lista.find(p => String(p.id) === String(pid));
      provNombres[pid] = prov ? prov.nombre : 'Proveedor';
    });

    // Paso 3: traer TODOS los mensajes de esas conversaciones
    const { data: todosLosMsgs } = await sb.from('mensajes')
      .select('proveedor_id, texto, created_at, de_tipo, leido')
      .in('proveedor_id', provIds)
      .order('created_at', { ascending: false });

    if (!todosLosMsgs || !todosLosMsgs.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    // Agrupar por proveedor_id
    const convMap = {};
    todosLosMsgs.forEach(m => {
      const pid = m.proveedor_id;
      if (!pid) return;
      if (!convMap[pid]) {
        convMap[pid] = {
          provId: pid,
          provNombre: provNombres[pid] || 'Proveedor',
          ultimoMsg: m.texto,
          ultimaFecha: m.created_at,
          noLeidos: 0
        };
      }
      if (new Date(m.created_at) > new Date(convMap[pid].ultimaFecha)) {
        convMap[pid].ultimoMsg = m.texto;
        convMap[pid].ultimaFecha = m.created_at;
      }
      if (m.de_tipo === 'proveedor' && !m.leido) convMap[pid].noLeidos++;
    });

    const convs = Object.values(convMap).slice(0, 8);
    if (!convs.length) {
      el.innerHTML = '<div class="empty-state"><div class="ei">💬</div><p style="font-size:.85rem">Todavía no hablaste con ningún proveedor.</p></div>';
      return;
    }

    const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
    el.innerHTML = convs.map((c, i) => {
      const ini = c.provNombre.substring(0,2).toUpperCase();
      const preview = (c.ultimoMsg||'').split(String.fromCharCode(10)).join(' ').substring(0,45) + ((c.ultimoMsg||'').length > 45 ? '...' : '');
      return `<div class="hist-item" onclick="abrirChatDirecto('${c.provId}')" style="position:relative">` +
        `<div class="hist-logo" style="background:${bgs[i%bgs.length]};color:white">${ini}</div>` +
        `<div class="hist-info"><strong>${c.provNombre}</strong><span>${preview}</span></div>` +
        `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">` +
        `<span class="hist-time">${timeAgo(new Date(c.ultimaFecha))}</span>` +
        (c.noLeidos > 0 ? `<span style="background:var(--blue);color:white;font-size:.62rem;font-weight:800;padding:2px 6px;border-radius:10px">${c.noLeidos}</span>` : '') +
        '</div></div>';
    }).join('');
  } catch(e) {
    console.error('Error cargando conversaciones:', e);
  }
}
function timeAgo(date) {
  const mins = Math.floor((new Date()-date)/60000);
  if (mins<1) return 'Ahora'; if (mins<60) return `${mins}m`; if (mins<1440) return `${Math.floor(mins/60)}h`;
  return `${Math.floor(mins/1440)}d`;
}

// ===== CATALOGO PROVEEDOR =====
const iconMap = {'Tecnologia':'💻','Tecnología':'💻','Hogar':'🏠','Moda':'👗','Bazar':'🛒','Alimentos':'🍫'};
function renderProdGrid() {
  const el = document.getElementById('prodGrid');
  if (!el) return;
  if (!productos.length) { el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--gray)"><div style="font-size:2rem;margin-bottom:8px">📦</div><p style="font-size:.88rem">No tenes productos aun.</p></div>'; return; }
  el.innerHTML = productos.map(p => `
    <div class="prod-card">
      <div class="prod-img">${iconMap[p.categoria||p.cat]||'📦'}</div>
      <div class="prod-body">
        <h4>${p.nombre}</h4>
        <div class="price">$${(p.precio||0).toLocaleString('es-AR')}</div>
        <div class="stock">Stock: ${p.stock||'S/D'}</div>
        <div class="prod-actions">
          <button class="prod-edit-btn" onclick="editarProducto('${p.id}','${(p.nombre||'').replace(/'/g,'')}',${p.precio||0},'${p.stock||0}','${p.categoria||p.cat||''}')">Editar</button>
          <button class="prod-del-btn" onclick="deleteProduct('${p.id}')">Eliminar</button>
        </div>
      </div>
    </div>`).join('');
}
async function cargarProductosProveedor() {
  if (!currentUser || !currentUser.proveedorId) { productos = []; renderProdGrid(); return; }
  try {
    const { data } = await sb.from('productos').select('*').eq('proveedor_id', currentUser.proveedorId).order('created_at',{ascending:false});
    productos = data || [];
  } catch(e) { productos = []; }
  renderProdGrid();
}
async function deleteProduct(id) {
  try { await sb.from('productos').delete().eq('id', id); } catch(e) {}
  productos = productos.filter(p => String(p.id) !== String(id));
  renderProdGrid(); showToast('Producto eliminado');
}
// ===== FOTO UPLOAD =====
let fotoFile = null;

function previewFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('La foto es muy grande. Máx 5MB'); return; }
  fotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('foto-preview-img');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('foto-placeholder').style.display = 'none';
    document.getElementById('foto-remove-btn').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeFoto() {
  fotoFile = null;
  document.getElementById('foto-preview-img').style.display = 'none';
  document.getElementById('foto-preview-img').src = '';
  document.getElementById('foto-placeholder').style.display = 'block';
  document.getElementById('foto-remove-btn').style.display = 'none';
  document.getElementById('foto-input').value = '';
}

async function subirFotoStorage(file, provId) {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${provId}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('productos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: urlData } = sb.storage.from('productos').getPublicUrl(path);
  return urlData.publicUrl;
}

// ===== TABS MODAL ===
function switchAddTab(tab) {
  // Ocultar todos los paneles
  ['uno','ml','multi'].forEach(t => {
    const panel = document.getElementById('add-tab-' + t);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) {
      if (t === tab) {
        btn.style.background = 'white';
        btn.style.color = 'var(--blue)';
        btn.style.borderRadius = '10px';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--gray)';
      }
    }
  });
}

// ===== MERCADOLIBRE IMPORT =====
let mlProductoImportado = null;
let mlImportadosCount = 0;

function extraerMLId(url) {
  // 1. Prioridad: item_id en query params (?pdp_filters=item_id:MLA1576860927)
  const qMatch = url.match(/item_id[=:](MLA\d+)/i);
  if (qMatch) return qMatch[1].replace('MLA','');
  // 2. MLA directo en la URL
  const directMatch = url.match(/MLA-(\d{7,12})/i) || url.match(/MLA(\d{8,12})/i);
  if (directMatch) return directMatch[1];
  return null;
}

async function importarDesdeML() {
  const url = document.getElementById('ml-url-input').value.trim();
  if (!url) { showToast('Pegá el link de MercadoLibre'); return; }

  const itemId = extraerMLId(url);
  if (!itemId) { showToast('Link inválido. Copiá la URL completa de ML'); return; }

  const btn = document.getElementById('ml-import-btn-text');
  btn.textContent = '⏳ Buscando producto...';

  try {
    // Usamos nuestra propia función Vercel — sin problemas de CORS
    const r = await fetch('/api/ml?id=' + itemId, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('Error en la función');
    const data = await r.json();
    if (!data || !data.title) throw new Error('Sin datos');


    mlProductoImportado = {
      nombre:   data.title,
      precio:   data.price,
      foto:     data.thumbnail?.replace('-I.jpg', '-O.jpg') || data.pictures?.[0]?.url || '',
      desc:     data.subtitle || '',
      cat:      'General'
    };

    // Mostrar preview
    document.getElementById('ml-preview-name').textContent  = data.title;
    document.getElementById('ml-preview-price').textContent = '$' + Number(data.price).toLocaleString('es-AR');
    const imgEl = document.getElementById('ml-preview-img');
    imgEl.src = mlProductoImportado.foto;
    imgEl.onerror = () => { imgEl.style.display = 'none'; };

    // Pre-llenar precio editable
    document.getElementById('ml-precio-edit').value = data.price;

    document.getElementById('ml-preview').style.display  = 'block';
    document.getElementById('ml-save-btn').style.display = 'block';
    btn.textContent = '🔍 Traer datos del producto';
    showToast('✓ Producto encontrado!');

  } catch(e) {
    btn.textContent = '🔍 Traer datos del producto';
    showToast('No se pudo importar. Verificá el link.');
  }
}

async function guardarProductoML() {
  if (!mlProductoImportado) return;
  const precio = parseFloat(document.getElementById('ml-precio-edit').value);
  const stock  = parseInt(document.getElementById('ml-stock-edit').value) || null;
  const cat    = document.getElementById('ml-cat-edit').value;
  if (!precio) { showToast('Ingresá el precio mayorista'); return; }

  const newProd = {
    nombre:      mlProductoImportado.nombre,
    precio,
    stock,
    categoria:   cat,
    imagen_url:  mlProductoImportado.foto,
    proveedor_id: currentUser?.proveedorId || null
  };

  try {
    const { data } = await sb.from('productos').insert(newProd).select().single();
    productos.unshift(data || { ...newProd, id: Date.now() });
  } catch(e) {
    productos.unshift({ ...newProd, id: Date.now() });
  }

  mlImportadosCount++;
  renderProdGrid();
  showToast('✓ Producto importado al catálogo!');

  // Mostrar opción de importar otro
  document.getElementById('ml-preview').style.display   = 'none';
  document.getElementById('ml-save-btn').style.display  = 'none';
  document.getElementById('ml-url-input').value         = '';
  mlProductoImportado = null;

  const importadosEl = document.getElementById('ml-importados');
  const labelEl      = document.getElementById('ml-importados-label');
  importadosEl.style.display = 'block';
  labelEl.textContent = `✓ ${mlImportadosCount} producto${mlImportadosCount !== 1 ? 's' : ''} importado${mlImportadosCount !== 1 ? 's' : ''} en esta sesión`;
}

function importarOtro() {
  document.getElementById('ml-preview').style.display   = 'none';
  document.getElementById('ml-save-btn').style.display  = 'none';
  document.getElementById('ml-url-input').value         = '';
  mlProductoImportado = null;
  document.getElementById('ml-import-btn-text').textContent = '🔍 Traer datos del producto';
}

// ===== CARGA MÚLTIPLE =====
let filasMulti = [];
function initFilasMulti() {
  filasMulti = [{ id: Date.now() }];
  renderFilasMulti();
}
function agregarFilaMulti() {
  if (filasMulti.length >= 10) { showToast('Máximo 10 productos a la vez'); return; }
  filasMulti.push({ id: Date.now() });
  renderFilasMulti();
}
function eliminarFilaMulti(id) {
  filasMulti = filasMulti.filter(f => f.id !== id);
  renderFilasMulti();
}
function renderFilasMulti() {
  const el = document.getElementById('multi-prod-list');
  if (!el) return;
  el.innerHTML = filasMulti.map((f, i) => `
    <div style="background:#f8f9ff;border-radius:12px;padding:12px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:.78rem;font-weight:800;color:var(--blue)">Producto ${i+1}</span>
        ${filasMulti.length > 1 ? `<button onclick="eliminarFilaMulti(${f.id})" style="background:#fee2e2;color:#ef4444;border:none;border-radius:7px;padding:3px 8px;font-size:.72rem;cursor:pointer">✕</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input type="text" data-field="nombre" data-id="${f.id}" placeholder="Nombre del producto *" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input type="number" data-field="precio" data-id="${f.id}" placeholder="Precio *" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
          <input type="number" data-field="stock" data-id="${f.id}" placeholder="Stock" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
        </div>
        <select data-field="cat" data-id="${f.id}" style="border:1.5px solid var(--border);border-radius:10px;padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:.85rem;outline:none;background:white">
          <option>Tecnología</option><option>Hogar</option><option>Moda</option><option>Bazar</option><option>Alimentos</option>
        </select>
      </div>
    </div>`).join('');
}

async function addProductosMultiples() {
  const rows = document.querySelectorAll('#multi-prod-list [data-field="nombre"]');
  const prods = [];
  let hayError = false;
  rows.forEach(row => {
    const id   = row.dataset.id;
    const nombre = row.value.trim();
    const precio = parseFloat(document.querySelector(`[data-field="precio"][data-id="${id}"]`)?.value || '0');
    const stock  = parseInt(document.querySelector(`[data-field="stock"][data-id="${id}"]`)?.value || '0') || null;
    const cat    = document.querySelector(`[data-field="cat"][data-id="${id}"]`)?.value || 'General';
    if (!nombre || !precio) { hayError = true; return; }
    prods.push({ nombre, precio, stock, categoria: cat, proveedor_id: currentUser?.proveedorId || null });
  });
  if (hayError) { showToast('Completá nombre y precio en todas las filas'); return; }
  if (!prods.length) { showToast('No hay productos para guardar'); return; }
  const btn = document.getElementById('multi-btn-text');
  if (btn) btn.textContent = 'Guardando...';
  try {
    const { data } = await sb.from('productos').insert(prods).select();
    (data || prods.map((p,i) => ({...p, id: Date.now()+i}))).forEach(p => productos.unshift(p));
    showToast(`✓ ${prods.length} productos guardados`);
  } catch(e) {
    prods.forEach((p,i) => productos.unshift({...p, id: Date.now()+i}));
    showToast(`${prods.length} productos guardados`);
  }
  renderProdGrid();
  closeAddProduct();
  if (btn) btn.textContent = 'Guardar todos los productos ✓';
}

function openAddProduct() {
  fotoFile = null;
  removeFoto();
  document.getElementById('addProdModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAddTab('uno');
  mlImportadosCount = 0;
  mlProductoImportado = null;
  const impEl = document.getElementById('ml-importados');
  if(impEl) impEl.style.display = 'none';
  initFilasMulti();
}
function closeAddProduct() { document.getElementById('addProdModal').classList.remove('open'); document.body.style.overflow=''; }
function closeAddProductOnBg(e) { if(e.target===document.getElementById('addProdModal')) closeAddProduct(); }

async function addProduct() {
  const name  = document.getElementById('new-prod-name').value.trim();
  const price = document.getElementById('new-prod-price').value;
  const stock = document.getElementById('new-prod-stock').value;
  const cat   = document.getElementById('new-prod-cat').value;
  if (!name || !price) { showToast('Completá nombre y precio'); return; }

  const btn = document.getElementById('add-btn-text');
  if (btn) btn.textContent = 'Guardando...';

  let imgUrl = null;
  // Subir foto si eligió una
  if (fotoFile && currentUser?.proveedorId) {
    try {
      imgUrl = await subirFotoStorage(fotoFile, currentUser.proveedorId);
    } catch(e) {
      showToast('No se pudo subir la foto, se guardó sin imagen');
    }
  }

  const newProd = {
    nombre: name, precio: parseFloat(price),
    stock: stock ? parseInt(stock) : null,
    categoria: cat, imagen_url: imgUrl,
    proveedor_id: currentUser?.proveedorId || null
  };
  try {
    const { data } = await sb.from('productos').insert(newProd).select().single();
    productos.unshift(data || { ...newProd, id: Date.now() });
  } catch(e) {
    productos.unshift({ ...newProd, id: Date.now() });
  }
  renderProdGrid();
  closeAddProduct();
  showToast('✓ Producto guardado');
  if (btn) btn.textContent = 'Agregar al catálogo ✓';
}
function editarProducto(id,nombre,precio,stock,cat) {
  document.getElementById('edit-prod-id').value = id;
  document.getElementById('edit-prod-name').value = nombre;
  document.getElementById('edit-prod-price').value = precio;
  document.getElementById('edit-prod-stock').value = stock;
  const sel = document.getElementById('edit-prod-cat');
  if (sel) { for(let i=0;i<sel.options.length;i++) { if(sel.options[i].text===cat||sel.options[i].value===cat){sel.selectedIndex=i;break;} } }
  document.getElementById('editProdModal').classList.add('open'); document.body.style.overflow='hidden';
}
function closeEditProduct() { document.getElementById('editProdModal').classList.remove('open'); document.body.style.overflow=''; }
function closeEditProductOnBg(e) { if(e.target===document.getElementById('editProdModal')) closeEditProduct(); }
async function guardarEdicionProducto() {
  const id = document.getElementById('edit-prod-id').value;
  const name = document.getElementById('edit-prod-name').value.trim();
  const price = document.getElementById('edit-prod-price').value;
  const stock = document.getElementById('edit-prod-stock').value;
  const cat = document.getElementById('edit-prod-cat').value;
  if (!name||!price) { showToast('Completa nombre y precio'); return; }
  try {
    await sb.from('productos').update({nombre:name,precio:parseFloat(price),stock:stock?parseInt(stock):null,categoria:cat}).eq('id',id);
    const idx = productos.findIndex(p=>String(p.id)===String(id));
    if(idx>=0) productos[idx]={...productos[idx],nombre:name,precio:parseFloat(price),stock:stock?parseInt(stock):null,categoria:cat};
    renderProdGrid(); closeEditProduct(); showToast('Producto actualizado!');
  } catch(e) { showToast('Error al guardar'); }
}

// ===== NAV =====
function goTo(s) {
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const scr = document.getElementById('screen-'+s);
  if (scr) scr.classList.add('active');
  const nav = document.getElementById('nav-'+s);
  if (nav) nav.classList.add('active');
  if (s==='perfil' && currentUser) updatePerfilUI();
  if (s==='perfil' && currentUser?.type==='user') cargarHistorial();
  if (s==='favoritos') renderFavs();
  if (s==='mapa') { renderMapaProvincias(); renderMapaAllProvs(); }
  window.scrollTo(0,0);
}
function switchTab(tab, el) {
  document.querySelectorAll('.dash-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  // Cargar mensajes automáticamente al abrir el tab
  if (tab === 'mensajes-prov') cargarConversaciones();
}

// ===== REGISTRO =====
function showRegStep(step) {
  if (step===2) {
    const n=document.querySelector('#reg-step1 input[type="text"]')?.value?.trim();
    const e=document.querySelector('#reg-step1 input[type="email"]')?.value?.trim();
    const w=document.querySelector('#reg-step1 input[type="tel"]')?.value?.trim();
    const p=document.querySelector('#reg-step1 select')?.value;
    if(!n){showToast('Ingresa tu nombre');return;} if(!e){showToast('Ingresa tu email');return;} if(!w){showToast('Ingresa tu WhatsApp');return;} if(!p){showToast('Selecciona tu provincia');return;}
  }
  if (step===3) {
    const r=document.querySelectorAll('#reg-step2 input[type="text"]')[0]?.value?.trim();
    const c=document.querySelectorAll('#reg-step2 input[type="text"]')[1]?.value?.trim();
    const ru=document.querySelector('#reg-step2 select')?.value;
    const d=document.querySelector('#reg-step2 textarea')?.value?.trim();
    if(!r){showToast('Ingresa la razon social');return;} if(!c){showToast('Ingresa el CUIT');return;} if(!ru){showToast('Selecciona el rubro');return;} if(!d){showToast('Ingresa una descripcion');return;}
  }
  ['reg-intro','reg-step1','reg-step2','reg-step3','reg-success'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  const map={0:'reg-intro',1:'reg-step1',2:'reg-step2',3:'reg-step3'};
  const e=document.getElementById(map[step]||'reg-intro');
  if(e)e.style.display='block';
  window.scrollTo(0,0);
}
async function showRegSuccess() {
  const envios=document.querySelectorAll('#reg-step3 select')[0]?.value;
  const minimo=document.querySelectorAll('#reg-step3 select')[1]?.value;
  if(!envios){showToast('Selecciona si haces envios');return;} if(!minimo){showToast('Selecciona el pedido minimo');return;}
  try {
    await sb.from('proveedores').insert({
      nombre:document.querySelectorAll('#reg-step2 input[type="text"]')[0]?.value||'',
      cuit:document.querySelectorAll('#reg-step2 input[type="text"]')[1]?.value||'',
      email:(document.querySelector('#reg-step1 input[type="email"]')?.value||'').toLowerCase().trim(),
      whatsapp:document.querySelector('#reg-step1 input[type="tel"]')?.value||'',
      rubro:document.querySelector('#reg-step2 select')?.value||'',
      provincia:document.querySelector('#reg-step1 select')?.value||'',
      descripcion:document.querySelector('#reg-step2 textarea')?.value||'',
      envios,pedido_minimo:minimo,plan:'gratis',estado:'pendiente'
    });
  } catch(e) {}
  ['reg-intro','reg-step1','reg-step2','reg-step3'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  document.getElementById('reg-success').style.display='block';
  window.scrollTo(0,0);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// ===== AI TEST =====
const questions = [
  {text:"En que parte de Argentina estás?",sub:"Tu localidad nos ayuda a sugerirte rubros con demanda real.",options:[
    {icon:"🏙",label:"Buenos Aires / GBA",sub:"Gran Buenos Aires o CABA"},
    {icon:"🏔",label:"Córdoba o Rosario",sub:"Grandes ciudades del interior"},
    {icon:"🏘",label:"Ciudad mediana",sub:"Entre 50.000 y 500.000 hab."},
    {icon:"🏡",label:"Localidad pequeña",sub:"Menos de 50.000 hab."}
  ]},
  {text:"Con cuánto capital inicial contás?",sub:"Recomendamos rubros alcanzables con lo que tenés hoy.",options:[
    {icon:"💵",label:"Menos de $50.000",sub:"Empezar muy chico"},
    {icon:"💰",label:"$50.000 a $200.000",sub:"Capital moderado"},
    {icon:"💼",label:"$200.000 a $500.000",sub:"Buena base"},
    {icon:"🎯",label:"Más de $500.000",sub:"Puedo invertir fuerte"}
  ]},
  {text:"Por qué canal vas a vender?",sub:"El canal define qué tipo de producto funciona mejor.",options:[
    {icon:"📱",label:"Instagram / TikTok",sub:"Redes sociales"},
    {icon:"🛒",label:"MercadoLibre / Tiendanube",sub:"Marketplaces online"},
    {icon:"🏪",label:"Local o feria física",sub:"Venta presencial"},
    {icon:"👥",label:"WhatsApp / conocidos",sub:"Círculo cercano"}
  ]},
  {text:"Cuánta experiencia tenés vendiendo?",sub:"Ajustamos la recomendacion a tu nivel.",options:[
    {icon:"🌱",label:"Ninguna, primera vez",sub:"Empezando desde cero"},
    {icon:"📦",label:"Vendí algo alguna vez",sub:"Experiencia puntual"},
    {icon:"📈",label:"Ya vendo regularmente",sub:"Tengo proceso armado"},
    {icon:"🚀",label:"Vendedor/a experimentado/a",sub:"Busco escalar"}
  ]}
];
let currentStep=0, answers=[], selectedOption=null;
function openTest() { resetTest(); document.getElementById('testModal').classList.add('open'); document.body.style.overflow='hidden'; }
function closeTest() { document.getElementById('testModal').classList.remove('open'); document.body.style.overflow=''; }
function closeTestOnBg(e) { if(e.target===document.getElementById('testModal')) closeTest(); }
function resetTest() {
  currentStep=0; answers=[]; selectedOption=null;
  document.getElementById('questionsSection').style.display='block';
  document.getElementById('resultSection').classList.remove('show');
  document.getElementById('resultLoading').style.display='block';
  document.getElementById('resultContent').style.display='none';
  renderQuestion();
}
function renderQuestion() {
  const q = questions[currentStep];
  document.getElementById('stepIndicator').textContent = `Pregunta ${currentStep+1} de ${questions.length}`;
  document.getElementById('progressFill').style.width = `${(currentStep/questions.length)*100}%`;
  document.getElementById('qText').textContent = q.text;
  document.getElementById('qSub').textContent = q.sub;
  selectedOption=null;
  document.getElementById('nextBtn').classList.remove('ready');
  document.getElementById('optionsGrid').innerHTML = q.options.map((o,i)=>`
    <div class="opt-btn" data-idx="${i}">
      <span class="opt-icon">${o.icon}</span>
      <div><div class="opt-label">${o.label}</div><div class="opt-sub">${o.sub}</div></div>
    </div>`).join('');
  document.getElementById('optionsGrid').onclick = function(e) {
    const btn = e.target.closest('.opt-btn');
    if (!btn) return;
    document.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedOption = parseInt(btn.dataset.idx);
    document.getElementById('nextBtn').classList.add('ready');
  };
}
function nextStep() {
  if (selectedOption===null) return;
  answers.push({q:currentStep,a:selectedOption});
  if (currentStep<questions.length-1) { currentStep++; renderQuestion(); }
  else showResult();
}
async function showResult() {
  document.getElementById('progressFill').style.width='100%';
  document.getElementById('questionsSection').style.display='none';
  document.getElementById('resultSection').classList.add('show');
  document.getElementById('resultLoading').style.display='block';
  document.getElementById('resultContent').style.display='none';
  const locs=['Buenos Aires / GBA','Córdoba o Rosario','Ciudad mediana','Localidad pequeña'];
  const caps=['menos de $50.000','entre $50.000 y $200.000','entre $200.000 y $500.000','más de $500.000'];
  const cans=['Instagram/TikTok','MercadoLibre/Tiendanube','local o feria física','círculo cercano/WhatsApp'];
  const exps=['ninguna experiencia','algo de experiencia','vende regularmente','vendedor experimentado'];
  const prompt=`Sos un asesor de negocios mayoristas en Argentina. Perfil: Localidad: ${locs[answers[0].a]}, Capital: ${caps[answers[1].a]}, Canal: ${cans[answers[2].a]}, Experiencia: ${exps[answers[3].a]}. Recomienda el MEJOR rubro mayorista. Responde SOLO JSON sin backticks: {"rubro":"Moda|Tecnologia|Bazar|Hogar|Alimentos","titulo":"nombre atractivo max 4 palabras","porque":"2-3 oraciones español argentino coloquial","tips":["tip1","tip2","tip3"]}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:prompt}]})});
    const data = await res.json();
    const parsed = JSON.parse(data.content.map(i=>i.text||'').join('').replace(/```json|```/g,'').trim());
    currentResult=parsed.rubro;
    document.getElementById('resultRubro').textContent=parsed.titulo;
    document.getElementById('resultWhy').textContent=parsed.porque;
    document.getElementById('resultChips').innerHTML=parsed.tips.map(t=>`<span class="result-chip">💡 ${t}</span>`).join('');
  } catch(e) {
    const fallbacks=[
      {rubro:'Moda',titulo:'Moda y Accesorios',porque:'La moda es uno de los rubros más accesibles para empezar al por mayor.',tips:['Empezá con accesorios baratos','Usá Instagram para mostrar looks','Buscá proveedores en La Salada']},
      {rubro:'Bazar',titulo:'Bazar del Hogar',porque:'El bazar tiene alta rotación. Con poco capital armás un catálogo variado.',tips:['Armá combos de regalo','Vendé en ferias locales','Artículos de cocina se venden solos']},
      {rubro:'Tecnologia',titulo:'Accesorios Tech',porque:'Los accesorios tech tienen márgenes muy buenos en MercadoLibre.',tips:['Fundas y cargadores son lo más vendido','Comprá en cantidad','MercadoLibre es el mejor canal']}
    ];
    const r=fallbacks[Math.floor(Math.random()*fallbacks.length)];
    currentResult=r.rubro;
    document.getElementById('resultRubro').textContent=r.titulo;
    document.getElementById('resultWhy').textContent=r.porque;
    document.getElementById('resultChips').innerHTML=r.tips.map(t=>`<span class="result-chip">💡 ${t}</span>`).join('');
  }
  document.getElementById('resultLoading').style.display='none';
  document.getElementById('resultContent').style.display='block';
}

// ===== PRODUCTOS =====
const productosDemo=[];
let productosReales=[];
const catColors={'Tecnologia':'#1847C8','Tecnología':'#1847C8','Moda':'#FF6B00','Hogar':'#00A651','Bazar':'#7C3AED','Alimentos':'#F59E0B'};

function getEmojiCat(cat){const map={'Tecnologia':'📱','Tecnología':'📱','Moda':'👗','Hogar':'🏠','Bazar':'🛒','Alimentos':'🍫','Otro':'📦'};return map[cat]||'📦';}
function getProdLista(){return productosReales;}

async function cargarProductosReales() {
  try {
    const {data,error}=await sb.from('productos').select('*, proveedores(id,nombre,rubro,provincia,plan,whatsapp)').order('created_at',{ascending:false}).limit(50);
    if(!error&&data&&data.length>0){
      const bgs=['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];
      productosReales=data.map((p,i)=>({
        id:'real_'+p.id,idReal:p.id,nombre:p.nombre,precio:p.precio||0,
        pedido_minimo:p.stock?'Stock: '+p.stock+' unidades':'Consultar',
        cat:p.categoria||'General',emoji:getEmojiCat(p.categoria),
        provId:String(p.proveedor_id),
        provNombre:p.proveedores?.nombre||'Proveedor',
        provRubro:(p.proveedores?.rubro||'')+(p.proveedores?.provincia?' · '+p.proveedores.provincia:''),
        provColor:bgs[i%bgs.length],imgUrl:p.imagen_url||'',
        whatsapp:p.proveedores?.whatsapp||'',esPro:p.proveedores?.plan==='pro'
      }));
    }
  } catch(e){}
  renderProdInicio();
  renderProdBuscar();
}

function renderProdInicio(){
  const el=document.getElementById('prodInicioGrid');
  if(!el) return;
  const lista=getProdLista().slice(0,6);
  if(!lista.length){el.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--gray);font-size:.88rem">Los primeros productos apareceran pronto.</div>';return;}
  el.innerHTML=lista.map(p=>`
    <div class="prod-inicio-card" onclick="abrirDetalleProd('${p.id}')">
      <div class="prod-inicio-img" style="background:${p.provColor}18">
        ${p.imgUrl?`<img src="${p.imgUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:p.emoji}
        <span class="prod-inicio-badge" style="background:${catColors[p.cat]||'#1847C8'}">${p.cat}</span>
      </div>
      <div class="prod-inicio-body">
        <div class="prod-inicio-name">${p.nombre}</div>
        <div class="prod-inicio-price">$${Number(p.precio).toLocaleString('es-AR')}</div>
        <div class="prod-inicio-prov"><div class="prod-inicio-prov-dot"></div>${p.provNombre}</div>
      </div>
    </div>`).join('');
}

function renderProdBuscar(filtro,query=''){
  const el=document.getElementById('prodBuscarGrid');
  const summary=document.getElementById('buscarSummary');
  if(!el) return;
  let lista=getProdLista();
  const q=(query||'').toLowerCase().trim();
  if(filtro&&filtro!=='Todas') lista=lista.filter(p=>(p.cat||'').toLowerCase()===filtro.toLowerCase()||(p.cat||'').toLowerCase()===filtro.replace('í','i').toLowerCase());
  if(q) lista=lista.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q)||(p.provNombre||'').toLowerCase().includes(q));
  if(summary) summary.textContent=lista.length?`${lista.length} resultado${lista.length===1?'':'s'} en productos`:'Sin resultados en productos';
  if(!lista.length){el.innerHTML='<div class="empty-state" style="grid-column:1/-1;background:white;border-radius:16px;border:1px solid var(--border)"><div class="ei">🔎</div><p>No encontramos productos con esos filtros.</p></div>';return;}
  el.innerHTML=lista.map(p=>`
    <div class="prod-buscar-card" onclick="abrirDetalleProd('${p.id}')">
      <div class="top" style="background:${p.provColor}18">
        ${p.imgUrl?`<img src="${p.imgUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:p.emoji}
        <span class="prod-buscar-badge" style="background:${catColors[p.cat]||'#1847C8'}">${p.cat}</span>
      </div>
      <div class="body">
        <div class="title">${p.nombre}</div>
        <div class="price">$${Number(p.precio).toLocaleString('es-AR')}</div>
        <div class="meta"><div class="prod-inicio-prov-dot"></div>${p.provNombre}</div>
        <div class="prod-buscar-min">${p.pedido_minimo||'Pedido mínimo: consultar'}</div>
        <div class="actions">
          <button class="mini-btn primary" onclick="event.stopPropagation();abrirDetalleProd('${p.id}')">Ver detalle</button>
          <button class="mini-btn soft" onclick="event.stopPropagation();abrirDetalle('${p.provId}')">Proveedor</button>
        </div>
      </div>
    </div>`).join('');
}

function switchBuscarTab(tab,el){
  buscarTab=tab;
  document.querySelectorAll('.search-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const pv=document.getElementById('buscar-productos-view');
  const rv=document.getElementById('buscar-proveedores-view');
  const sv=document.getElementById('buscarSummary');
  if(tab==='productos'){
    if(pv)pv.style.display='block'; if(rv)rv.style.display='none'; if(sv)sv.style.display='block';
    renderProdBuscar(currentCat,document.getElementById('searchInput')?.value||'');
  } else {
    if(pv)pv.style.display='none'; if(rv)rv.style.display='block'; if(sv)sv.style.display='none';
    filterProvs();
  }
}
function applySearchInput(){
  if(buscarTab==='productos') renderProdBuscar(currentCat,document.getElementById('searchInput')?.value||'');
  else filterProvs();
}

function abrirDetalleProd(id){
  const p=getProdLista().find(x=>String(x.id)===String(id));
  if(!p) return;
  productoActual=p;
  const active=document.querySelector('.screen.active');
  pantallaAnteriorProd=active?active.id.replace('screen-',''):'inicio';
  document.getElementById('prod-det-emoji').innerHTML=`${p.imgUrl?`<img src="${p.imgUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:p.emoji}
    <button class="prod-det-back" onclick="volverDetProd()">← Volver</button>
    <button class="prod-det-fav" id="prod-det-fav-btn" onclick="event.stopPropagation();toggleFav(String(productoActual.provId));">${esFav(String(p.provId))?'❤️':'♡'}</button>`;
  document.getElementById('prod-det-name').textContent=p.nombre;
  document.getElementById('prod-det-price').textContent='$'+p.precio.toLocaleString('es-AR')+' por unidad';
  document.getElementById('prod-det-min').textContent=p.pedido_minimo;
  document.getElementById('prod-det-cat').textContent=p.cat;
  const pav=document.getElementById('prod-det-pav');
  if(pav){pav.style.background=p.provColor;pav.textContent=p.provNombre.substring(0,2).toUpperCase();}
  document.getElementById('prod-det-pname').textContent=p.provNombre;
  document.getElementById('prod-det-psub').textContent=p.provRubro;
  const vc=document.getElementById('pdcalc-venta'),cc=document.getElementById('pdcalc-cant');
  if(vc)vc.value=''; if(cc)cc.value='';
  const rc=document.getElementById('pdcalc-result'); if(rc)rc.style.display='none';
  const prov=(proveedoresDB.length?proveedoresDB:proveedoresDEMO).find(x=>String(x.id)===String(p.provId));
  const waBtn=document.getElementById('prod-det-wa-btn');
  if(waBtn)waBtn.style.display=(prov&&prov.pro&&prov.whatsapp)?'flex':'none';
  goTo('detalle-producto');
}
function volverDetProd(){goTo(pantallaAnteriorProd);}
function irAProveedorDesdeProd(){if(productoActual)abrirDetalle(productoActual.provId);}
function detWAProd(){if(!productoActual)return;const prov=(proveedoresDB.length?proveedoresDB:proveedoresDEMO).find(x=>String(x.id)===String(productoActual.provId));if(prov&&prov.whatsapp)abrirWA(prov.whatsapp);else showToast('WhatsApp no disponible');}
function detChatProd(){if(productoActual)abrirChatDirecto(productoActual.provId);}
function calcProdDet(){
  const costo=productoActual?productoActual.precio:0;
  const venta=parseFloat(document.getElementById('pdcalc-venta').value);
  const cant=parseFloat(document.getElementById('pdcalc-cant').value);
  const resEl=document.getElementById('pdcalc-result');
  if(!venta||!cant||cant<=0||venta<=0){if(resEl)resEl.style.display='none';return;}
  const inv=costo*cant,tot=venta*cant,gan=tot-inv;
  const mrg=inv>0?((gan/inv)*100).toFixed(0):0;
  document.getElementById('pdcalc-inv').textContent='$'+inv.toLocaleString('es-AR');
  document.getElementById('pdcalc-gan').textContent='$'+gan.toLocaleString('es-AR');
  document.getElementById('pdcalc-mrg').textContent=mrg+'%';
  document.getElementById('pdcalc-tot').textContent='$'+tot.toLocaleString('es-AR');
  if(resEl)resEl.style.display='grid';
}

// ===== CHAT REAL PROVEEDOR =====
let convActual = null; // { de_nombre, msgs }
let provChatAnterior = 'perfil';

async function cargarConversaciones() {
  if (!currentUser || !currentUser.proveedorId) return;
  const el = document.getElementById('conv-list-el');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:.85rem">Cargando...</div>';

  try {
    // Traer todos los mensajes de este proveedor agrupados por remitente
    const { data, error } = await sb
      .from('mensajes')
      .select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || !data.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--gray)"><div style="font-size:2rem;margin-bottom:10px">💬</div><p style="font-size:.85rem;line-height:1.6">Todavía no recibiste mensajes.<br>Cuando un emprendedor te escriba, aparece acá.</p></div>';
      return;
    }

    // Agrupar por de_nombre (conversaciones únicas)
    const convMap = {};
    data.forEach(m => {
      const key = m.de_nombre || 'Anónimo';
      if (!convMap[key]) convMap[key] = { nombre: key, msgs: [], noLeidos: 0, ultimo: m };
      convMap[key].msgs.push(m);
      if (!m.leido && m.de_tipo === 'usuario') convMap[key].noLeidos++;
    });

    const convs = Object.values(convMap);
    const totalNoLeidos = convs.reduce((s,c) => s + c.noLeidos, 0);

    // Actualizar badge del tab
    const badge = document.getElementById('msgs-badge');
    if (badge) badge.classList.toggle('show', totalNoLeidos > 0);

    el.innerHTML = convs.map((c,i) => {
      const ini = c.nombre.substring(0,2).toUpperCase();
      const ultimo = c.ultimo;
      const preview = (ultimo.texto||'').replace(/\n/g,' ').substring(0,50) + (ultimo.texto && ultimo.texto.length > 50 ? '...' : '');
      const tiempo = timeAgo(new Date(ultimo.created_at));
      return `<div class="conv-item ${c.noLeidos > 0 ? 'unread' : ''}" onclick="abrirConvProveedor('${c.nombre.replace(/'/g,"\'")}')">
        <div class="conv-avatar">${ini}</div>
        <div class="conv-info">
          <div class="conv-name">${c.nombre}</div>
          <div class="conv-preview">${preview}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${tiempo}</div>
          ${c.noLeidos > 0 ? `<div class="conv-unread-badge">${c.noLeidos}</div>` : ''}
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:.85rem">Error cargando mensajes.</div>';
  }
}

async function abrirConvProveedor(nombre) {
  convActual = { nombre, msgs: [] };
  document.getElementById('prov-chat-nombre').textContent = nombre;
  document.getElementById('prov-chat-sub').textContent = 'Emprendedor';
  const msgsEl = document.getElementById('prov-chat-msgs');
  msgsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:.82rem">Cargando...</div>';
  document.getElementById('provChatModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    // Traer TODOS los mensajes de esta conversacion (usuario + proveedor)
    const { data: msgsUsuario } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_nombre', nombre)
      .eq('de_tipo', 'usuario')
      .order('created_at', { ascending: true });

    const { data: msgsProveedor } = await sb.from('mensajes').select('*')
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_tipo', 'proveedor')
      .order('created_at', { ascending: true });

    // Combinar y ordenar por fecha
    const todos = [...(msgsUsuario||[]), ...(msgsProveedor||[])];
    todos.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    convActual.msgs = todos;

    // Marcar como leidos los del usuario
    await sb.from('mensajes').update({ leido: true })
      .eq('proveedor_id', currentUser.proveedorId)
      .eq('de_nombre', nombre).eq('de_tipo', 'usuario');
    renderProvChat();
  } catch(e) {
    msgsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray)">Error cargando mensajes.</div>';
  }
}

function renderProvChat() {
  const el = document.getElementById('prov-chat-msgs');
  if (!el || !convActual) return;
  if (!convActual.msgs.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray);font-size:.85rem">No hay mensajes aún.</div>';
    return;
  }
  el.innerHTML = convActual.msgs.map(m => {
    const esProveedor = m.de_tipo === 'proveedor';
    const tipo = esProveedor ? 'sent' : 'recv';
    const hora = m.created_at ? timeAgo(new Date(m.created_at)) : 'Ahora';
    const nombre = !esProveedor ? `<div style="font-size:.68rem;font-weight:700;color:var(--blue);margin-bottom:3px">${m.de_nombre || 'Emprendedor'}</div>` : '';
    return `<div style="display:flex;flex-direction:column;align-items:${esProveedor ? 'flex-end' : 'flex-start'}">
      ${nombre}
      <div class="chat-msg ${tipo}">${(m.texto||'').replace(/\n/g,'<br>')}<div class="chat-msg-time">${hora}</div></div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function provSendMsg() {
  const inp = document.getElementById('prov-chat-inp');
  const txt = inp.value.trim();
  if (!txt || !convActual || !currentUser) return;
  inp.value = '';

  const nuevoMsg = {
    proveedor_id: currentUser.proveedorId,
    de_tipo: 'proveedor',
    de_nombre: currentUser.name,
    texto: txt,
    leido: false
  };

  // Agregar al chat localmente
  convActual.msgs.push({ ...nuevoMsg, created_at: new Date().toISOString() });
  renderProvChat();

  // Guardar en Supabase
  try {
    await sb.from('mensajes').insert(nuevoMsg);
  } catch(e) {}
}

function closeProvChat() {
  document.getElementById('provChatModal').classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => cargarConversaciones(), 200);
}
function closeProvChatOnBg(e) {
  if (e.target === document.getElementById('provChatModal')) closeProvChat();
}

// ===== CARRITO =====
let carrito = []; // { producto, cantidad, provId, provNombre, provWA, provPro }
let carritoProvId = null; // Solo un proveedor por pedido

function agregarAlCarrito() {
  if (!productoActual) return;

  // Verificar que sea del mismo proveedor
  if (carritoProvId && carritoProvId !== String(productoActual.provId)) {
    showToast('Solo podés pedir a un proveedor a la vez. Vaciá el carrito primero.');
    return;
  }

  // Buscar proveedor real para obtener WA real
  const lista = proveedoresDB.length ? proveedoresDB : proveedoresDEMO;
  const prov = lista.find(x => String(x.id) === String(productoActual.provId));

  const existente = carrito.find(i => i.producto.id === productoActual.id);
  if (existente) {
    existente.cantidad++;
  } else {
    carrito.push({
      producto: { ...productoActual },
      cantidad: 1,
      provId: String(productoActual.provId),
      provNombre: productoActual.provNombre,
      provWA: prov?.whatsapp || '',
      provPro: prov?.pro || false
    });
    carritoProvId = String(productoActual.provId);
  }

  actualizarCarritoFab();
  showToast('✓ Agregado al pedido');
}

function actualizarCarritoFab() {
  const fab = document.getElementById('carritoFab');
  const cnt = document.getElementById('carritoCount');
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  fab.classList.toggle('show', carrito.length > 0);
  cnt.textContent = total;
}

function openCarrito() {
  renderCarrito();
  document.getElementById('carritoModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCarrito() {
  document.getElementById('carritoModal').classList.remove('open');
  document.body.style.overflow = '';
}
function closeCarritoOnBg(e) {
  if (e.target === document.getElementById('carritoModal')) closeCarrito();
}

function cambiarCantidad(idx, delta) {
  carrito[idx].cantidad += delta;
  if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
  if (!carrito.length) carritoProvId = null;
  actualizarCarritoFab();
  renderCarrito();
}

function limpiarCarrito() {
  carrito = [];
  carritoProvId = null;
  actualizarCarritoFab();
  closeCarrito();
  showToast('Pedido vaciado');
}

function renderCarrito() {
  if (!carrito.length) { closeCarrito(); return; }

  const item0 = carrito[0];
  const bgs = ['#1847C8','#FF6B00','#00A651','#7C3AED','#0D1B3E'];

  // Info proveedor
  const avatarEl = document.getElementById('carrito-prov-avatar');
  const nameEl   = document.getElementById('carrito-prov-name');
  if (avatarEl) { avatarEl.textContent = item0.provNombre.substring(0,2).toUpperCase(); avatarEl.style.background = bgs[0]; }
  if (nameEl)   nameEl.textContent = item0.provNombre;

  // Items
  const itemsEl = document.getElementById('carrito-items');
  itemsEl.innerHTML = carrito.map((item, idx) => `
    <div class="carrito-item">
      <div style="width:42px;height:42px;border-radius:10px;background:${bgs[idx%bgs.length]}18;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">
        ${item.producto.imgUrl ? `<img src="${item.producto.imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : item.producto.emoji}
      </div>
      <div class="carrito-item-info">
        <div class="carrito-item-name">${item.producto.nombre}</div>
        <div class="carrito-item-price">$${Number(item.producto.precio).toLocaleString('es-AR')} c/u · Total: $${Number(item.producto.precio * item.cantidad).toLocaleString('es-AR')}</div>
      </div>
      <div class="carrito-qty">
        <button class="qty-btn" onclick="cambiarCantidad(${idx},-1)">−</button>
        <span class="qty-num">${item.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${idx},1)">+</button>
      </div>
    </div>`).join('');

  // Totales
  const subtotal  = carrito.reduce((s,i) => s + (i.producto.precio * i.cantidad), 0);
  const unidades  = carrito.reduce((s,i) => s + i.cantidad, 0);
  document.getElementById('carrito-subtotal').textContent  = '$' + subtotal.toLocaleString('es-AR');
  document.getElementById('carrito-unidades').textContent  = unidades + ' unidades';
  document.getElementById('carrito-total').textContent     = '$' + subtotal.toLocaleString('es-AR');

  // Botones según plan
  const actionsEl = document.getElementById('carrito-actions');
  const esPro     = item0.provPro;
  const tieneWA   = item0.provWA && item0.provWA.trim() !== '';

  if (esPro && tieneWA) {
    actionsEl.innerHTML = `<button class="carrito-wa-btn" onclick="enviarPedidoPorWA()">📲 Enviar pedido por WhatsApp</button>`;
  } else if (!esPro) {
    actionsEl.innerHTML = `
      <button class="carrito-chat-btn" onclick="enviarPedidoPorChat()">💬 Enviar pedido por chat</button>
      <div class="pro-lock">
        <div class="pro-lock-text">🔒 El proveedor necesita el <strong>Plan PRO</strong> para recibir pedidos por WhatsApp directo.</div>
        <button class="pro-lock-btn" onclick="closeCarrito();goTo('planes')">Ver Plan PRO →</button>
      </div>`;
  } else {
    // Es PRO pero no tiene WA cargado
    actionsEl.innerHTML = `<button class="carrito-chat-btn" onclick="enviarPedidoPorChat()">💬 Enviar pedido por chat</button>`;
  }
}

function generarMensajePedido() {
  const item0 = carrito[0];
  let msg = `Hola! Te hago un pedido desde EmprendeGo 🚀

`;
  carrito.forEach(item => {
    msg += `📦 ${item.producto.nombre} x${item.cantidad} = $${Number(item.producto.precio * item.cantidad).toLocaleString('es-AR')}
`;
  });
  const total = carrito.reduce((s,i) => s + (i.producto.precio * i.cantidad), 0);
  msg += `
💰 Total estimado: $${total.toLocaleString('es-AR')}
`;
  msg += `
¿Podés confirmar disponibilidad y formas de pago? Gracias!`;
  return msg;
}

function enviarPedidoPorWA() {
  const item0 = carrito[0];
  if (!item0.provWA) { showToast('Este proveedor no tiene WhatsApp configurado'); return; }
  const num = item0.provWA.replace(/[^0-9]/g, '');
  const msg = generarMensajePedido();
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  closeCarrito();
}

function enviarPedidoPorChat() {
  const item0 = carrito[0];
  closeCarrito();
  // Abrir chat con el mensaje del pedido pre-cargado
  abrirChatDirecto(item0.provId);
  setTimeout(() => {
    const inp = document.getElementById('chat-inp');
    if (inp) inp.value = generarMensajePedido();
  }, 400);
}

// ===== UPLOAD AVATARES =====
async function subirAvatar(file, carpeta) {
  if (!file) return null;
  if (file.size > 3 * 1024 * 1024) { showToast('La imagen es muy grande. Máx 3MB'); return null; }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  // Nombre único para evitar conflictos
  const path = carpeta + '/' + Math.random().toString(36).substring(2) + '_' + Date.now() + '.' + ext;
  try {
    const { data, error } = await sb.storage.from('Avatares').upload(path, file);
    if (error) {
      console.error('Storage error:', error);
      showToast('Error al subir: ' + (error.message || 'intenta de nuevo'));
      return null;
    }
    const { data: urlData } = sb.storage.from('Avatares').getPublicUrl(path);
    return urlData.publicUrl;
  } catch(e) {
    showToast('Error al subir imagen');
    return null;
  }
}

async function subirAvatarUsuario(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Subiendo foto...');
  const url = await subirAvatar(file, 'usuarios');
  if (!url) return;
  // Mostrar en la UI
  const img = document.getElementById('user-avatar-img');
  img.src = url;
  img.style.display = 'block';
  document.getElementById('user-avatar-placeholder').style.display = 'none';
  // Guardar en Supabase
  try {
    if (currentUser?.email) {
      await sb.from('usuarios').upsert({ email: currentUser.email, foto_url: url }, { onConflict: 'email' });
    }
  } catch(e) {}
  showToast('✓ Foto actualizada');
}

async function subirLogoProveedor(input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Subiendo logo...');
  const url = await subirAvatar(file, 'proveedores');
  if (!url) return;
  // Mostrar en la UI
  const img = document.getElementById('dash-avatar-img');
  if (img) { img.src = url; img.style.display = 'block'; }
  const initials = document.getElementById('dash-avatar-initials');
  if (initials) initials.style.display = 'none';
  // Guardar en Supabase
  try {
    if (currentUser?.proveedorId) {
      await sb.from('proveedores').update({ logo_url: url }).eq('id', currentUser.proveedorId);
    }
  } catch(e) {}
  showToast('✓ Logo actualizado');
}

async function cargarAvatarUsuario() {
  if (!currentUser?.email) return;
  try {
    const { data } = await sb.from('usuarios').select('foto_url').eq('email', currentUser.email).single();
    if (data?.foto_url) {
      const img = document.getElementById('user-avatar-img');
      if (img) { img.src = data.foto_url; img.style.display = 'block'; }
      const ph = document.getElementById('user-avatar-placeholder');
      if (ph) ph.style.display = 'none';
    }
  } catch(e) {}
}

async function cargarLogoProveedor() {
  if (!currentUser?.proveedorId) return;
  try {
    const { data } = await sb.from('proveedores').select('logo_url').eq('id', currentUser.proveedorId).single();
    if (data?.logo_url) {
      const img = document.getElementById('dash-avatar-img');
      if (img) { img.src = data.logo_url; img.style.display = 'block'; }
      const initials = document.getElementById('dash-avatar-initials');
      if (initials) initials.style.display = 'none';
    }
  } catch(e) {}
}

// ===== INIT =====
refreshFavBadge();
cargarProveedores().then(()=>{
  initNotificaciones();
  renderMapaProvincias();
  renderMapaAllProvs();
});
renderQuestion();
checkSession();
cargarProductosReales();
setTimeout(()=>{try{renderProdBuscar(currentCat,'');}catch(e){}},300);
// ===== MERCADO PAGO - PLAN PRO =====
async function iniciarPagoPro() {
  if (!currentUser || !currentUser.proveedorId) {
    showToast('Primero tenés que estar logueado como proveedor');
    return;
  }
  showToast('Redirigiendo a Mercado Pago...');
  try {
    const res = await fetch('/api/crear-pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        proveedorId: currentUser.proveedorId
      })
    });
    const data = await res.json();
    if (data.sandbox_init_point) {
      window.location.href = data.sandbox_init_point;
    } else if (data.init_point) {
      window.location.href = data.init_point;
    } else {
      showToast('Error al crear el pago. Intentá de nuevo.');
    }
  } catch(e) {
    showToast('Error de conexión. Intentá de nuevo.');
  }
}
