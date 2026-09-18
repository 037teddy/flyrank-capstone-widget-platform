const db = require('./db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API key required' });
  }

  const apiKey = authHeader.split(' ')[1];

  const { rows } = await db.query('SELECT * FROM tenants WHERE api_key = $1', [apiKey]);

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.tenant = rows[0];
  next();
}

module.exports = requireAuth;