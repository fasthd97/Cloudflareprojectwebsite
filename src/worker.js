// Cloudflare Worker for authentication and protected content API
// This runs at the edge and handles all backend functionality

// Auth provider factory
class AuthProviderFactory {
  static create(env) {
    // Use basic JWT auth
    return {
      type: 'basic',
      provider: new BasicJWTAuth(env.JWT_SECRET)
    };
  }
}

// Basic JWT implementation (fallback)
class BasicJWTAuth {
  constructor(jwtSecret) {
    this.jwtSecret = jwtSecret;
  }

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
    const user = await this.verifyJWT(token);

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

  async verifyJWT(token) {
    try {
      const [header, payload, signature] = token.split('.');
      const expectedSignature = await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(this.jwtSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        ),
        new TextEncoder().encode(`${header}.${payload}`)
      );
      
      const expectedEncodedSignature = btoa(String.fromCharCode(...new Uint8Array(expectedSignature)));
      
      if (signature === expectedEncodedSignature) {
        const decodedPayload = JSON.parse(atob(payload));
        if (decodedPayload.exp && decodedPayload.exp < Date.now() / 1000) {
          return null; // Token expired
        }
        return decodedPayload;
      }
      return null;
    } catch {
      return null;
    }
  }

  async generateJWT(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this.jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      ),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  hasGroup(user, groupName) {
    return user.groups && user.groups.includes(groupName);
  }
}

// Database initialization
async function initializeDatabase(env) {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  await env.DB.prepare(createUsersTable).run();
}

// Helper functions
function getProviderFeatures(providerType) {
  const features = {
    basic: ['simple', 'jwt-based'],
    cognito: ['hosted-ui', 'mfa', 'social-login', 'user-pools'],
    okta: ['sso', 'adaptive-auth', 'social-login', 'enterprise'],
    keycloak: ['self-hosted', 'customizable', 'open-source', 'federation']
  };
  return features[providerType] || [];
}

function checkUserAccess(user, providerType, authProvider) {
  switch (providerType) {
    case 'cognito':
      // Check if user is in the required Cognito group
      return authProvider.hasGroup(user, 'resume-friends');
    
    case 'okta':
      // Check if user is in the required Okta group
      return authProvider.hasGroup(user, 'Resume Friends');
    
    case 'keycloak':
      // Check if user is in the required Keycloak group
      return authProvider.hasGroup(user, 'resume-friends');
    
    case 'basic':
      // For basic auth, all authenticated users have access
      return true;
    
    default:
      return false;
  }
}

// Password hashing (for basic auth only)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Initialize auth provider
    const authConfig = AuthProviderFactory.create(env);
    const authProvider = authConfig.provider;
    
    // Initialize database on first run (only for basic auth)
    if (authConfig.type === 'basic') {
      await initializeDatabase(env);
    }
    
    try {
      // Authentication endpoints (only for basic auth)
      if (authConfig.type === 'basic' && path === '/api/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        
        // Get user from database
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE email = ?'
        ).bind(email).first();
        
        if (!user) {
          return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Verify password
        const passwordHash = await hashPassword(password);
        if (passwordHash !== user.password_hash) {
          return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Generate JWT token
        const token = await authProvider.generateJWT({
          userId: user.id,
          email: user.email,
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        });
        
        return new Response(JSON.stringify({ token, user: { email: user.email } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Register endpoint (only for basic auth)
      if (authConfig.type === 'basic' && path === '/api/register' && request.method === 'POST') {
        const { email, password } = await request.json();
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        try {
          // Insert user
          await env.DB.prepare(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)'
          ).bind(email, passwordHash).run();
          
          return new Response(JSON.stringify({ message: 'User registered successfully' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'User already exists' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Auth provider info endpoint
      if (path === '/api/auth/info' && request.method === 'GET') {
        return new Response(JSON.stringify({ 
          provider: authConfig.type,
          features: getProviderFeatures(authConfig.type)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Protected content endpoints
      if (path.startsWith('/api/protected/')) {
        // Authenticate using the configured provider
        const authResult = await authProvider.authenticate(request, env);
        
        if (!authResult.success) {
          return new Response(JSON.stringify({ error: authResult.error }), {
            status: authResult.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const user = authResult.user;

        // Check authorization based on provider type
        const hasAccess = checkUserAccess(user, authConfig.type, authProvider);
        
        if (!hasAccess) {
          return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Handle protected endpoints
        if (path === '/api/protected/photos' && request.method === 'GET') {
          // List photos from R2 bucket
          const objects = await env.BUCKET.list({ prefix: 'photos/' });
          const photos = objects.objects.map(obj => ({
            name: obj.key,
            url: `/api/protected/photo/${encodeURIComponent(obj.key)}`,
            size: obj.size,
            uploaded: obj.uploaded
          }));
          
          return new Response(JSON.stringify(photos), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (path.startsWith('/api/protected/photo/') && request.method === 'GET') {
          const photoKey = decodeURIComponent(path.substring('/api/protected/photo/'.length));
          const object = await env.BUCKET.get(photoKey);
          
          if (!object) {
            return new Response('Photo not found', { status: 404, headers: corsHeaders });
          }
          
          return new Response(object.body, {
            headers: {
              ...corsHeaders,
              'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
        
        if (path === '/api/protected/documents' && request.method === 'GET') {
          // List documents from R2 bucket
          const objects = await env.BUCKET.list({ prefix: 'documents/' });
          const documents = objects.objects.map(obj => ({
            name: obj.key.replace('documents/', ''),
            url: `/api/protected/document/${encodeURIComponent(obj.key)}`,
            size: obj.size,
            uploaded: obj.uploaded
          }));
          
          return new Response(JSON.stringify(documents), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (path.startsWith('/api/protected/document/') && request.method === 'GET') {
          const docKey = decodeURIComponent(path.substring('/api/protected/document/'.length));
          const object = await env.BUCKET.get(docKey);
          
          if (!object) {
            return new Response('Document not found', { status: 404, headers: corsHeaders });
          }
          
          return new Response(object.body, {
            headers: {
              ...corsHeaders,
              'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${docKey.split('/').pop()}"`
            }
          });
        }
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};