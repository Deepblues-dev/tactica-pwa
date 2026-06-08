// ════════════════════════════════════════════════════════════
// config.js — Constantes globales, estado de la app y capas
// Cargado primero. Todos los demás módulos dependen de este.
// ════════════════════════════════════════════════════════════

const CLIENT_ID  = '453700019777-2orvn3rdbepvhq8rdjdi26i548s0t3nq.apps.googleusercontent.com';
const SHEET_ID   = '1Kxx-zjhGIsF3mnAKs6_e3yZCEHGyauufQ90wzlL2InA';
const LOG_SHEET  = 'LOGS';
const PAGE_SIZE  = 20;

const DEVICE_ID = (() => {
    let id = localStorage.getItem('device_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('device_id', id);
    }
    return id;
})();

// ── Estado central de la app ──────────────────────────────
const App = {
    tokenClient        : null,
    accessToken        : null,
    tokenExpira        : parseInt(localStorage.getItem('tokenExpira') || '0'),
    rawData            : [],
    filtrados          : [],
    paginaActual       : 1,
    ordenActual        : 'recientes',
    timerRenovacion    : null,
    _silenciosoTimeout : null,
    _entrandoApp       : false,
};

// ── Columnas de la hoja de cálculo (índice = columna) ─────
const COLUMNAS = [
    'ID',                           // 0
    'Expediente',                   // 1
    'Acumulado',                    // 2
    'Juzgado',                      // 3
    'Cliente',                      // 4
    'Actor',                        // 5
    'Demandado',                    // 6
    'Juicio',                       // 7
    'Monto',                        // 8
    'Relacionado',                  // 9
    'Piezas',                       // 10
    'Estado_Procesal',              // 11
    'Entidad_Federativa',           // 12
    'Distrito_Judicial_o_Ciudad',   // 13
    'Fuero',                        // 14
    'Recursos',                     // 15
    'Sentencia',                    // 16
    'Autorizados',                  // 17
    'Observaciones',                // 18
    'Pendientes',                   // 19
    'Termino',                      // 20
    'Ultima_Modificacion',          // 21
    'Ubicacion_del_Expediente',     // 22
    'Ultima_revision',              // 23
    'Nota_rapida'                   // 24
];

// Columnas que no se muestran en el editor completo
const COLUMNAS_NO_EDITABLES = [0, 21, 23];

// ════════════════════════════════════════════════════════════
// CAPAS DE DATOS — control de visibilidad por sesión
// ════════════════════════════════════════════════════════════
//
// CAPA 1 — Pública:      visible siempre (offline sin token)
// CAPA 2 — Privada móvil: visible con token válido en memoria
// CAPA 3 — Completa:     reservado — escritorio + clave maestra
//
// 🚩 REDFLAG: este control es SOLO de renderizado.
//    Cuando se implemente cifrado real, IndexedDB deberá
//    guardar únicamente índices de Capa 1 sin sesión activa,
//    y los datos de Capa 2/3 solo deben persistir cifrados.
// ════════════════════════════════════════════════════════════
const CAPAS = {
    ocultos      : [0],
    publica      : [1, 3, 10, 22, 23, 24],
    privadaMovil : [2, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    // privadaDesktop: []  ← Capa 3, implementación futura (P3)
};
