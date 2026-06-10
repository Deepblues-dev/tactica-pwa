console.log('AUTH NUEVO CARGADO');
// ════════════════════════════════════════════════════════════
// auth.js — Autenticación OAuth, sesión local y renovación
// Depende de: config.js
// ════════════════════════════════════════════════════════════

// ── Helpers de sesión ────────────────────────────────────
function tokenVigente() {
    return !!(
        App.accessToken &&
        App.tokenExpira &&
        Date.now() < App.tokenExpira
    );
}

function tokenExpiraVigente() {
    return !!(
        App.tokenExpira &&
        Date.now() < App.tokenExpira
    );
}

function ultimaValidacionVigente() {
    const ultima = parseInt(localStorage.getItem('ultimaValidacion') || '0', 10);
    if (!ultima) return false;
    return (Date.now() - ultima) < ( 60 * 60 * 1000); // 1 hora
}
function sesionLocalVigente() {
    return localStorage.getItem('sesionActiva') === '1' &&
           (ultimaValidacionVigente() || tokenExpiraVigente());
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

        const res = await fetch(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            {
                headers: {
                    'Authorization': 'Bearer ' + App.accessToken
                }
            }
        );

      if (res.status === 401) {
            console.warn('[OAuth] No se pudo obtener userinfo: token inválido o scope insuficiente.');
            return;
        }

        if (!res.ok) {
            console.warn('[OAuth] Error obteniendo userinfo:', res.status, res.statusText);
            return;
        }

        const info = await res.json();

        if (info.email) {

            localStorage.setItem('userEmail', info.email);

            console.log('[OAuth] Email guardado:', info.email);
        }

    } catch (e) {

        console.warn('[OAuth] Error obteniendo email:', e);
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
        scope     : 'https://www.googleapis.com/auth/spreadsheets openid email',

        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {

   App.accessToken = tokenResponse.access_token;

   App.tokenExpira =
       Date.now() + ((tokenResponse.expires_in || 3600) * 1000);

   localStorage.setItem(
       'ultimaValidacion',
       Date.now().toString()
   );

   localStorage.setItem(
       'sesionActiva',
       '1'
   );

   localStorage.setItem(
       'tokenExpira',
       App.tokenExpira.toString()
   );

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

    App.tokenExpira =
        parseInt(localStorage.getItem('tokenExpira') || '0');
       
        // Entrar inmediatamente con datos locales (sin esperar red ni token)
        if (!App._entrandoApp) {
            App._entrandoApp = true;
            entrarApp().finally(() => { App._entrandoApp = false; });
        }

        // Renovación silenciosa: solo si el token de memoria sigue vigente
        // y hay conexión disponible.
        // IMPORTANTE: en Chrome Android, requestAccessToken fuera de un
        // gesto de usuario puede mostrar el selector de cuenta aunque
        // prompt='' si la cookie de Google expiró. Para evitarlo:
        // - Solo se intenta si tokenExpira indica que el token SIGUE vigente
        //   (significa que Google aún tiene la sesión activa en el dispositivo)
        // - Si el token ya expiró, NO intentar silencioso automático en móvil;
        //   esperar a que el usuario haga una acción (sincronizar, editar)
        //   para disparar la renovación en contexto de gesto.
        const emailGuardado = localStorage.getItem('userEmail') || '';
        if (navigator.onLine && tokenVigente()) {

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
        // Si el token expiró: la app entra con datos locales (offline mode).
        // El token se renovará la próxima vez que el usuario interactúe
        // con una función que requiera red (editar, sincronizar).
    }
};

// ── Login explícito (botón INGRESAR) ─────────────────────
window.iniciarSesion = async () => {

    const btn = document.getElementById('btn-login');
    const textoOriginal = btn ? btn.textContent : '';

    try {
        // Si GIS aún no cargó, esperar hasta 15s con feedback visual
        if (typeof google === 'undefined' || !google.accounts?.oauth2 || !App.tokenClient) {

            if (btn) btn.textContent = 'Conectando...';

            let intentos = 0;
            while ((typeof google === 'undefined' || !google.accounts?.oauth2 || !App.tokenClient) && intentos < 30) {
                await new Promise(r => setTimeout(r, 500));
                intentos++;
            }

            if (typeof google === 'undefined' || !App.tokenClient) {
                toast('Sin conexión al servicio de Google. Verifica tu internet.', 'error', 6000);
                if (btn) btn.textContent = textoOriginal;
                return;
            }
        }

        App.tokenClient.requestAccessToken({ prompt: 'select_account' });

    } catch (e) {
        console.error('Error en iniciarSesion:', e);
        toast('No se pudo iniciar sesión.', 'error', 6000);
    } finally {
        if (btn) btn.textContent = textoOriginal;
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

    if (!localStorage.getItem('userEmail')) {

        obtenerYGuardarEmail();

    }

    await consultarDatos();

    return;
}

    if (
        navigator.onLine &&
        App.tokenClient &&
        localStorage.getItem('userEmail')
    ) {
        try {
            App.tokenClient.requestAccessToken({
                prompt: '',
                login_hint: localStorage.getItem('userEmail')
            });

            return;

        } catch (e) {
            console.error(
                'No se pudo recuperar la sesión:',
                e
            );
        }
    }
    await consultarDatos();
}

window.validarCredenciales = function () {

    if (!App.tokenClient) {

        toast(
            'Sistema de autenticación no disponible.',
            'warning',
            4000
        );

        return;
    }

    App.tokenClient.requestAccessToken({
        prompt: 'select_account'
    });
