// AWS Cognito JWT Verification Middleware for Express
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

class CognitoAuth {
    constructor(options) {
        this.userPoolId = options.userPoolId;
        this.region = options.region || 'us-east-1';
        this.clientId = options.clientId;
        
        // JWKS client for token verification
        this.jwksClient = jwksClient({
            jwksUri: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 600000 // 10 minutes
        });
    }

    // Get signing key from JWKS
    getSigningKey(kid) {
        return new Promise((resolve, reject) => {
            this.jwksClient.getSigningKey(kid, (err, key) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(key.getPublicKey());
                }
            });
        });
    }

    // Verify JWT token
    async verifyToken(token) {
        try {
            // Decode token header to get key ID
            const decodedHeader = jwt.decode(token, { complete: true });
            if (!decodedHeader) {
                throw new Error('Invalid token format');
            }

            const kid = decodedHeader.header.kid;
            const signingKey = await this.getSigningKey(kid);

            // Verify token
            const decoded = jwt.verify(token, signingKey, {
                algorithms: ['RS256'],
                audience: this.clientId,
                issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`
            });

            // Check token use
            if (decoded.token_use !== 'access' && decoded.token_use !== 'id') {
                throw new Error('Invalid token use');
            }

            return decoded;
        } catch (error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }

    // Express middleware
    middleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'Access token required' });
                }

                const token = authHeader.substring(7);
                const decoded = await this.verifyToken(token);

                // Add user info to request
                req.user = {
                    sub: decoded.sub,
                    email: decoded.email,
                    username: decoded.username,
                    tokenUse: decoded.token_use,
                    clientId: decoded.client_id,
                    scope: decoded.scope
                };

                next();
            } catch (error) {
                console.error('Cognito auth error:', error);
                res.status(401).json({ error: 'Invalid or expired token' });
            }
        };
    }

    // Admin operations (requires appropriate IAM permissions)
    async createUser(email, temporaryPassword) {
        const AWS = require('aws-sdk');
        const cognito = new AWS.CognitoIdentityServiceProvider({
            region: this.region
        });

        try {
            const params = {
                UserPoolId: this.userPoolId,
                Username: email,
                UserAttributes: [
                    {
                        Name: 'email',
                        Value: email
                    },
                    {
                        Name: 'email_verified',
                        Value: 'true'
                    }
                ],
                TemporaryPassword: temporaryPassword,
                MessageAction: 'SUPPRESS' // Don't send welcome email
            };

            const result = await cognito.adminCreateUser(params).promise();
            return result.User;
        } catch (error) {
            throw new Error(`Failed to create user: ${error.message}`);
        }
    }

    async deleteUser(username) {
        const AWS = require('aws-sdk');
        const cognito = new AWS.CognitoIdentityServiceProvider({
            region: this.region
        });

        try {
            const params = {
                UserPoolId: this.userPoolId,
                Username: username
            };

            await cognito.adminDeleteUser(params).promise();
            return true;
        } catch (error) {
            throw new Error(`Failed to delete user: ${error.message}`);
        }
    }

    async listUsers(limit = 60) {
        const AWS = require('aws-sdk');
        const cognito = new AWS.CognitoIdentityServiceProvider({
            region: this.region
        });

        try {
            const params = {
                UserPoolId: this.userPoolId,
                Limit: limit
            };

            const result = await cognito.listUsers(params).promise();
            return result.Users;
        } catch (error) {
            throw new Error(`Failed to list users: ${error.message}`);
        }
    }
}

module.exports = CognitoAuth;