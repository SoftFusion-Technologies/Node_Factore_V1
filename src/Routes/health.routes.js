/* Benjamin Orellana - 05/10/2026 - Estado HTTP sin datos privados ni consultas a MySQL. */
import express from 'express';
const router = express.Router({ caseSensitive: true, strict: true });
router.get('/api/status', (req, res) => res.json({ ok: true, message: 'Backend Factor E funcionando correctamente.' }));
export default router;
