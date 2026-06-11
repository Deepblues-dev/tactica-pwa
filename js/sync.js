// ════════════════════════════════════════════════════════════
// sync.js — Consulta de datos, sincronización y logs
// Depende de: config.js, auth.js, db.js
// ════════════════════════════════════════════════════════════

// ── Generar hash del log para integridad ──────────────────
async function generarHash(logBase) {
    const contenido = JSON.stringify(logBase);
    const encoder = new TextEncoder();
    const data = encoder.encode(contenido);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16); // Primeros 16 caracteres
}

// ── Renovación lazy de token (dentro de gesto de usuario) ─
// Usar antes de cualquier operación online que requiera token.
// Devuelve true si hay token válido al terminar, false si no.
async function asegurarToken() {

    if (App.accessToken && tokenVigente()) return true;
    if (!navigator.onLine || !App.tokenClient) return false;

    const emailGuardado = localStorage.getItem('userEmail') || '';

    return new Promise(resolve => {

        const timeoutId = setTimeout(() => {
            resolve(false);
        }, 12000);

        const callbackOriginal = App.tokenClient.callback;

        App.tokenClient.callback = (tokenResponse) => {

            clearTimeout(timeoutId);
            App.tokenClient.callback = callbackOriginal;

            if (tokenResponse?.access_token) {
                App.accessToken = tokenResponse.access_token;
                App.tokenExpira = Date.now() + (8 * 60 * 60 * 1000);
                localStorage.setItem('tokenExpira', App.tokenExpira.toString());
                localStorage.setItem('ultimaValidacion', Date.now().toString());
                localStorage.setItem('sesionActiva', '1');
                // También ejecutar callback original para actualizar UI
                callbackOriginal?.(tokenResponse);
                resolve(true);
            } else {
                resolve(false);
            }
        };

        try {
            App.tokenClient.requestAccessToken({
                prompt    : '',
                login_hint: emailGuardado
            });
        } catch (e) {
            clearTimeout(timeoutId);
            App.tokenClient.callback = callbackOriginal;
            resolve(false);
        }
    });
}

// ── Consultar datos (Sheets o IndexedDB) ─────────────────
async function consultarDatos() {

    // Si estamos online, sincronizar cola ANTES de cargar datos remotos
 if (
    navigator.onLine &&
    !window.sincronizacionEnProgreso
) {

    await sincronizarPendientes();

    await sincronizarLogsPendientes();
}

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
            // Token expirado: intentar renovación silenciosa antes de cerrar sesión
            App.accessToken = null;
            App.tokenExpira = 0;
            localStorage.removeItem('tokenExpira');

            if (App.tokenClient && navigator.onLine) {
                const emailGuardado = localStorage.getItem('userEmail') || '';
                toast('Renovando sesión...', 'warning', 3000);
                App.tokenClient.requestAccessToken({
                    prompt    : '',
                    login_hint: emailGuardado
                });
                // El callback de initGis llamará consultarDatos nuevamente
            } else {
                toast('Sesión expirada. Vuelve a ingresar.', 'warning');
                window.cerrarSesion();
            }
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

    // El array debe coincidir exactamente con COLUMNAS (25 campos).
    // Índice 0 (ID) se deja vacío — se calculará del número de fila
    // retornado por Sheets en updatedRange.
    const fila = [
        '',              // 0  ID — se asigna después con el número de fila real
        expediente[1],   // 1  Expediente
        expediente[2],   // 2  Acumulado
        expediente[3],   // 3  Juzgado
        expediente[4],   // 4  Cliente
        expediente[5],   // 5  Actor
        expediente[6],   // 6  Demandado
        expediente[7],   // 7  Juicio
        expediente[8],   // 8  Monto
        expediente[9],   // 9  Relacionado
        expediente[10],  // 10 Piezas
        expediente[11],  // 11 Estado_Procesal
        expediente[12],  // 12 Entidad_Federativa
        expediente[13],  // 13 Distrito_Judicial_o_Ciudad
        expediente[14],  // 14 Fuero
        expediente[15],  // 15 Recursos
        expediente[16],  // 16 Sentencia
        expediente[17],  // 17 Autorizados
        expediente[18],  // 18 Observaciones
        expediente[19],  // 19 Pendientes
        expediente[20],  // 20 Termino
        expediente[21],  // 21 Ultima_Modificacion
        expediente[22],  // 22 Ubicacion_del_Expediente
        expediente[23],  // 23 Ultima_revision
        expediente[24],  // 24 Nota_rapida
    ];

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A:Y:append?valueInputOption=USER_ENTERED&includeValuesInResponse=false`,
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

    const resultado = await response.json();

    // Extraer el número de fila real donde Sheets insertó el registro.
    // updatedRange devuelve algo como "DB!A52:Y52" — extraemos 52.
    // Ese número de fila ES el ID consecutivo de la BD.
    let idConsecutivo = null;
    try {
        const range = resultado?.updates?.updatedRange || '';
        // Formato: "DB!A52:Y52" o "'DB'!A52:Y52"
        const match = range.match(/[A-Z]+(\d+)/);
        if (match) {
            idConsecutivo = parseInt(match[1], 10);
        }
    } catch (e) {
        console.warn('[nuevo expediente] No se pudo extraer ID del range:', e);
    }

    // Si no se pudo extraer, usar el máximo ID actual + 1 como fallback
    if (!idConsecutivo) {
        const ids = App.rawData.slice(1)
            .map(r => parseInt(r[0], 10))
            .filter(n => !isNaN(n));
        idConsecutivo = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        console.warn('[nuevo expediente] ID de fila no extraído, usando fallback:', idConsecutivo);
    }

    // Escribir el ID consecutivo en la celda A de la fila recién creada
    await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A${idConsecutivo}?valueInputOption=USER_ENTERED`,
        {
            method : 'PUT',
            headers: {
                'Authorization': 'Bearer ' + App.accessToken,
                'Content-Type' : 'application/json'
            },
            body: JSON.stringify({ values: [[String(idConsecutivo)]] })
        }
    );

    console.log('[nuevo expediente] Creado en fila', idConsecutivo, '— ID asignado:', idConsecutivo);

    // Devolver el ID para que nuevoExpediente() lo use en el log
    return idConsecutivo;
}

// ── Log en Google Sheets ──────────────────────────────────
async function subirLogSheets(log) {
    if (!navigator.onLine)
    return;

if (
    !App.accessToken ||
    !tokenVigente()
) {

    const ok =
        await asegurarToken();

    if (!ok)
        return;
}
     try {
        await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${LOG_SHEET_ID}/values/${LOG_SHEET}!A:O:append?valueInputOption=USER_ENTERED`,
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
    log.expedienteNum,
    log.campo,
    log.valorAnterior,
    log.valorNuevo,
    log.versionAnterior,
    log.versionNueva,
    log.modo,
    log.estado,
    log.hash,
    log.nivelAcceso
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

// Flag global para bloquear refresh mientras se sincroniza
window.sincronizacionEnProgreso = false;

async function sincronizarPendientes() {

    if (sincronizando)        return;
    if (!navigator.onLine)    return;

    if (!App.accessToken || !tokenVigente()) {
        toast('Renovando sesión para sincronizar...', 'warning', 3000);
        const ok = await asegurarToken();
        if (!ok) {
            toast('No fue posible sincronizar. Verifica tu conexión e intenta de nuevo.', 'warning', 6000);
            return;
        }
    }

    sincronizando = true;
    window.sincronizacionEnProgreso = true;

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
                // Actualizar campo V (Ultima_Modificacion) con timestamp de modificación, no de sincronización
                const fechaModificacion = item.fecha || new Date().toLocaleString('es-MX');
                let columnasFinal = item.updates.slice();

                // Si V (Ultima_Modificacion) no está en updates, agregarlo con la fecha de modificación
                if (!columnasFinal.some(u => u.col === 'V')) {
                    columnasFinal.push({ col: 'V', value: fechaModificacion });
                } else {
                    // Si sí está, reemplazar su valor con el timestamp de modificación
                    columnasFinal = columnasFinal.map(u => 
                        u.col === 'V' ? { col: 'V', value: fechaModificacion } : u
                    );
                }

                // Determinar fila objetivo en la hoja. Preferir item.rowIndex si es válido,
                // sino buscar la fila por `expedienteId` en `App.rawData` como respaldo.
                let sheetRow = null;
                if (item.rowIndex && !isNaN(Number(item.rowIndex))) {
                    sheetRow = Number(item.rowIndex);
                } else if (item.expedienteId) {
                    const datos = App.rawData.slice(1); // evitar cabecera
                    const found = datos.findIndex(r => String(r[0]) === String(item.expedienteId));
                    if (found >= 0) sheetRow = found + 2; // slice index -> hoja (slice[0] == hoja row 2)
                }

                console.log('[sync] item', { item, sheetRow });

                if (!sheetRow) {
                    console.warn('No se pudo determinar la fila objetivo para item:', item);
                    // Evitar sobreescribir la fila 1 por defecto; saltar este item y continuar.
                    continue;
                }

                for (const u of columnasFinal) {
                    const response = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${u.col}${sheetRow}?valueInputOption=USER_ENTERED`,
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

// Sincronizar logs pendientes
await sincronizarLogsPendientes();

    } finally {
        sincronizando = false;
        window.sincronizacionEnProgreso = false;
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
// ------ Await SubirLogs --------
async function procesarLog(log) {
    try {
        // 1. Asignar fecha original si es la primera vez que se crea
        if (!log.createdAt) {
            log.createdAt = Date.now();
        }
        
        // 2. Guardar en local con el createdAt original
        await registrarLog(log);
        
        // 3. Intentar subir a Sheets
        if (navigator.onLine) {
            await subirLogSheets(log);
            
            // 4. Si fue exitoso, marcamos como sync
            log.syncedLog = true;
            // Al llamar registrarLog de nuevo, el objeto log ya tiene 
            // su createdAt original, por lo que se mantiene igual.
            await registrarLog(log); 
        }
    } catch (e) {
        console.error('Error al procesar log, quedará pendiente:', e);
    }
}
// ── Listeners de conectividad ─────────────────────────────
window.addEventListener(
    'online',
    async () => {

        toast(
            'Conexión restaurada',
            'success'
        );

        try {

            await sincronizarPendientes();

            await sincronizarLogsPendientes();

        } catch (e) {

            console.error(
                'Error sincronizando',
                e
            );
        }
    }
);

window.addEventListener('offline', () => {
    toast('Trabajando sin internet', 'warning', 5000);
});
