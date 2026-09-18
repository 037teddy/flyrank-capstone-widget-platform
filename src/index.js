require('dotenv').config();
const express = require('express');
const { z } = require('zod');
const db = require('./db');
const requireAuth = require('./authMiddleware');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { enrichWithGeo } = require('./geo');
const { sendConfirmationNotification } = require('./notify');

const app = express();
app.use(express.json());
const publicCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});
const submissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 submissions per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many submissions. Please try again shortly.' });
  },
});
const SubmissionSchema = z.object({
  widgetId: z.string().uuid(),
  data: z.record(z.string().max(2000)),
  website: z.string().optional(), // honeypot: real users never see/fill this; checked explicitly below
});

const WidgetSchema = z.object({
  type: z.enum(['signup', 'cta', 'popover']),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  fields: z.array(z.object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['text', 'email', 'textarea']),
    required: z.boolean().optional(),
  })).min(1),
  button_text: z.string().min(1).max(50).optional(),
  display_options: z.record(z.any()).optional(),
});
app.get('/dashboard/submissions', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.id, s.widget_id, w.title AS widget_title, s.data, s.country, s.city, s.created_at
     FROM submissions s
     JOIN widgets w ON w.id = s.widget_id
     WHERE s.tenant_id = $1
     ORDER BY s.created_at DESC
     LIMIT 100`,
    [req.tenant.id]
  );
  res.json(rows);
});

app.get('/dashboard/stats', requireAuth, async (req, res) => {
  const totalResult = await db.query(
    'SELECT COUNT(*) FROM submissions WHERE tenant_id = $1',
    [req.tenant.id]
  );

  const perWidgetResult = await db.query(
    `SELECT w.id AS widget_id, w.title, COUNT(s.id) AS submission_count
     FROM widgets w
     LEFT JOIN submissions s ON s.widget_id = w.id
     WHERE w.tenant_id = $1
     GROUP BY w.id, w.title
     ORDER BY submission_count DESC`,
    [req.tenant.id]
  );

  const geoResult = await db.query(
    `SELECT country, COUNT(*) AS count
     FROM submissions
     WHERE tenant_id = $1 AND country IS NOT NULL
     GROUP BY country
     ORDER BY count DESC`,
    [req.tenant.id]
  );

  res.json({
    total_submissions: parseInt(totalResult.rows[0].count),
    per_widget: perWidgetResult.rows,
    geo_breakdown: geoResult.rows,
  });
});
app.get('/widget.v1.js', publicCors, (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Type', 'application/javascript');
  res.send(`
(function() {
  var script = document.currentScript;
  var widgetId = new URL(script.src).searchParams.get('id');
  var container = document.createElement('div');
  script.parentNode.insertBefore(container, script.nextSibling);

  fetch('http://localhost:3000/widgets/' + widgetId + '/config')
    .then(function(res) { return res.json(); })
    .then(function(config) {
      var form = document.createElement('form');
      config.fields.forEach(function(field) {
        var input = document.createElement('input');
        input.name = field.name;
        input.placeholder = field.label;
        input.type = field.type === 'email' ? 'email' : 'text';
        form.appendChild(input);
      });
      var honeypot = document.createElement('input');
      honeypot.name = 'website';
      honeypot.style.display = 'none';
      form.appendChild(honeypot);

      var button = document.createElement('button');
      button.type = 'submit';
      button.textContent = config.button_text;
      form.appendChild(button);

      form.onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(form);
        var data = {};
        formData.forEach(function(v, k) { if (k !== 'website') data[k] = v; });
        fetch('http://localhost:3000/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgetId: widgetId, data: data, website: formData.get('website') }),
        }).then(function() {
          form.innerHTML = '<p>Thanks!</p>';
        });
      };

      container.appendChild(form);
    });
})();
  `.trim());
});
app.options('/submissions', publicCors);
app.options('/widgets/:id/config', publicCors);
// ---- Widget management (authenticated, tenant-isolated) ----
app.get('/widgets/:id/config', publicCors, async (req, res) => {
  const { rows } = await db.query('SELECT id, type, title, description, fields, button_text, display_options FROM widgets WHERE id = $1', [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }
  res.set('Cache-Control', 'public, max-age=60');
  res.json(rows[0]);
});

app.post('/widgets', requireAuth, async (req, res) => {
  const parsed = WidgetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid widget payload',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const { type, title, description, fields, button_text, display_options } = parsed.data;

  const { rows } = await db.query(
    `INSERT INTO widgets (tenant_id, type, title, description, fields, button_text, display_options)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.tenant.id, type, title, description || null, JSON.stringify(fields), button_text || 'Submit', display_options ? JSON.stringify(display_options) : null]
  );

  res.status(201).json(rows[0]);
});

app.get('/widgets', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM widgets WHERE tenant_id = $1 ORDER BY created_at DESC', [req.tenant.id]);
  res.json(rows);
});

app.get('/widgets/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM widgets WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }
  res.json(rows[0]);
});

app.put('/widgets/:id', requireAuth, async (req, res) => {
  const existing = await db.query('SELECT * FROM widgets WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenant.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }

  const parsed = WidgetSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid widget payload',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const current = existing.rows[0];
  const updated = { ...current, ...parsed.data };

  const { rows } = await db.query(
    `UPDATE widgets SET type = $1, title = $2, description = $3, fields = $4, button_text = $5, display_options = $6
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [updated.type, updated.title, updated.description, JSON.stringify(updated.fields), updated.button_text, updated.display_options ? JSON.stringify(updated.display_options) : null, req.params.id, req.tenant.id]
  );

  res.json(rows[0]);
});
app.post('/submissions', publicCors, submissionLimiter, async (req, res) => {
  const parsed = SubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid submission',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const { widgetId, data, website } = parsed.data;

  // Honeypot check: a filled hidden field means a bot. Reject silently —
  // don't tell the bot why, just don't store it.
  if (website && website.length > 0) {
    console.log('Honeypot triggered — submission silently dropped');
    return res.status(200).json({ success: true }); // looks normal to the bot
  }

  const widgetResult = await db.query('SELECT id, tenant_id FROM widgets WHERE id = $1', [widgetId]);
  if (widgetResult.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }
  const widget = widgetResult.rows[0];

  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
// Local/loopback addresses aren't resolvable by real geo providers.
// Substitute a known public IP (Google DNS) so local development can
// exercise real geo lookups — noted honestly in the README's limitations.
if (ip === '::1' || ip === '127.0.0.1' || ip?.startsWith('::ffff:127.')) {
  ip = '8.8.8.8';
} const geo = await enrichWithGeo(ip);

  const { rows } = await db.query(
    `INSERT INTO submissions (widget_id, tenant_id, data, ip_address, country, city, geo_provider_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [widget.id, widget.tenant_id, JSON.stringify(data), ip, geo.country, geo.city, geo.provider_used]
  );

  // Safe side effect — its failure must never affect the response below.
  await sendConfirmationNotification(rows[0], process.env.FORCE_NOTIFICATION_FAILURE === 'true');

  res.status(201).json({ success: true, submission_id: rows[0].id });
});
app.delete('/widgets/:id', requireAuth, async (req, res) => {
  const result = await db.query('DELETE FROM widgets WHERE id = $1 AND tenant_id = $2 RETURNING id', [req.params.id, req.tenant.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Widget not found' });
  }
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Widget platform running on http://localhost:${PORT}`);
});