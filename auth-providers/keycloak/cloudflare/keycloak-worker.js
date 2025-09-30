// Keycloak JWT Verification for Cloudflare Workers
// Self-hosted identity provider integration at the edge

class KeycloakWorkerAuth {
    constructor(serverUrl, realm, clientId) {
        this.serverUrl = serverUrl;
        this.realm = realm;
        this.clientId = clientId;
        this.issuer = `${serverUrl}/realms/${realm}`;
        this.jwksUri = `${this.issuer}/protocol/openid-connect/certs`;
        this.jwksCache = new Map();
        this.jwksCacheExpiry = 0;
    }

    async getJWKS() {
        const now = Date.now();
        
        // Return cached JWKS if still valid
        if (this.jwksCache.size > 0 && now < this.jwksCacheExpiry) {
            return this.jwksCache;
        }

        try {
            const response = await fetch(this.jwksUri);
            if (!response.ok) {
                throw new Error(`Failed to fetch JWKS: ${response.status}`);
            }

            const jwks = await response.json();
            
            // Cache JWKS for 1 hour
            this.jwksCache.clear();
            jwks.keys.forEach(key => {
                this.jwksCache.set(key.kid, key);
            });
            this.jwksCacheExpiry = now + (60 * 60 * 1000);

            return this.jwksCache;
        } catch (error) {
            console.error('Error fetching JWKS:', error);
            throw error;
        }
    }

    async importJWK(jwk) {
        try {
            // Handle different key types
            const keyData = {
                kty: jwk.kty,
                use: jwk.use,
                alg: jwk.alg
            };

            if (jwk.kty === 'RSA') {
                keyData.n = jwk.n;
                keyData.e = jwk.e;
            } else if (jwk.kty === 'EC') {
                keyData.crv = jwk.crv;
                keyData.x = jwk.x;
                keyData.y = jwk.y;
            }

            const algorithm = jwk.alg === 'ES256' ? 
                { name: 'ECDSA', namedCurve: 'P-256' } :
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

            return await crypto.subtle.importKey(
                'jwk',
                keyData,
                algorithm,
                false,
                ['verify']
            );
        } catch (error) {
            console.error('Error importing JWK:', error);
            throw error;
        }
    }

    base64UrlDecode(str) {
        // Add padding if needed
        str += '='.repeat((4 - str.length % 4) % 4);
        // Replace URL-safe characters
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        return atob(str);
    }

    async verifyToken(token) {
        try {
            // Split token into parts
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }

            const [headerB64, payloadB64, signatureB64] = parts;

            // Decode header and payload
            const header = JSON.parse(this.base64UrlDecode(headerB64));
            const payload = JSON.parse(this.base64UrlDecode(payloadB64));

            // Basic validation
            if (payload.iss !== this.issuer) {
                throw new Error(`Invalid issuer. Expected: ${this.issuer}, Got: ${payload.iss}`);
            }

            if (this.clientId && payload.aud !== this.clientId) {
                // Keycloak can have multiple audiences, check if clientId is in the array
                const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
                if (!audiences.includes(this.clientId)) {
                    throw new Error(`Invalid audience. Expected: ${this.clientId}, Got: ${JSON.stringify(payload.aud)}`);
                }
            }

            if (payload.exp < Math.floor(Date.now() / 1000)) {
                throw new Error('Token expired');
            }

            // Get JWKS and find matching key
            const jwksMap = await this.getJWKS();
            const jwk = jwksMap.get(header.kid);
            
            if (!jwk) {
                throw new Error(`Key not found in JWKS: ${header.kid}`);
            }

            // Import key and verify signature
            const cryptoKey = await this.importJWK(jwk);
            
            // Prepare signature for verification
            const signature = new Uint8Array(
                Array.from(this.base64UrlDecode(signatureB64))
                    .map(char => char.charCodeAt(0))
            );

            const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

            // Use appropriate algorithm based on key type
            const algorithm = header.alg === 'ES256' ? 
                { name: 'ECDSA', hash: 'SHA-256' } :
                'RSASSA-PKCS1-v1_5';

            const isValid = await crypto.subtle.verify(
                algorithm,
                cryptoKey,
                signature,
                data
            );

            if (!isValid) {
                throw new Error('Invalid signature');
            }

            return {
                sub: payload.sub,
                email: payload.email,
                name: payload.name,
                preferred_username: payload.preferred_username,
                given_name: payload.given_name,
                family_name: payload.family_name,
                groups: payload.groups || [],
                realm_access: payload.realm_access || {},
                resource_access: payload.resource_access || {},
                scope: payload.scope,
                exp: payload.exp,
                iat: payload.iat,
                aud: payload.aud,
                iss: payload.iss,
                typ: payload.typ
            };

        } catch (error) {
            console.error('Token verification error:', error);
            return null;
        }
    }

    // Middleware function for Cloudflare Workers
    async authenticate(request, env) {
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { 
                success: false, 
                error: 'Missing or invalid Authorization header',
                status: 401 
            };
        }

        const token = authHeader.substring(7);
        const user = await this.verifyToken(token);

        if (!user) {
            return { 
                success: false, 
                error: 'Invalid or expired token',
                status: 401 
            };
        }

        return { 
            success: true, 
            user: user 
        };
    }

    // Check if user has required group
    hasGroup(user, groupName) {
        return user.groups && user.groups.includes(groupName);
    }

    // Check if user has required realm role
    hasRealmRole(user, roleName) {
        return user.realm_access && 
               user.realm_access.roles && 
               user.realm_access.roles.includes(roleName);
    }

    // Check if user has required client role
    hasClientRole(user, roleName, clientId = null) {
        const targetClient = clientId || this.clientId;
        return user.resource_access && 
               user.resource_access[targetClient] && 
               user.resource_access[targetClient].roles && 
               user.resource_access[targetClient].roles.includes(roleName);
    }

    // Check if user has required scope
    hasScope(user, scopeName) {
        const scopes = typeof user.scope === 'string' ? user.scope.split(' ') : user.scope || [];
        return scopes.includes(scopeName);
    }

    // Get user info from Keycloak (for additional claims)
    async getUserInfo(token) {
        try {
            const response = await fetch(`${this.issuer}/protocol/openid-connect/userinfo`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`UserInfo request failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            return null;
        }
    }

    // Introspect token (requires client credentials)
    async introspectToken(token, clientSecret) {
        try {
            const response = await fetch(`${this.issuer}/protocol/openid-connect/token/introspect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${btoa(`${this.clientId}:${clientSecret}`)}`
                },
                body: new URLSearchParams({
                    token: token,
                    token_type_hint: 'access_token'
                })
            });

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`Token introspection failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Error introspecting token:', error);
            return null;
        }
    }
}

// Export for use in Cloudflare Workers
export { KeycloakWorkerAuth };