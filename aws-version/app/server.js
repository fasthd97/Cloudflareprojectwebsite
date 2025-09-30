// Resume API Server - AWS Container Version
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const AWS = require('aws-sdk');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const S3_BUCKET = process.env.AWS_S3_BUCKET;

// AWS Configuration
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourname.com', 'https://www.yourname.com'] 
    : ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

app.use('/api/', limiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and documents
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Database initialization
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );

    res.status(201).json({ 
      message: 'User registered successfully',
      user: { id: result.rows[0].id, email: result.rows[0].email }
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'User already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected endpoints
app.get('/api/protected/photos', authenticateToken, async (req, res) => {
  try {
    const params = {
      Bucket: S3_BUCKET,
      Prefix: 'photos/',
      MaxKeys: 100
    };

    const data = await s3.listObjectsV2(params).promise();
    
    const photos = data.Contents
      .filter(obj => obj.Key !== 'photos/') // Exclude folder itself
      .map(obj => ({
        name: obj.Key.replace('photos/', ''),
        key: obj.Key,
        url: `/api/protected/photo/${encodeURIComponent(obj.Key)}`,
        size: obj.Size,
        lastModified: obj.LastModified
      }));

    res.json(photos);
  } catch (error) {
    console.error('Error listing photos:', error);
    res.status(500).json({ error: 'Failed to list photos' });
  }
});

app.get('/api/protected/photo/:key(*)', authenticateToken, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key
    };

    const data = await s3.getObject(params).promise();
    
    res.set({
      'Content-Type': data.ContentType || 'image/jpeg',
      'Content-Length': data.ContentLength,
      'Cache-Control': 'public, max-age=3600'
    });
    
    res.send(data.Body);
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return res.status(404).json({ error: 'Photo not found' });
    }
    console.error('Error getting photo:', error);
    res.status(500).json({ error: 'Failed to get photo' });
  }
});

app.get('/api/protected/documents', authenticateToken, async (req, res) => {
  try {
    const params = {
      Bucket: S3_BUCKET,
      Prefix: 'documents/',
      MaxKeys: 100
    };

    const data = await s3.listObjectsV2(params).promise();
    
    const documents = data.Contents
      .filter(obj => obj.Key !== 'documents/') // Exclude folder itself
      .map(obj => ({
        name: obj.Key.replace('documents/', ''),
        key: obj.Key,
        url: `/api/protected/document/${encodeURIComponent(obj.Key)}`,
        size: obj.Size,
        lastModified: obj.LastModified
      }));

    res.json(documents);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

app.get('/api/protected/document/:key(*)', authenticateToken, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key
    };

    const data = await s3.getObject(params).promise();
    
    res.set({
      'Content-Type': data.ContentType || 'application/octet-stream',
      'Content-Length': data.ContentLength,
      'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`
    });
    
    res.send(data.Body);
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return res.status(404).json({ error: 'Document not found' });
    }
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// File upload endpoints (for admin use)
app.post('/api/protected/upload/photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const key = `photos/${Date.now()}-${req.file.originalname}`;
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };

    await s3.upload(params).promise();
    
    res.json({ 
      message: 'Photo uploaded successfully',
      key: key,
      url: `/api/protected/photo/${encodeURIComponent(key)}`
    });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

app.post('/api/protected/upload/document', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const key = `documents/${Date.now()}-${req.file.originalname}`;
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };

    await s3.upload(params).promise();
    
    res.json({ 
      message: 'Document uploaded successfully',
      key: key,
      url: `/api/protected/document/${encodeURIComponent(key)}`
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Database: ${DATABASE_URL ? 'Connected' : 'Not configured'}`);
      console.log(`S3 Bucket: ${S3_BUCKET || 'Not configured'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});