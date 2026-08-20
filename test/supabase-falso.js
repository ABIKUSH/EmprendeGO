/* =====================================================================
   Supabase de mentira. Encadenable y "awaitable", como el SDK v2.

   Cada consulta se arma como una cadena (.from().select().eq()...) y recien
   se resuelve cuando alguien la espera. Al resolverse, se le pasa la cadena
   entera a un router que decide que devolver. Asi una prueba puede decir
   "esta consulta devuelve estas filas" o "esta devuelve el error 42703" sin
   tocar nada del modulo.

   IMPORTANTE para lo que se prueba aca: el SDK NO tira una excepcion cuando
   la base rechaza algo, devuelve { data, error }. Es exactamente el detalle
   que hace que pedir una columna inexistente rompa la consulta ENTERA en vez
   de devolver el campo vacio, que es lo que sostiene todo el degradado por
   nivelSql. Si este falso tirara una excepcion, las pruebas del fallback
   pasarian por el motivo equivocado.
   ===================================================================== */
'use strict';

function crearSupabase(router) {
  const llamadas = [];

  function cadena(inicio) {
    const pasos = inicio.slice();
    const api = {};
    // Todo lo que devuelve la cadena para seguir encadenando.
    ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
      'lt', 'lte', 'in', 'is', 'or', 'order', 'limit', 'range', 'not', 'filter']
      .forEach(m => {
        api[m] = (...args) => { pasos.push({ m, args }); return api; };
      });

    // Los tres finalizadores devuelven una sola fila en vez de una lista.
    ['single', 'maybeSingle'].forEach(m => {
      api[m] = () => { pasos.push({ m, args: [] }); return api; };
    });

    api.then = (resolve, reject) => {
      let r;
      try {
        llamadas.push(pasos.map(p => p.m + '(' + JSON.stringify(p.args) + ')').join('.'));
        r = router(pasos);
      } catch (e) { return Promise.reject(e).then(resolve, reject); }
      // Siempre { data, error }: el SDK no tira, informa.
      const res = r === undefined ? { data: null, error: null } : r;
      return Promise.resolve(res).then(resolve, reject);
    };
    api.pasos = pasos;
    return api;
  }

  return {
    from: tabla => cadena([{ m: 'from', args: [tabla] }]),
    rpc: (nombre, args) => cadena([{ m: 'rpc', args: [nombre, args] }]),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'uid-comprador' } } } }),
      // El modulo se cuelga de este evento para publicar el borrador que quedo
      // a medias. No se dispara solo: las pruebas que lo necesiten guardan el
      // callback y lo llaman a mano.
      onAuthStateChange: fn => { llamadas.push('onAuthStateChange'); return { data: { subscription: { unsubscribe() { } } }, callback: fn }; }
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) },
    llamadas
  };
}

// Ayudas para leer una cadena dentro del router.
const tablaDe = pasos => (pasos[0].m === 'from' ? pasos[0].args[0] : null);
const rpcDe = pasos => (pasos[0].m === 'rpc' ? pasos[0].args[0] : null);
const tiene = (pasos, m) => pasos.some(p => p.m === m);
const argsDe = (pasos, m) => (pasos.find(p => p.m === m) || {}).args || [];
const selectDe = pasos => String(argsDe(pasos, 'select')[0] || '');
const eqsDe = pasos => pasos.filter(p => p.m === 'eq').map(p => ({ col: p.args[0], val: p.args[1] }));

module.exports = { crearSupabase, tablaDe, rpcDe, tiene, argsDe, selectDe, eqsDe };
