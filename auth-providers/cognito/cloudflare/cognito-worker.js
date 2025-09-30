// AWS Cognito JWT Verification for Cloudflare Workers
// Drop-in replacement for basic JWT auth in Cloudflare Workers

class CognitoWorkerAuth {
    constructor(userPoolId, region = 'us-east-1') {
        this.userPoolId = userPoolId;
        this.region = region;
        this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
        this.jwksUri = `${this.issuer}/.well-known/jwks.json`;
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
            return await crypto.subtle.importKey(
                'jwk',
                jwk,
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

    async verifyToken(token, clientId) {
        try {
            // Split token into parts
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }

            const [headerB64, payloadB64, signatureB64] = parts;

            // Decode header and payload
            const header = JSON.parse(atob(headerB64));
            const payload = JSON.parse(atob(payloadB64));

            // Basic validation
            if (payload.iss !== this.issuer) {
                throw new Error('Invalid issuer');
            }

            if (clientId && payload.aud !== clientId) {
                throw new Error('Invalid audience');
            }

            if (payload.exp < Math.floor(Date.now() / 1000)) {
                throw new Error('Token expired');
            }

            if (payload.token_use !== 'access' && payload.token_use !== 'id') {
                throw new Error('Invalid token use');
            }

            // Get JWKS and find matching key
            const jwksMap = await this.getJWKS();
            const jwk = jwksMap.get(header.kid);
            
            if (!jwk) {
                throw new Error('Key not found in JWKS');
            }

            // Import key and verify signature
            const cryptoKey = await this.importJWK(jwk);
            
            // Prepare signature for verification
            const signature = new Uint8Array(
                Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')))
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
                username: payload.username || payload['cognito:username'],
                groups: payload['cognito:groups'] || [],
                tokenUse: payload.token_use,
                clientId: payload.aud,
                scope: payload.scope,
                exp: payload.exp,
                iat: payload.iat
            };

        } catch (error) {
            console.error('Token verification error:', error);
            return null;
        }
    }

    // Middleware function for Cloudflare Workers
    async authenticate(request, env, clientId = null) {
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { 
                success: false, 
                error: 'Missing or invalid Authorization header',
                status: 401 
            };
        }

        const token = authHeader.substring(7);
        const user = await this.verifyToken(token, clientId || env.COGNITO_CLIENT_ID);

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
        return user.scope && user.scope.split(' ').includes(scopeName);
    }
}

// Export for use in Cloudflare Workers
export { CognitoWorkerAuth };