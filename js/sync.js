// ════════════════════════════════════════════════════════════
// sync.js — Consulta de datos, sincronización y logs
// Depende de: config.js, auth.js, db.js
// ════════════════════════════════════════════════════════════

// ── Consultar datos (Sheets o IndexedDB) ─────────────────
async function consultarDatos() {

    if (!navigator.onLine) {
        toast('Modo offline activo', 'warning');
        const datosLocales = await cargarExpedientesLocal();
        if (datosLocales.length > 0) {
            App.rawData  = [COLUMNAS, ...datosLocales];
            App.filtrados = App.rawData.slice(1);
            prepararFiltros();
            App.paginaActual = 1;
            window.aplicarFiltroFinal();
        } else {
            toast('No existen datos guardados localmente.', 'error');
        }
        return;
    }

    if (!App.accessToken) {
        if (tokenVigente() || ultimaValidacionVigente()) {
            const datosLocales = await cargarExpedientesLocal();
            if (datosLocales.length > 0) {
                App.rawData   = [COLUMNAS, ...datosLocales];
                App.filtrados = App.rawData.slice(1);
                prepararFiltros();
                App.paginaActual = 1;
                window.aplicarFiltroFinal();
            }
        } else {
            toast('Sesión expirada. Ingresa de nuevo.', 'warning');
            window.cerrarSesion();
        }
        return;
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A:Z`;
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + App.accessToken }
        });

        if (response.status === 401) {
            toast('Sesión expirada. Vuelve a ingresar.', 'warning');
            window.cerrarSesion();
            return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = await response.json();
        if (data.values && data.values.length > 1) {
            App.rawData = data.values;
            await guardarExpedientesLocal(data.values);
            prepararFiltros();
            App.paginaActual = 1;
            App.filtrados    = App.rawData.slice(1);
            window.aplicarFiltroFinal();
        } else if (data.values?.length <= 1) {
            toast('La hoja de datos está vacía.', 'warning');
        } else {
            throw new Error(data.error?.message || 'Respuesta inesperada de la API');
        }
    } catch (e) {
        console.error('consultarDatos:', e);
        toast('No se pudieron cargar los expedientes. ' + (e.message || ''), 'error');
    }
}

// ── Guardar nuevo expediente en Sheets ───────────────────
async function guardarNuevoExpedienteRemoto(expediente) {

    // El array debe coincidir exactamente con COLUMNAS (25 campos)
    const fila = [
        expediente[0],   // ID          — generado
        expediente[1],   // Expediente
        expediente[2],   // Acumulado
        expediente[3],   // Juzgado
        expediente[4],   // Cliente
        expediente[5],   // Actor
        expediente[6],   // Demandado
        expediente[7],   // Juicio
        expediente[8],   // Monto
        expediente[9],   // Relacionado
        expediente[10],  // Piezas
        expediente[11],  // Estado_Procesal
        expediente[12],  // Entidad_Federativa
        expediente[13],  // Distrito_Judicial_o_Ciudad
        expediente[14],  // Fuero
        expediente[15],  // Recursos
        expediente[16],  // Sentencia
        expediente[17],  // Autorizados
        expediente[18],  // Observaciones
        expediente[19],  // Pendientes
        expediente[20],  // Termino
        expediente[21],  // Ultima_Modificacion
        expediente[22],  // Ubicacion_del_Expediente
        expediente[23],  // Ultima_revision
        expediente[24],  // Nota_rapida
    ];

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A:Y:append?valueInputOption=USER_ENTERED`,
        {
            method : 'POST',
            headers: {
                'Authorization': 'Bearer ' + App.accessToken,
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify({ values: [fila] })
        }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// ── Log en Google Sheets ──────────────────────────────────
async function subirLogSheets(log) {
    if (!navigator.onLine || !App.accessToken) return;
    try {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${LOG_SHEET}!A:M:append?valueInputOption=USER_ENTERED`,
            {
                method : 'POST',
                headers: {
                    'Authorization': 'Bearer ' + App.accessToken,
                    'Content-Type' : 'application/json'
                },
                body: JSON.stringify({
                    values: [[
                        log.logId,
                        log.fecha,
                        log.usuario,
                        log.deviceId,
                        log.expedienteId,
                        log.campo,
                        log.valorAnterior,
                        log.valorNuevo,
                        log.versionAnterior,
                        log.versionNueva,
                        log.modo,
                        log.estado,
                        log.hash
                    ]]
                })
            }
        );
    } catch (e) {
        console.error('Error LOG:', e);
    }
}

// ── Sincronizar cola de cambios pendientes ────────────────
let sincronizando = false;

async function sincronizarPendientes() {

    if (sincronizando)        return;
    if (!navigator.onLine)    return;

    if (!App.accessToken) {
        if (!ultimaValidacionVigente()) {
            toast('La sesión expiró. Inicia sesión para sincronizar.', 'warning', 6000);
            return;
        }
        try {
            await new Promise((resolve, reject) => {
                const callbackOriginal = App.tokenClient.callback;
                App.tokenClient.callback = (tokenResponse) => {
                    App.tokenClient.callback = callbackOriginal;
                    if (tokenResponse?.access_token) {
                        App.accessToken = tokenResponse.access_token;
                        App.tokenExpira = Date.now() + (8 * 60 * 60 * 1000);
                        localStorage.setItem('tokenExpira', App.tokenExpira.toString());
                        localStorage.setItem('ultimaValidacion', Date.now().toString());
                        resolve();
                    } else {
                        reject(new Error('No se obtuvo token'));
                    }
                };
                App.tokenClient.requestAccessToken({ prompt: '' });
            });
        } catch (e) {
            console.error('No fue posible renovar el token:', e);
            toast('No fue posible sincronizar. Inicia sesión nuevamente.', 'warning', 6000);
            return;
        }
    }

    sincronizando = true;

    try {
        const pendientes = await obtenerQueuePendiente();
        if (!pendientes.length) return;

        toast(`Sincronizando ${pendientes.length} cambios...`, 'warning', 4000);

        for (const item of pendientes) {

            if (item.type === 'nuevo_expediente') {
                await guardarNuevoExpedienteRemoto(item.expediente);
                await eliminarQueueItem(item.queueId);
                continue;
            }

            try {
                for (const u of item.updates) {
                    const response = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${item.rowIndex}?valueInputOption=USER_ENTERED`,
                        {
                            method : 'PUT',
                            headers: {
                                'Authorization': 'Bearer ' + App.accessToken,
                                'Content-Type' : 'application/json'
                            },
                            body: JSON.stringify({ values: [[u.value]] })
                        }
                    );

                    if (response.status === 401) {
                        App.accessToken = null;
                        App.tokenExpira = 0;
                        localStorage.removeItem('tokenExpira');
                        toast('Sesión expirada. Inicia sesión nuevamente.', 'warning', 6000);
                        return;
                    }
                    if (response.status === 429) {
                        await new Promise(r => setTimeout(r, 1500));
                    }
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                }

                await eliminarQueueItem(item.queueId);

            } catch (e) {
                console.error('Error sincronizando item:', e);
            }
        }

        toast('Sincronización completada.', 'success');

    } finally {
        sincronizando = false;
    }
}

// ── Exportación diferida de pendientes ───────────────────
let timerExportacionPendientes = null;

function programarExportacionPendientes() {
    if (timerExportacionPendientes) clearTimeout(timerExportacionPendientes);
    timerExportacionPendientes = setTimeout(async () => {
        try {
            await exportarPendientes();
            console.log('Pendientes exportados automáticamente.');
        } catch (e) {
            console.error('Error al exportar pendientes:', e);
        }
    }, 15 * 60 * 1000);
}

async function exportarPendientesAlCerrar() {
    try { await exportarPendientes(); } catch (e) {}
}

// ── Listeners de conectividad ─────────────────────────────
window.addEventListener('online', () => {
    toast('Conexión restaurada', 'success');
    sincronizarPendientes();
});

window.addEventListener('offline', () => {
    toast('Trabajando sin internet', 'warning', 5000);
});
