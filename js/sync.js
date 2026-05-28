// ════════════════════════════════════════════════════════════
// sync.js — Consulta de datos, sincronización y logs (ESTABLE)
// Depende de: config.js, auth.js, db.js
// ════════════════════════════════════════════════════════════

async function asegurarToken() {
    if (App.accessToken && tokenVigente()) return true;
    return false; // Delegamos la renovación al flujo principal
}

async function consultarDatos() {
    if (App._entrandoApp) return;
    App._entrandoApp = true;

    try {
        // Modo Offline
        if (!navigator.onLine) {
            console.log('[Sync] Cargando desde copia local IndexedDB...');
            const locales = await obtenerExpedientesLocales();
            App.rawData = locales;
            App.filtrados = [...App.rawData];
            if (typeof renderCards === 'function') renderCards(App.filtrados);
            return;
        }

        const token = App.accessToken || localStorage.getItem('accessToken');
        if (!token) {
            console.warn('[Sync] No hay token disponible para consultar Google Sheets online.');
            const locales = await obtenerExpedientesLocales();
            App.rawData = locales;
            App.filtrados = [...App.rawData];
            if (typeof renderCards === 'function') renderCards(App.filtrados);
            return;
        }

        toast('Sincronizando expedientes...', 'success', 2000);

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A2:Y`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            console.warn("[Sync] El servidor rechazó el token. Cargando datos locales.");
            const locales = await obtenerExpedientesLocales();
            App.rawData = locales;
            App.filtrados = [...App.rawData];
            if (typeof renderCards === 'function') renderCards(App.filtrados);
            return;
        }

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const data = await response.json();
        const filas = data.values || [];

        const expedientesMapeados = filas.map((fila, index) => {
            const obj = {};
            COLUMNAS.forEach((col, idx) => {
                obj[col] = fila[idx] || '';
            });
            obj.id = obj.id || (index + 2).toString();
            return obj;
        });

        // Guardar en la IndexedDB local usando tu función real de db.js
        if (typeof actualizarTodosLosExpedientes === 'function') {
            await actualizarTodosLosExpedientes(expedientesMapeados);
        }

        App.rawData = expedientesMapeados;
        App.filtrados = [...App.rawData];
        
        if (typeof renderCards === 'function') renderCards(App.filtrados);

        // Procesar cola offline si está inicializada
        if (typeof db !== 'undefined') {
            sincronizarPendientes();
        }

    } catch (e) {
        console.error('[Sync] Error al consultar datos de Sheets:', e);
        const locales = await obtenerExpedientesLocales();
        App.rawData = locales;
        App.filtrados = [...App.rawData];
        if (typeof renderCards === 'function') renderCards(App.filtrados);
    } finally {
        App._entrandoApp = false;
    }
}

async function subirLogSheets(log) {
    if (!navigator.onLine) return;
    try {
        const token = App.accessToken || localStorage.getItem('accessToken');
        if (!token) return;

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${LOG_SHEET}!A:K:append?valueInputOption=USER_ENTERED`;
        const cuerpo = {
            values: [[
                log.logId || ('log_' + Date.now()),
                log.timestampUtc || new Date().toISOString(),
                localStorage.getItem('userEmail') || 'usuario_pwa',
                DEVICE_ID,
                log.expedienteId || '',
                log.actionType || 'UPDATE',
                JSON.stringify(log.changedFields || []),
                JSON.stringify(log.oldValues || {}),
                JSON.stringify(log.newValues || {}),
                'SYNCED',
                log.hash || ''
            ]]
        };

        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cuerpo)
        });
    } catch (e) {
        console.error('[Sync Log] No se pudo subir el log:', e);
    }
}

let sincronizando = false;
async function sincronizarPendientes() {
    if (sincronizando || !navigator.onLine || typeof db === 'undefined') return;
    sincronizando = true;

    try {
        const cola = await obtenerQueuePendiente();
        if (!cola.length) return;

        const token = App.accessToken || localStorage.getItem('accessToken');
        if (!token) return;

        for (const item of cola) {
            try {
                if (item.type === 'UPDATE_ROW') {
                    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!${item.col}${item.rowIndex}?valueInputOption=USER_ENTERED`;
                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ values: [[item.value]] })
                    });

                    if (response.status === 429) {
                        await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                }
                await eliminarQueueItem(item.queueId);
            } catch (e) {
                console.error('[Sync Pendientes] Error en fila:', e);
            }
        }
        toast('Sincronización en segundo plano completada.', 'success');
    } catch(err) {
        console.error(err);
    } finally {
        sincronizando = false;
    }
}

window.addEventListener('online', () => {
    toast('Conexión de red restaurada', 'success');
    sincronizarPendientes();
});

window.addEventListener('offline', () => {
    toast('Trabajando en modo local (Sin Internet)', 'warning', 5000);
});
