// ════════════════════════════════════════════════════════════
// sync.js — Consulta de datos, sincronización y logs (REFACTORIZADO)
// Depende de: config.js, auth.js, db.js
// ════════════════════════════════════════════════════════════

// Asegura el token delegando de manera segura en el AuthManagerInstance
async function asegurarToken() {
    try {
        const token = await window.AuthManagerInstance.getValidToken();
        return !!token;
    } catch (e) {
        console.warn("[Sync] No se pudo asegurar el token:", e.message);
        return false;
    }
}

// Consulta estructurada de expedientes a Google Sheets
async function consultarDatos() {
    if (App._entrandoApp) return;
    App._entrandoApp = true;

    try {
        if (!navigator.onLine) {
            console.log('[Sync] Modo Offline: Cargando desde IndexedDB local...');
            const locales = await obtenerExpedientesLocales();
            App.rawData = locales;
            App.filtrados = [...App.rawData];
            if (typeof renderCards === 'function') renderCards(App.filtrados);
            return;
        }

        // Obtener el token validado por el Mutex
        let token;
        try {
            token = await window.AuthManagerInstance.getValidToken();
        } catch(err) {
            console.log('[Sync] Redirigiendo a carga local por falta de credenciales online.');
            const locales = await obtenerExpedientesLocales();
            App.rawData = locales;
            App.filtrados = [...App.rawData];
            if (typeof renderCards === 'function') renderCards(App.filtrados);
            return;
        }

        toast('Sincronizando con Google Sheets...', 'success', 2000);

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/DB!A2:Y`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            // Si el servidor rechaza el token por otra razón, limpiamos y reintentamos de forma interactiva
            window.AuthManagerInstance.clearSessionLocal();
            toast('Sesión expirada. Por favor vuelve a iniciar sesión.', 'warning');
            return;
        }

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

        const data = await response.json();
        const filas = data.values || [];

        const expedientesMapeados = filas.map((fila, index) => {
            const obj = {};
            COLUMNAS.forEach((col, idx) => {
                obj[col] = fila[idx] || '';
            });
            obj.id = obj.id || (index + 2).toString(); // ID o Fila
            return obj;
        });

        // Guardar la copia fresca en IndexedDB local
        await vaciarYGuardarExpedientes(expedientesMapeados);

        App.rawData = expedientesMapeados;
        App.filtrados = [...App.rawData];
        
        if (typeof renderCards === 'function') renderCards(App.filtrados);

        // Intentar procesar cambios pendientes en cola offline de haberlos
        sincronizarPendientes();

    } catch (e) {
        console.error('[Sync] Error al consultar datos:', e);
        toast('Cargando datos locales (Sin conexión al servidor)...', 'warning');
        const locales = await obtenerExpedientesLocales();
        App.rawData = locales;
        App.filtrados = [...App.rawData];
        if (typeof renderCards === 'function') renderCards(App.filtrados);
    } finally {
        App.App._entrandoApp = false;
    }
}

// Subir bitácora de auditoría legal limpia
async function subirLogSheets(log) {
    if (!navigator.onLine) return;
    try {
        const token = await window.AuthManagerInstance.getValidToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${LOG_SHEET}!A:K:append?valueInputOption=USER_ENTERED`;
        
        // Estructura normalizada e ideal sugerida por el Master Prompt
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
        console.error('[Sync Log] No se pudo subir el log a Sheets:', e);
    }
}

// Sincronizar cola de pendientes offline de forma segura
let sincronizando = false;
async function sincronizarPendientes() {
    if (sincronizando || !navigator.onLine) return;
    sincronizando = true;

    try {
        const cola = await obtenerQueuePendiente();
        if (!cola.length) return;

        const token = await window.AuthManagerInstance.getValidToken();

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
                        await new Promise(r => setTimeout(r, 2000)); // Espera por cuota de Google API
                        continue;
                    }
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                }
                await eliminarQueueItem(item.queueId);
            } catch (e) {
                console.error('[Sync Pendientes] Error en item:', e);
            }
        }
        toast('Sincronización en segundo plano completada.', 'success');
    } finally {
        sincronizando = false;
    }
}

// Listeners automáticos de red
window.addEventListener('online', () => {
    toast('Conexión de red restaurada', 'success');
    sincronizarPendientes();
});

window.addEventListener('offline', () => {
    toast('Trabajando en modo local (Sin Internet)', 'warning', 5000);
});