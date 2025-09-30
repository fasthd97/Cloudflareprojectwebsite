// Okta JWT Verification for Cloudflare Workers
// OAuth 2.0 + OIDC token validation at the edge

class OktaWorkerAuth {
    constructor(issuer, clientId) {
        this.issuer = issuer;
        this.clientId = clientId;
        this.jwksUri = `${issuer}/v1/keys`;
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
            // Convert JWK to CryptoKey
            return await crypto.subtle.importKey(
                'jwk',
                {
                    kty: jwk.kty,
                    n: jwk.n,
                    e: jwk.e,
                    alg: jwk.alg,
                    use: jwk.use
                },
                {
                    name: 'RSASSA-PKCS1-v1_5',
                    hash: 'SHA-256'
                },
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
                throw new Error(`Invalid audience. Expected: ${this.clientId}, Got: ${payload.aud}`);
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

            const isValid = await crypto.subtle.verify(
                'RSASSA-PKCS1-v1_5',
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
                groups: payload.groups || [],
                scope: payload.scp || payload.scope,
                exp: payload.exp,
                iat: payload.iat,
                aud: payload.aud,
                iss: payload.iss
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

    // Check if user has required scope
    hasScope(user, scopeName) {
        const scopes = typeof user.scope === 'string' ? user.scope.split(' ') : user.scope || [];
        return scopes.includes(scopeName);
    }

    // Get user info from Okta (for additional claims)
    async getUserInfo(token) {
        try {
            const response = await fetch(`${this.issuer}/v1/userinfo`, {
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
}

// Export for use in Cloudflare Workers
export { OktaWorkerAuth };