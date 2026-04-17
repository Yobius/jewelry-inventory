import { prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware, requireRole } from '../lib/auth-middleware.js'
import { emit } from '../lib/events.js'
import { executeImportSchema, fieldMappingSchema } from '../schemas/import.js'
import { executeImport, parseExcel } from '../services/excel-import.js'

export function createImportsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  // ---------- Excel preview ----------
  route.post('/excel/preview', async (c) => {
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') {
      return c.json({ error: 'Файл не надіслано (multipart field "file")' }, 400)
    }
    const buf = await (file as File).arrayBuffer()
    try {
      const parsed = await parseExcel(buf, 10)
      return c.json(parsed)
    } catch (e) {
      return c.json({ error: `Не вдалось прочитати Excel: ${(e as Error).message}` }, 400)
    }
  })

  // ---------- Excel execute (write — ADMIN/MANAGER only) ----------
  route.post('/excel/execute', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    const paramsRaw = form?.get('params')
    if (!file || typeof file === 'string') {
      return c.json({ error: 'Файл не надіслано (multipart field "file")' }, 400)
    }
    if (typeof paramsRaw !== 'string') {
      return c.json({ error: 'Параметри не надіслані (multipart field "params" з JSON)' }, 400)
    }
    let paramsJson: unknown
    try {
      paramsJson = JSON.parse(paramsRaw)
    } catch {
      return c.json({ error: 'params не є валідним JSON' }, 400)
    }
    const parsed = executeImportSchema.safeParse(paramsJson)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    if (!parsed.data.fieldMapping.sku || !parsed.data.fieldMapping.weight) {
      return c.json(
        { error: 'fieldMapping.sku та fieldMapping.weight обов’язкові для імпорту' },
        400,
      )
    }

    const f = file as File
    const buf = await f.arrayBuffer()
    const result = await executeImport({
      buffer: buf,
      supplierId: parsed.data.supplierId,
      saveMappingAs: parsed.data.saveMappingAs,
      fieldMapping: parsed.data.fieldMapping,
      materialTransform: parsed.data.materialTransform,
      initialLocation: parsed.data.initialLocation,
      defaultQuantity: parsed.data.defaultQuantity,
      skipInvalid: parsed.data.skipInvalid,
      filename: f.name || 'upload.xlsx',
      userId: c.get('userId'),
    })
    emit({ type: 'import.completed', importId: result.importId })
    return c.json(result)
  })

  // ---------- Past imports log ----------
  route.get('/', async (c) => {
    const imports = await prisma.import.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        supplier: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    return c.json({ imports })
  })

  // ---------- Saved mappings ----------
  route.get('/mappings', async (c) => {
    const supplierId = new URL(c.req.url).searchParams.get('supplierId') ?? undefined
    const mappings = await prisma.importMapping.findMany({
      where: supplierId ? { supplierId } : {},
      orderBy: { createdAt: 'desc' },
      include: { supplier: { select: { id: true, name: true } } },
    })
    return c.json({ mappings })
  })

  route.delete('/mappings/:id', async (c) => {
    try {
      await prisma.importMapping.delete({ where: { id: c.req.param('id') } })
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.body(null, 204)
  })

  // Body-only endpoint to validate mapping shape (helps UI before re-uploading file).
  route.post('/mappings/validate', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = fieldMappingSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    return c.json({ ok: true, mapping: parsed.data })
  })

  return route
}
