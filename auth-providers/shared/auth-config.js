// Shared Authentication Configuration System
// Automatically detects and initializes the appropriate auth provider

class AuthProviderDetector {
    constructor() {
        this.providers = {
            cognito: {
                check: () => window.COGNITO_CONFIG,
                class: 'CognitoResumeApp',
                script: '../auth-providers/cognito/frontend/cognito-auth.js'
            },
            okta: {
                check: () => window.OKTA_CONFIG,
                class: 'OktaResumeApp',
                script: '../auth-providers/okta/frontend/okta-auth.js'
            },
            keycloak: {
                check: () => window.KEYCLOAK_CONFIG,
                class: 'KeycloakResumeApp',
                script: '../auth-providers/keycloak/frontend/keycloak-auth.js'
            }
        };
    }

    async detectAndInitialize() {
        // Check which auth provider is configured
        for (const [name, provider] of Object.entries(this.providers)) {
            if (provider.check()) {
                console.log(`Detected ${name} authentication provider`);
                
                try {
                    // Dynamically load the provider script
                    await this.loadScript(provider.script);
                    
                    // Initialize the appropriate app class
                    const AppClass = window[provider.class];
                    if (AppClass) {
                        window.app = new AppClass();
                        console.log(`Initialized ${provider.class}`);
                        return name;
                    } else {
                        console.error(`${provider.class} not found after loading script`);
                    }
                } catch (error) {
                    console.error(`Failed to load ${name} provider:`, error);
                }
            }
        }

        // Fallback to basic auth
        console.log('No auth provider detected, using basic authentication');
        window.app = new ResumeApp();
        return 'basic';
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if script is already loaded
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Utility method to get current auth provider info
    getCurrentProvider() {
        if (window.COGNITO_CONFIG) return 'cognito';
        if (window.OKTA_CONFIG) return 'okta';
        if (window.KEYCLOAK_CONFIG) return 'keycloak';
        return 'basic';
    }

    // Get provider-specific configuration
    getProviderConfig() {
        const provider = this.getCurrentProvider();
        
        switch (provider) {
            case 'cognito':
                return {
                    type: 'cognito',
                    config: window.COGNITO_CONFIG,
                    features: ['hosted-ui', 'mfa', 'social-login', 'user-pools']
                };
            case 'okta':
                return {
                    type: 'okta',
                    config: window.OKTA_CONFIG,
                    features: ['sso', 'adaptive-auth', 'social-login', 'enterprise']
                };
            case 'keycloak':
                return {
                    type: 'keycloak',
                    config: window.KEYCLOAK_CONFIG,
                    features: ['self-hosted', 'customizable', 'open-source', 'federation']
                };
            default:
                return {
                    type: 'basic',
                    config: null,
                    features: ['simple', 'jwt-based']
                };
        }
    }
}

// Configuration validator
class AuthConfigValidator {
    static validateCognito(config) {
        const required = ['userPoolId', 'clientId', 'domain'];
        return this.validateRequired(config, required, 'Cognito');
    }

    static validateOkta(config) {
        const required = ['domain', 'clientId', 'issuer'];
        return this.validateRequired(config, required, 'Okta');
    }

    static validateKeycloak(config) {
        const required = ['url', 'realm', 'clientId'];
        return this.validateRequired(config, required, 'Keycloak');
    }

    static validateRequired(config, required, providerName) {
        if (!config) {
            return { valid: false, error: `${providerName} config is missing` };
        }

        const missing = required.filter(key => !config[key]);
        if (missing.length > 0) {
            return { 
                valid: false, 
                error: `${providerName} config missing: ${missing.join(', ')}` 
            };
        }

        return { valid: true };
    }

    static validateAll() {
        const results = {};

        if (window.COGNITO_CONFIG) {
            results.cognito = this.validateCognito(window.COGNITO_CONFIG);
        }

        if (window.OKTA_CONFIG) {
            results.okta = this.validateOkta(window.OKTA_CONFIG);
        }

        if (window.KEYCLOAK_CONFIG) {
            results.keycloak = this.validateKeycloak(window.KEYCLOAK_CONFIG);
        }

        return results;
    }
}

// Enhanced base ResumeApp with provider abstraction
class EnhancedResumeApp extends ResumeApp {
    constructor() {
        super();
        this.authProvider = null;
        this.providerType = 'basic';
    }

    setAuthProvider(provider, type) {
        this.authProvider = provider;
        this.providerType = type;
    }

    // Abstract authentication methods
    async login() {
        if (this.authProvider && this.authProvider.login) {
            return await this.authProvider.login();
        }
        return super.showLoginModal();
    }

    async logout() {
        if (this.authProvider && this.authProvider.logout) {
            return await this.authProvider.logout();
        }
        return super.logout();
    }

    isAuthenticated() {
        if (this.authProvider && this.authProvider.isAuthenticated) {
            return this.authProvider.isAuthenticated();
        }
        return super.token && super.isTokenValid();
    }

    getUser() {
        if (this.authProvider && this.authProvider.getUser) {
            return this.authProvider.getUser();
        }
        return null;
    }

    async makeAuthenticatedRequest(url, options = {}) {
        let token = null;

        if (this.authProvider && this.authProvider.getAccessToken) {
            token = this.authProvider.getAccessToken();
        } else if (super.token) {
            token = super.token;
        }

        if (!token) {
            throw new Error('No authentication token available');
        }

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            }
        });
    }

    // Provider-specific feature detection
    hasFeature(feature) {
        const detector = new AuthProviderDetector();
        const config = detector.getProviderConfig();
        return config.features.includes(feature);
    }

    // Get provider information for UI display
    getProviderInfo() {
        const detector = new AuthProviderDetector();
        return detector.getProviderConfig();
    }
}

// Auto-initialization with provider detection
document.addEventListener('DOMContentLoaded', async () => {
    // Validate configurations
    const validationResults = AuthConfigValidator.validateAll();
    
    // Log validation results
    Object.entries(validationResults).forEach(([provider, result]) => {
        if (!result.valid) {
            console.warn(`${provider} configuration invalid:`, result.error);
        }
    });

    // Detect and initialize auth provider
    const detector = new AuthProviderDetector();
    const activeProvider = await detector.detectAndInitialize();
    
    // Add provider info to page
    const providerInfo = detector.getProviderConfig();
    console.log('Active auth provider:', providerInfo);
    
    // Optional: Display provider info in UI
    const providerIndicator = document.getElementById('auth-provider-indicator');
    if (providerIndicator) {
        providerIndicator.textContent = `Auth: ${providerInfo.type}`;
        providerIndicator.title = `Features: ${providerInfo.features.join(', ')}`;
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AuthProviderDetector,
        AuthConfigValidator,
        EnhancedResumeApp
    };
}