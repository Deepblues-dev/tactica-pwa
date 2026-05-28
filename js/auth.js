// ════════════════════════════════════════════════════════════
// auth.js — Autenticación OAuth, sesión local y renovación (ESTABLE)
// Depende de: config.js
// ════════════════════════════════════════════════════════════

// ── Helpers de sesión corregidos ────────────────────────────
function tokenVigente() {
    return !!(App.tokenExpira && Date.now() < App.tokenExpira);
}

function ultimaValidacionVigente() {
    const ultima = parseInt(localStorage.getItem('ultimaValidacion') || '0', 10);
    if (!ultima) return false;
    return (Date.now() - ultima) < (4 * 60 * 60 * 1000); // 4 horas
}

function sesionLocalVigente() {
    return localStorage.getItem('sesionActiva') === '1';
}

// ── Guardado y Persistencia Real (Mantiene el token vivo tras F5) ──
function guardarSesionLocal(accessToken, expiresInSeconds) {
    const durationMs = (parseInt(expiresInSeconds, 10) || 3600) * 1000;
    App.accessToken = accessToken;
    App.tokenExpira = Date.now() + durationMs;

    localStorage.setItem('accessToken', accessToken); // Guardado físico
    localStorage.setItem('tokenExpira', App.tokenExpira.toString());
    localStorage.setItem('sesionActiva', '1');
    localStorage.setItem('ultimaValidacion', Date.now().toString());
    console.log(`[Táctica Auth] Token guardado con éxito. Expira: ${new Date(App.tokenExpira).toLocaleTimeString()}`);
}

// ── Validación periódica (sin pánico) ───────────────────────
async function validarSesionPeriodicamente() {
    if (!navigator.onLine) return;
    if (App.tokenClient && App.accessToken) {
        try {
            // Intento silencioso
            App.tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.error('Error en validación periódica:', e);
        }
    }
}

// ── Obtener y guardar email sin romper la sesión ──────────
async function obtenerYGuardarEmail() {
    if (!App.accessToken) return;
    try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${App.accessToken}` }
        });
        
        if (r.status === 401) {
            console.warn('[Táctica Auth] Token no autorizado en userinfo (401). No limpiaremos la sesión para evitar bucles.');
            return;
        }

        if (r.ok) {
            const data = await r.json();
            if (data.email) {
                localStorage.setItem('userEmail', data.email);
                console.log('[Táctica Auth] Correo del abogado guardado:', data.email);
            }
        }
    } catch (e) {
        console.error('No se pudo obtener el email:', e);
    }
}

// ── Inicialización de Google Identity Services (GIS) ───────
window.initGis = async function() {
    if (typeof google === 'undefined' || !google.accounts?.oauth2) return;

    // Recuperar el token del almacenamiento físico inmediatamente al arrancar
    const tokenGuardado = localStorage.getItem('accessToken');
    const expiraGuardado = parseInt(localStorage.getItem('tokenExpira') || '0', 10);

    if (tokenGuardado && expiraGuardado > Date.now()) {
        App.accessToken = tokenGuardado;
        App.tokenExpira = expiraGuardado;
        console.log('[Táctica Auth] Token recuperado físicamente desde localStorage.');
    }

    // Configurar el cliente de Google con un callback seguro
    App.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
            if (tokenResponse?.access_token) {
                guardarSesionLocal(tokenResponse.access_token, tokenResponse.expires_in);
                entrarApp();
            } else {
                console.error('[Táctica Auth] Respuesta de Google vacía o errónea.');
                toast('Error de autenticación con Google', 'error');
            }
        }
    });

    const pantallaSplash = document.getElementById('splash-screen');
    
    // Si hay rastro de sesión activa, intentamos entrar directamente
    if (sesionLocalVigente()) {
        await entrarApp();
    } else {
        if (pantallaSplash) pantallaSplash.style.display = 'flex';
        document.getElementById('search-bar').style.display     = 'none';
        document.getElementById('btn-logout-nav').style.display = 'none';
    }
};

// ── Cierre de sesión limpio ────────────────────────────────
window.cerrarSesion = () => {
    const token = App.accessToken || localStorage.getItem('accessToken');
    if (token && typeof google !== 'undefined' && google.accounts?.oauth2) {
        try { google.accounts.oauth2.revoke(token, () => {}); } catch(e){}
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('sesionActiva');
    localStorage.removeItem('ultimaValidacion');
    localStorage.removeItem('tokenExpira');
    localStorage.removeItem('userEmail');

    App.accessToken = null;
    App.tokenExpira = 0;

    location.reload();
};

// ── Entrar a la app (post-login o refresh) ─────────────────
async function entrarApp() {
    const splash = document.getElementById('splash-screen');
    
    // Forzar apertura de la base de datos local si no se ha abierto
    if (typeof initDB === 'function' && typeof db === 'undefined') {
        try { await initDB(); } catch(e) { console.error(e); }
    }

    // Si está offline, entra con lo que tenga en IndexedDB
    if (!navigator.onLine) {
        if (splash) splash.style.display = 'none';
        document.getElementById('search-bar').style.display     = 'block';
        document.getElementById('btn-logout-nav').style.display = 'flex';
        if (typeof consultarDatos === 'function') await consultarDatos();
        return;
    }

    // Si ya tenemos el token cargado en memoria RAM o local, pasamos directo sin molestar a Google
    if (App.accessToken && tokenVigente()) {
        if (splash) splash.style.display = 'none';
        document.getElementById('search-bar').style.display     = 'block';
        document.getElementById('btn-logout-nav').style.display = 'flex';
        
        if (typeof actualizarVisibilidadBtnNuevo === 'function') {
            actualizarVisibilidadBtnNuevo();
        }
        
        await obtenerYGuardarEmail();
        if (typeof consultarDatos === 'function') await consultarDatos();
        return;
    }

    // Si la sesión dice estar activa pero el token caducó, intentamos renovación silenciosa
    if (sesionLocalVigente() && App.tokenClient) {
        try {
            console.log('[Táctica Auth] Token caducado. Intentando renovación automática...');
            App.tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.warn('[Táctica Auth] Falló renovación silenciosa. Esperando clic del usuario.');
            if (splash) splash.style.display = 'flex';
        }
    } else {
        if (splash) splash.style.display = 'flex';
    }
}

// Botón manual de inicio de sesión
window.iniciarLoginInteractivo = () => {
    if (!App.tokenClient) {
        toast('El sistema de Google no está listo. Reintenta en un momento.', 'warning');
        return;
    }
    App.tokenClient.requestAccessToken({ prompt: 'select_account' });
};

// Puentes de compatibilidad absolutos
window.iniciarSesion = () => window.iniciarLoginInteractivo();
