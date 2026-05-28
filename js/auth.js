// ════════════════════════════════════════════════════════════
// auth.js — Autenticación OAuth, sesión local y renovación (REFACTORIZADO)
// Depende de: config.js
// ════════════════════════════════════════════════════════════

class AuthManager {
    constructor() {
        this.STORAGE_KEY = 'tactica_auth_session';
        this._isRefreshing = false;
        this._refreshSubscribers = [];
        this._restoreSession();
    }

    // Restaura el token del almacenamiento al reiniciar la app
    _restoreSession() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const session = JSON.parse(stored);
                // Si el token aún es válido en tiempo real, lo montamos en memoria
                if (session.tokenExpira && Date.now() < session.tokenExpira) {
                    App.accessToken = session.accessToken;
                    App.tokenExpira = session.tokenExpira;
                    console.log('[Táctica Auth] Sesión válida restaurada desde almacenamiento.');
                } else {
                    this.clearSessionLocal();
                }
            }
        } catch (e) {
            console.error('[Táctica Auth] Error al restaurar sesión:', e);
            this.clearSessionLocal();
        }
    }

    // Guarda el token físicamente en el navegador
    saveSession(accessToken, expiresInSeconds) {
        // Si Google no da tiempo, usamos 1 hora por defecto (3600s)
        const durationMs = (parseInt(expiresInSeconds, 10) || 3600) * 1000;
        App.accessToken = accessToken;
        App.tokenExpira = Date.now() + durationMs;

        const sessionData = {
            accessToken: App.accessToken,
            tokenExpira: App.tokenExpira
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        localStorage.setItem('tokenExpira', App.tokenExpira.toString());
        localStorage.setItem('sesionActiva', '1');
        localStorage.setItem('ultimaValidacion', Date.now().toString());
        console.log(`[Táctica Auth] Token guardado. Expira en: ${new Date(App.tokenExpira).toLocaleTimeString()}`);
    }

    clearSessionLocal() {
        App.accessToken = null;
        App.tokenExpira = 0;
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem('sesionActiva');
        localStorage.removeItem('ultimaValidacion');
        localStorage.removeItem('tokenExpira');
        localStorage.removeItem('userEmail');
    }

    // Bloqueo Mutex para evitar que múltiples peticiones pidan un token al mismo tiempo
    async getValidToken() {
        if (App.accessToken && Date.now() < App.tokenExpira) {
            return App.accessToken;
        }

        if (!navigator.onLine || !App.tokenClient) {
            throw new Error("OFFLINE_OR_NO_CLIENT");
        }

        if (this._isRefreshing) {
            return new Promise((resolve, reject) => {
                this._refreshSubscribers.push({ resolve, reject });
            });
        }

        this._isRefreshing = true;
        console.log('[Táctica Auth] Token expirado o ausente. Solicitando renovación silenciosa...');

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this._isRefreshing = false;
                reject(new Error("Timeout esperando respuesta de Google"));
            }, 10000);

            App.tokenClient.callback = (tokenResponse) => {
                clearTimeout(timeoutId);
                this._isRefreshing = false;

                if (tokenResponse?.access_token) {
                    this.saveSession(tokenResponse.access_token, tokenResponse.expires_in);
                    
                    // Resolver la petición actual y todas las que estaban formadas
                    resolve(tokenResponse.access_token);
                    this._refreshSubscribers.forEach(sub => sub.resolve(tokenResponse.access_token));
                    this._refreshSubscribers = [];
                } else {
                    this.clearSessionLocal();
                    const err = new Error("Google denegó el token");
                    reject(err);
                    this._refreshSubscribers.forEach(sub => sub.reject(err));
                    this._refreshSubscribers = [];
                }
            };

            try {
                // Solicitar token de forma silenciosa sin interrumpir al abogado
                App.tokenClient.requestAccessToken({ prompt: '' });
            } catch (e) {
                this._isRefreshing = false;
                reject(e);
            }
        });
    }
}

// Inicializar el gestor globalmente
window.AuthManagerInstance = new AuthManager();

// ── Helpers de compatibilidad con tu código actual ────────────────
function tokenVigente() {
    return !!(App.tokenExpira && Date.now() < App.tokenExpira);
}

function ultimaValidacionVigente() {
    const ultima = parseInt(localStorage.getItem('ultimaValidacion') || '0', 10);
    if (!ultima) return false;
    return (Date.now() - ultima) < (4 * 60 * 60 * 1000); // 4 horas
}

function sesionLocalVigente() {
    return localStorage.getItem('sesionActiva') === '1' && (App.accessToken || tokenVigente());
}

// Validación periódica sin loops infinitos
async function validarSesionPeriodicamente() {
    if (!navigator.onLine) return;
    try {
        await window.AuthManagerInstance.getValidToken();
    } catch (e) {
        console.error('Error en validación periódica:', e);
    }
}

// Obtener email del usuario logueado
async function obtenerYGuardarEmail() {
    if (!App.accessToken) return;
    try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${App.accessToken}` }
        });
        
        if (r.status === 401) {
            console.warn('[Táctica Auth] El token guardado fue rechazado por Google (401). Limpiando...');
            window.AuthManagerInstance.clearSessionLocal();
            const splash = document.getElementById('splash-screen');
            if (splash) splash.style.display = 'flex';
            return;
        }

        if (r.ok) {
            const data = await r.json();
            if (data.email) localStorage.setItem('userEmail', data.email);
        }
    } catch (e) {
        console.error('No se pudo obtener el email:', e);
    }
}

// Inicialización de Google Identity Services adaptado
window.initGis = async function() {
    if (typeof google === 'undefined' || !google.accounts?.oauth2) return;

    App.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        callback: '' // Se sobreescribe dinámicamente en el Mutex
    });

    const pantallaSplash = document.getElementById('splash-screen');
    
    if (sesionLocalVigente()) {
        await entrarApp();
    } else {
        if (pantallaSplash) pantallaSplash.style.display = 'flex';
        document.getElementById('search-bar').style.display     = 'none';
        document.getElementById('btn-logout-nav').style.display = 'none';
    }
};

// Cierre de sesión limpio
window.cerrarSesion = () => {
    if (App.accessToken && typeof google !== 'undefined' && google.accounts?.oauth2) {
        try {
            google.accounts.oauth2.revoke(App.accessToken, () => {});
        } catch(e){}
    }
    if (App.timerRenovacion) {
        clearInterval(App.timerRenovacion);
        App.timerRenovacion = null;
    }
    window.AuthManagerInstance.clearSessionLocal();
    location.reload();
};

// Entrar a la app de forma segura
async function entrarApp() {
    const splash = document.getElementById('splash-screen');
    
    if (!navigator.onLine) {
        if (splash) splash.style.display = 'none';
        document.getElementById('search-bar').style.display     = 'block';
        document.getElementById('btn-logout-nav').style.display = 'flex';
        if (typeof consultarDatos === 'function') await consultarDatos();
        return;
    }

    try {
        // Forzar a verificar si el token actual realmente sirve
        await window.AuthManagerInstance.getValidToken();
        
        if (splash) splash.style.display = 'none';
        document.getElementById('search-bar').style.display     = 'block';
        document.getElementById('btn-logout-nav').style.display = 'flex';

        if (typeof actualizarVisibilidadBtnNuevo === 'function') {
            actualizarVisibilidadBtnNuevo();
        }

        await obtenerYGuardarEmail();
        if (typeof consultarDatos === 'function') await consultarDatos();
    } catch (e) {
        console.error("Error controlado al entrar a la app:", e);
        window.AuthManagerInstance.clearSessionLocal();
        if (splash) splash.style.display = 'flex';
    }
};
window.iniciarLoginInteractivo = () => {
    if (!App.tokenClient) return;
    App.tokenClient.callback = (tokenResponse) => {
        if (tokenResponse?.access_token) {
            window.AuthManagerInstance.saveSession(tokenResponse.access_token, tokenResponse.expires_in);
            entrarApp();
        } else {
            toast('Error de autenticación con Google', 'error');
        }
    };
    App.tokenClient.requestAccessToken({ prompt: 'select_account' });
};

// Puente de compatibilidad para arreglar el error del botón del HTML
window.iniciarSesion = () => window.iniciarLoginInteractivo();
