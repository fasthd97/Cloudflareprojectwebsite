// Okta Authentication Integration
// Modern OAuth 2.0 + OIDC implementation with PKCE

class OktaAuth {
    constructor(config) {
        this.domain = config.domain;
        this.clientId = config.clientId;
        this.issuer = config.issuer || `https://${config.domain}/oauth2/default`;
        this.redirectUri = config.redirectUri || window.location.origin + '/auth/callback';
        this.logoutUri = config.logoutUri || window.location.origin + '/auth/logout';
        this.scopes = config.scopes || ['openid', 'profile', 'email'];
        
        this.currentUser = null;
        this.accessToken = null;
        this.idToken = null;
        this.refreshToken = null;
        
        this.init();
    }

    async init() {
        // Check for tokens in URL (OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state) {
            await this.handleCallback(code, state);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            // Check for existing session
            this.loadTokensFromStorage();
            if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
                await this.getCurrentUser();
            } else if (this.refreshToken) {
                await this.refreshAccessToken();
            }
        }
    }

    // OAuth 2.0 with PKCE flow
    async login() {
        try {
            // Generate PKCE parameters
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            const state = this.generateState();
            const nonce = this.generateNonce();

            // Store PKCE parameters
            sessionStorage.setItem('pkce_code_verifier', codeVerifier);
            sessionStorage.setItem('oauth_state', state);
            sessionStorage.setItem('oauth_nonce', nonce);

            // Build authorization URL
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: this.clientId,
                redirect_uri: this.redirectUri,
                scope: this.scopes.join(' '),
                state: state,
                nonce: nonce,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });

            // Redirect to Okta
            window.location.href = `${this.issuer}/v1/authorize?${params.toString()}`;
        } catch (error) {
            console.error('Login initiation error:', error);
            throw error;
        }
    }

    async handleCallback(code, state) {
        try {
            // Validate state parameter
            const storedState = sessionStorage.getItem('oauth_state');
            if (state !== storedState) {
                throw new Error('Invalid state parameter');
            }

            // Get PKCE code verifier
            const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
            if (!codeVerifier) {
                throw new Error('Missing PKCE code verifier');
            }

            // Clean up session storage
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_nonce');
            sessionStorage.removeItem('pkce_code_verifier');

            // Exchange code for tokens
            const tokenResponse = await fetch(`${this.issuer}/v1/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: this.clientId,
                    code: code,
                    redirect_uri: this.redirectUri,
                    code_verifier: codeVerifier
                })
            });

            if (!tokenResponse.ok) {
                const error = await tokenResponse.json();
                throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
            }

            const tokens = await tokenResponse.json();
            
            this.accessToken = tokens.access_token;
            this.idToken = tokens.id_token;
            this.refreshToken = tokens.refresh_token;
            
            // Validate ID token
            await this.validateIdToken(this.idToken);
            
            // Store tokens
            this.saveTokensToStorage();
            
            // Get user info
            await this.getCurrentUser();
            
            return true;
        } catch (error) {
            console.error('Callback handling error:', error);
            this.clearTokens();
            throw error;
        }
    }

    async getCurrentUser() {
        if (!this.accessToken) return null;

        try {
            const response = await fetch(`${this.issuer}/v1/userinfo`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                this.currentUser = await response.json();
                return this.currentUser;
            } else {
                throw new Error('Failed to get user info');
            }
        } catch (error) {
            console.error('Get user error:', error);
            if (this.refreshToken) {
                // Try to refresh token
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return this.getCurrentUser();
                }
            }
            this.clearTokens();
            return null;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) return false;

        try {
            const response = await fetch(`${this.issuer}/v1/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: this.clientId,
                    refresh_token: this.refreshToken
                })
            });

            if (response.ok) {
                const tokens = await response.json();
                
                this.accessToken = tokens.access_token;
                if (tokens.id_token) {
                    this.idToken = tokens.id_token;
                }
                if (tokens.refresh_token) {
                    this.refreshToken = tokens.refresh_token;
                }
                
                this.saveTokensToStorage();
                await this.getCurrentUser();
                
                return true;
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearTokens();
            return false;
        }
    }

    async logout() {
        const idToken = this.idToken;
        
        // Clear local tokens first
        this.clearTokens();
        
        // Redirect to Okta logout
        if (idToken) {
            const params = new URLSearchParams({
                id_token_hint: idToken,
                post_logout_redirect_uri: this.logoutUri
            });
            
            window.location.href = `${this.issuer}/v1/logout?${params.toString()}`;
        } else {
            // Fallback logout
            window.location.href = this.logoutUri;
        }
    }

    // Validation and utility methods
    async validateIdToken(idToken) {
        try {
            // Basic JWT structure validation
            const parts = idToken.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid ID token format');
            }

            // Decode payload
            const payload = JSON.parse(atob(parts[1]));
            
            // Validate issuer
            if (payload.iss !== this.issuer) {
                throw new Error('Invalid issuer');
            }
            
            // Validate audience
            if (payload.aud !== this.clientId) {
                throw new Error('Invalid audience');
            }
            
            // Validate expiration
            if (payload.exp * 1000 < Date.now()) {
                throw new Error('ID token expired');
            }
            
            // Validate nonce if present
            const storedNonce = sessionStorage.getItem('oauth_nonce');
            if (storedNonce && payload.nonce !== storedNonce) {
                throw new Error('Invalid nonce');
            }
            
            return payload;
        } catch (error) {
            throw new Error(`ID token validation failed: ${error.message}`);
        }
    }

    isAuthenticated() {
        return this.accessToken && !this.isTokenExpired(this.accessToken) && this.currentUser;
    }

    getAccessToken() {
        return this.accessToken;
    }

    getIdToken() {
        return this.idToken;
    }

    getUser() {
        return this.currentUser;
    }

    // PKCE utility methods
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(digest));
    }

    base64URLEncode(array) {
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    generateState() {
        return this.base64URLEncode(crypto.getRandomValues(new Uint8Array(32)));
    }

    generateNonce() {
        return this.base64URLEncode(crypto.getRandomValues(new Uint8Array(16)));
    }

    isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp * 1000 < Date.now();
        } catch {
            return true;
        }
    }

    saveTokensToStorage() {
        if (this.accessToken) {
            localStorage.setItem('okta_access_token', this.accessToken);
        }
        if (this.idToken) {
            localStorage.setItem('okta_id_token', this.idToken);
        }
        if (this.refreshToken) {
            localStorage.setItem('okta_refresh_token', this.refreshToken);
        }
    }

    loadTokensFromStorage() {
        this.accessToken = localStorage.getItem('okta_access_token');
        this.idToken = localStorage.getItem('okta_id_token');
        this.refreshToken = localStorage.getItem('okta_refresh_token');
    }

    clearTokens() {
        this.accessToken = null;
        this.idToken = null;
        this.refreshToken = null;
        this.currentUser = null;
        localStorage.removeItem('okta_access_token');
        localStorage.removeItem('okta_id_token');
        localStorage.removeItem('okta_refresh_token');
    }
}

// Enhanced Resume App with Okta Integration
class OktaResumeApp extends ResumeApp {
    constructor() {
        super();
        
        // Initialize Okta auth
        this.oktaAuth = new OktaAuth({
            domain: window.OKTA_CONFIG?.domain,
            clientId: window.OKTA_CONFIG?.clientId,
            issuer: window.OKTA_CONFIG?.issuer,
            redirectUri: window.OKTA_CONFIG?.redirectUri,
            logoutUri: window.OKTA_CONFIG?.logoutUri,
            scopes: window.OKTA_CONFIG?.scopes
        });
        
        // Override parent methods
        this.setupOktaAuth();
    }

    setupOktaAuth() {
        // Override the checkAuthStatus method
        this.checkAuthStatus = () => {
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const protectedSection = document.getElementById('protected');

            if (this.oktaAuth.isAuthenticated()) {
                loginBtn?.classList.add('hidden');
                logoutBtn?.classList.remove('hidden');
                protectedSection?.classList.remove('hidden');
                
                // Update logout button with user info
                const user = this.oktaAuth.getUser();
                if (user && logoutBtn) {
                    logoutBtn.textContent = `Logout (${user.preferred_username || user.email})`;
                }
            } else {
                loginBtn?.classList.remove('hidden');
                logoutBtn?.classList.add('hidden');
                protectedSection?.classList.add('hidden');
                if (logoutBtn) {
                    logoutBtn.textContent = 'Logout';
                }
            }
        };

        // Override login method
        this.showLoginModal = async () => {
            try {
                await this.oktaAuth.login();
            } catch (error) {
                this.showNotification('Login failed: ' + error.message, 'error');
            }
        };

        // Override logout method
        this.logout = async () => {
            try {
                await this.oktaAuth.logout();
            } catch (error) {
                this.showNotification('Logout failed: ' + error.message, 'error');
            }
        };

        // Override API calls to use Okta tokens
        this.makeAuthenticatedRequest = async (url, options = {}) => {
            const token = this.oktaAuth.getAccessToken();
            
            return fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                }
            });
        };
    }

    async loadProtectedContent() {
        if (!this.oktaAuth.isAuthenticated()) return;

        try {
            await Promise.all([
                this.loadPhotos(),
                this.loadDocuments()
            ]);
        } catch (error) {
            console.error('Error loading protected content:', error);
            this.showNotification('Error loading protected content', 'error');
        }
    }

    async loadPhotos() {
        const photoGallery = document.getElementById('photoGallery');
        if (!photoGallery) return;

        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiUrl}/api/protected/photos`);

            if (response.ok) {
                const photos = await response.json();
                this.renderPhotos(photos);
            } else if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.oktaAuth.refreshAccessToken();
                if (!refreshed) {
                    await this.oktaAuth.logout();
                }
            } else {
                throw new Error('Failed to load photos');
            }
        } catch (error) {
            console.error('Error loading photos:', error);
            photoGallery.innerHTML = '<p>Error loading photos</p>';
        }
    }

    async loadDocuments() {
        const documentsList = document.getElementById('documentsList');
        if (!documentsList) return;

        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiUrl}/api/protected/documents`);

            if (response.ok) {
                const documents = await response.json();
                this.renderDocuments(documents);
            } else if (response.status === 401) {
                // Try to refresh token
                const refreshed = await this.oktaAuth.refreshAccessToken();
                if (!refreshed) {
                    await this.oktaAuth.logout();
                }
            } else {
                throw new Error('Failed to load documents');
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            documentsList.innerHTML = '<p>Error loading documents</p>';
        }
    }
}

// Auto-initialize if Okta config is available
document.addEventListener('DOMContentLoaded', () => {
    if (window.OKTA_CONFIG) {
        window.app = new OktaResumeApp();
    } else {
        // Fallback to basic auth
        window.app = new ResumeApp();
    }
});