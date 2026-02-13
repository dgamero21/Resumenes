declare global {
  interface Window {
    google: any;
  }
}

// --- CONFIGURACIÓN REQUERIDA ---
// Para que funcione, debes generar un CLIENT ID en Google Cloud Console
// Habilitar "Gmail API" y agregar tu dominio (o localhost) a los orígenes autorizados.
const CLIENT_ID = '849467666286-u238531238531283.apps.googleusercontent.com'; // Placeholder
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

let tokenClient: any;
let accessToken: string | null = null;

export const initGmailClient = () => {
  if (typeof window !== 'undefined' && window.google) {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.error) {
            console.error(resp);
            throw resp;
          }
          accessToken = resp.access_token;
        },
      });
      console.log('Gmail Client Initialized');
    } catch (e) {
      console.error('Error initializing Gmail client', e);
    }
  }
};

export const loginToGmail = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      initGmailClient();
      if (!tokenClient) {
        return reject("La librería de Google no ha cargado. Verifica tu conexión o recarga la página.");
      }
    }

    // Sobreescribimos el callback para manejar esta promesa específica
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        return reject(resp);
      }
      accessToken = resp.access_token;
      resolve(accessToken!);
    };

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const isGmailConnected = () => !!accessToken;

export const fetchGmailMessages = async (query: string) => {
  if (!accessToken) throw new Error("AUTH_REQUIRED");

  // Endpoint: users.messages.list
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    if (response.status === 401) {
        accessToken = null; // Token expired
        throw new Error("AUTH_REQUIRED");
    }
    const err = await response.json();
    throw new Error(err.error?.message || "Error buscando en Gmail");
  }

  return await response.json();
};

export const fetchGmailMessageDetail = async (messageId: string) => {
  if (!accessToken) throw new Error("AUTH_REQUIRED");

  // Endpoint: users.messages.get
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
     const err = await response.json();
     throw new Error(err.error?.message || "Error leyendo el correo");
  }

  return await response.json();
};