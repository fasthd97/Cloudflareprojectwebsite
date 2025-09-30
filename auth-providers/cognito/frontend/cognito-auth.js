// AWS Cognito Authentication Integration
// Drop-in replacement for the basic JWT auth system

class CognitoAuth {
    constructor(config) {
        this.userPoolId = config.userPoolId;
        this.clientId = config.clientId;
        this.domain = config.domain;
        this.redirectUri = config.redirectUri || window.location.origin + '/auth/callback';
        this.logoutUri = config.logoutUri || window.location.origin + '/auth/logout';
        
        this.currentUser = null;
        this.accessToken = null;
        this.idToken = null;
        
        this.init();
    }

    async init() {
        // Check for tokens in URL (OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            await this.handleCallback(code);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            // Check for existing session
            this.loadTokensFromStorage();
            if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
                await this.getCurrentUser();
            }
        }
    }

    // OAuth 2.0 Authorization Code Flow
    login() {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            scope: 'email openid profile',
            state: this.generateState()
        });

        // Store state for validation
        sessionStorage.setItem('oauth_state', params.get('state'));
        
        // Redirect to Cognito hosted UI
        window.location.href = `${this.domain}/oauth2/authorize?${params.toString()}`;
    }

    async handleCallback(code) {
        try {
            // Validate state parameter
            const urlParams = new URLSearchParams(window.location.search);
            const state = urlParams.get('state');
            const storedState = sessionStorage.getItem('oauth_state');
            
            if (state !== storedState) {
                throw new Error('Invalid state parameter');
            }
            
            sessionStorage.removeItem('oauth_state');

            // Exchange code for tokens
            const tokenResponse = await fetch(`${this.domain}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: this.clientId,
                    code: code,
                    redirect_uri: this.redirectUri
                })
            });

            if (!tokenResponse.ok) {
                throw new Error('Token exchange failed');
            }

            const tokens = await tokenResponse.json();
            
            this.accessToken = tokens.access_token;
            this.idToken = tokens.id_token;
            
            // Store tokens
            this.saveTokensToStorage();
            
            // Get user info
            await this.getCurrentUser();
            
            return true;
        } catch (error) {
            console.error('Callback handling error:', error);
            this.clearTokens();
            return false;
        }
    }

    async getCurrentUser() {
        if (!this.accessToken) return null;

        try {
            const response = await fetch(`${this.domain}/oauth2/userInfo`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
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
            this.clearTokens();
            return null;
        }
    }

    logout() {
        // Clear local tokens
        this.clearTokens();
        
        // Redirect to Cognito logout
        const params = new URLSearchParams({
            client_id: this.clientId,
            logout_uri: this.logoutUri
        });
        
        window.location.href = `${this.domain}/logout?${params.toString()}`;
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

    // Utility methods
    generateState() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
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
            localStorage.setItem('cognito_access_token', this.accessToken);
        }
        if (this.idToken) {
            localStorage.setItem('cognito_id_token', this.idToken);
        }
    }

    loadTokensFromStorage() {
        this.accessToken = localStorage.getItem('cognito_access_token');
        this.idToken = localStorage.getItem('cognito_id_token');
    }

    clearTokens() {
        this.accessToken = null;
        this.idToken = null;
        this.currentUser = null;
        localStorage.removeItem('cognito_access_token');
        localStorage.removeItem('cognito_id_token');
    }

    // Admin methods for user management
    async createUser(email, temporaryPassword) {
        // This would typically be done server-side
        // Included here for completeness
        try {
            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({ email, temporaryPassword })
            });

            return response.ok;
        } catch (error) {
            console.error('Create user error:', error);
            return false;
        }
    }
}

// Enhanced Resume App with Cognito Integration
class CognitoResumeApp extends ResumeApp {
    constructor() {
        super();
        
        // Initialize Cognito auth
        this.cognitoAuth = new CognitoAuth({
            userPoolId: window.COGNITO_CONFIG?.userPoolId,
            clientId: window.COGNITO_CONFIG?.clientId,
            domain: window.COGNITO_CONFIG?.domain,
            redirectUri: window.location.origin + '/auth/callback',
            logoutUri: window.location.origin + '/auth/logout'
        });
        
        // Override parent methods
        this.setupCognitoAuth();
    }

    setupCognitoAuth() {
        // Override the checkAuthStatus method
        this.checkAuthStatus = () => {
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const protectedSection = document.getElementById('protected');

            if (this.cognitoAuth.isAuthenticated()) {
                loginBtn?.classList.add('hidden');
                logoutBtn?.classList.remove('hidden');
                protectedSection?.classList.remove('hidden');
                
                // Update logout button with user info
                const user = this.cognitoAuth.getUser();
                if (user && logoutBtn) {
                    logoutBtn.textContent = `Logout (${user.email})`;
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
        this.showLoginModal = () => {
            this.cognitoAuth.login();
        };

        // Override logout method
        this.logout = () => {
            this.cognitoAuth.logout();
        };

        // Override API calls to use Cognito tokens
        this.makeAuthenticatedRequest = async (url, options = {}) => {
            const token = this.cognitoAuth.getAccessToken();
            
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
        if (!this.cognitoAuth.isAuthenticated()) return;

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
                this.cognitoAuth.logout();
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
                this.cognitoAuth.logout();
            } else {
                throw new Error('Failed to load documents');
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            documentsList.innerHTML = '<p>Error loading documents</p>';
        }
    }
}

// Auto-initialize if Cognito config is available
document.addEventListener('DOMContentLoaded', () => {
    if (window.COGNITO_CONFIG) {
        window.app = new CognitoResumeApp();
    } else {
        // Fallback to basic auth
        window.app = new ResumeApp();
    }
});