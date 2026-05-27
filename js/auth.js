// ════════════════════════════════════════════════════════════
// auth.js — Autenticación OAuth, sesión local y renovación
// Depende de: config.js
// ════════════════════════════════════════════════════════════

// ── Helpers de sesión ────────────────────────────────────
function tokenVigente() {
    return !!(App.tokenExpira && Date.now() < App.tokenExpira);
}

function ultimaValidacionVigente() {
    const ultima = parseInt(localStorage.getItem('ultimaValidacion') || '0', 10);
    if (!ultima) return false;
    return (Date.now() - ultima) < (4 * 60 * 60 * 1000); // 4 horas
}

function sesionLocalVigente() {
    return localStorage.getItem('sesionActiva') === '1' &&
           ultimaValidacionVigente();
}

// ── Validación periódica (llamada cada 120 min) ───────────
async function validarSesionPeriodicamente() {

    if (!navigator.onLine) {
        if (!ultimaValidacionVigente()) {
            toast('La sesión debe validarse nuevamente.', 'warning', 6000);
            window.cerrarSesion();
        }
        return;
    }

    if (App.tokenClient && App.accessToken) {
        try {
            App.tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.error('Error validando sesión:', e);
        }
    }
}

// ── Obtener y guardar email (login_hint para renovaciones) ─
async function obtenerYGuardarEmail() {
    if (!App.accessToken) return;
    if (localStorage.getItem('userEmail')) return;

    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + App.accessToken }
        });
        if (!res.ok) return;
        const info = await res.json();
        if (info.email) {
            localStorage.setItem('userEmail', info.email);
            console.log('[Táctica] Email guardado para login_hint:', info.email);
        }
    } catch (e) {
        console.warn('[Táctica] No se pudo obtener email:', e);
    }
}

// ── Renovar token silenciosamente ─────────────────────────
function renovarToken() {
    if (App.tokenClient && navigator.onLine) {
        App.tokenClient.requestAccessToken({ prompt: '' });
    }
}

// ── Inicializar Google Identity Services ─────────────────
window.initGis = async function () {

    await initDB();

    App.tokenClient = google.accounts.oauth2.initTokenClient({

        client_id : CLIENT_ID,
        scope     : 'https://www.googleapis.com/auth/spreadsheets',

        callback: (tokenResponse) => {

            if (tokenResponse && tokenResponse.access_token) {

                App.accessToken = tokenResponse.access_token;
                App.tokenExpira = Date.now() + (8 * 60 * 60 * 1000);

                localStorage.setItem('ultimaValidacion', Date.now().toString());
                localStorage.setItem('sesionActiva', '1');
                localStorage.setItem('tokenExpira', App.tokenExpira.toString());

                if (!App.timerRenovacion) {
                    App.timerRenovacion = setInterval(
                        validarSesionPeriodicamente,
                        120 * 60 * 1000
                    );
                }

                if (App._silenciosoTimeout) {
                    clearTimeout(App._silenciosoTimeout);
                    App._silenciosoTimeout = null;
                }

                if (!App._entrandoApp) {
                    App._entrandoApp = true;
                    entrarApp().finally(() => { App._entrandoApp = false; });
                }
            }
        }
    });

    // ── Auto-login en refresh ─────────────────────────────
    if (sesionLocalVigente()) {

        App.tokenExpira = parseInt(localStorage.getItem('tokenExpira') || '0');

        if (!App._entrandoApp) {
            App._entrandoApp = true;
            entrarApp().finally(() => { App._entrandoApp = false; });
        }

        if (navigator.onLine) {
            const emailGuardado = localStorage.getItem('userEmail') || '';

            App._silenciosoTimeout = setTimeout(() => {
                App._silenciosoTimeout = null;
                console.warn('[Táctica] Token silencioso: timeout. Usando datos locales.');
            }, 12000);

            try {
                App.tokenClient.requestAccessToken({
                    prompt    : '',
                    login_hint: emailGuardado
                });
            } catch (e) {
                clearTimeout(App._silenciosoTimeout);
                App._silenciosoTimeout = null;
                console.warn('[Táctica] Token silencioso: error.', e);
            }
        }
    }
};

// ── Login explícito (botón INGRESAR) ─────────────────────
window.iniciarSesion = async () => {
    try {
        if (typeof google === 'undefined' || !google.accounts?.oauth2) {
            toast('Cargando servicio de autenticación. Intenta en unos segundos.', 'warning', 5000);
            return;
        }
        if (!App.tokenClient) {
            toast('No se pudo inicializar el inicio de sesión.', 'error', 6000);
            return;
        }
        App.tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
        console.error('Error en iniciarSesion:', e);
        toast('No se pudo iniciar sesión.', 'error', 6000);
    }
};

// ── Cerrar sesión ────────────────────────────────────────
window.cerrarSesion = () => {

    if (App.accessToken && typeof google !== 'undefined' && google.accounts?.oauth2) {
        google.accounts.oauth2.revoke(App.accessToken, () => {});
    }

    if (App.timerRenovacion) {
        clearInterval(App.timerRenovacion);
        App.timerRenovacion = null;
    }

    localStorage.removeItem('sesionActiva');
    localStorage.removeItem('ultimaValidacion');
    localStorage.removeItem('tokenExpira');
    localStorage.removeItem('userEmail');

    App.accessToken = null;
    App.tokenExpira = 0;
    App.tokenClient = null;

    location.reload();
};

// ── Entrar a la app (post-login o refresh) ───────────────
async function entrarApp() {

    document.getElementById('splash-screen').style.display  = 'none';
    document.getElementById('search-bar').style.display     = 'block';
    document.getElementById('btn-logout-nav').style.display = 'flex';

    // Controlar visibilidad del botón Nuevo Expediente
    actualizarVisibilidadBtnNuevo();

    if (!navigator.onLine) {
        await consultarDatos();
        return;
    }

    if (App.accessToken) {
        obtenerYGuardarEmail();
        await consultarDatos();
        return;
    }

    if (tokenVigente() && App.tokenClient) {
        try {
            App.tokenClient.requestAccessToken({ prompt: '' });
            return;
        } catch (e) {
            console.error('No se pudo renovar el token:', e);
        }
    }

    await consultarDatos();
}
