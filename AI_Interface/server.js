const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize pool only if database credentials are provided
let pool;
if (process.env.PGHOST && process.env.PGUSER) {
  pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
} else {
  console.log('Database credentials not found, running without database support');
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

async function ensureSession(sessionId) {
  if (!pool) return sessionId;
  
  const id = sessionId || uuidv4();
  try {
    await pool.query(
      'INSERT INTO chat_sessions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [id]
    );
  } catch (err) {
    console.error('Database error in ensureSession:', err);
  }
  return id;
}

// Updated /api/chat endpoint with better error handling
app.post('/api/chat', async (req, res) => {
  try {
    const { chatInput, files, sessionId } = req.body;
    
    console.log('Received request from interface:', { 
      chatInput: chatInput?.substring(0, 100) + (chatInput?.length > 100 ? '...' : ''),
      filesCount: files?.length || 0,
      sessionId 
    });

    // Call your n8n workflow directly
    const n8nUrl = 'http://localhost:5678/webhook/upload-code';
    
    // Prepare payload in the format your workflow expects
    const n8nPayload = {
      chatInput: chatInput || '',
      files: files || [],
      sessionId: sessionId || 'default-session'
    };

    console.log('Calling n8n workflow at:', n8nUrl);

    const response = await axios.post(n8nUrl, n8nPayload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 120000
    });

    console.log('n8n response status:', response.status);

    // Extract response from n8n workflow
    let aiResponse = '';
    const data = response.data;
    
    if (data && typeof data === 'object') {
      if (data.response) {
        aiResponse = data.response;
      } else if (data.content) {
        aiResponse = data.content;
      } else if (data.message) {
        aiResponse = data.message;
      } else if (data.success !== false) {
        // Try to find any text content in the response
        for (const key in data) {
          if (typeof data[key] === 'string' && data[key].trim().length > 0) {
            aiResponse = data[key];
            break;
          }
        }
        if (!aiResponse) {
          aiResponse = JSON.stringify(data);
        }
      } else {
        aiResponse = 'Error from AI service: ' + (data.error || 'Unknown error');
      }
    } else if (typeof data === 'string') {
      aiResponse = data;
    } else {
      aiResponse = 'No response from AI assistant';
    }

    console.log('Extracted AI response length:', aiResponse?.length);

    // Return response to interface
    res.json({
      success: true,
      response: aiResponse,
      sessionId: sessionId
    });

  } catch (err) {
    console.error('Error in /api/chat:');
    console.error('Error message:', err.message);
    
    let errorMessage = 'Failed to process request';
    let errorDetails = '';
    
    if (err.response) {
      console.error('n8n Response Status:', err.response.status);
      console.error('n8n Response Data:', err.response.data);
      
      errorMessage = `n8n returned ${err.response.status}: ${err.response.statusText}`;
      if (err.response.data && typeof err.response.data === 'object') {
        errorDetails = JSON.stringify(err.response.data);
      }
    } else if (err.request) {
      console.error('No response received from n8n');
      console.error('Request config:', err.config);
      
      errorMessage = 'No response received from n8n workflow. Please check if n8n is running.';
      errorDetails = err.message;
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = 'Cannot connect to n8n. Please make sure n8n is running on port 5678.';
      errorDetails = err.message;
    } else {
      console.error('Request setup error:', err.message);
      errorMessage = 'Request setup error';
      errorDetails = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: errorDetails
    });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    if (!pool) {
      return res.json({ success: true, messages: [] });
    }
    
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.json({ success: true, messages: [] });

    const { rows } = await pool.query(
      `SELECT role, content, created_at
       FROM messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error('Error in /api/history:', err);
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Try to connect to n8n
    const n8nResponse = await axios.get('http://localhost:5678/health', {
      timeout: 5000
    });
    
    res.json({
      success: true,
      n8n: {
        status: 'connected',
        statusCode: n8nResponse.status
      },
      server: 'running'
    });
  } catch (err) {
    res.json({
      success: false,
      n8n: {
        status: 'disconnected',
        error: err.message
      },
      server: 'running'
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`API endpoint: http://localhost:${port}/api/chat`);
  console.log(`Make sure n8n is running on http://localhost:5678`);
});