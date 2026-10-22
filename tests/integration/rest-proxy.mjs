// supabase-js talks to <url>/rest/v1/...; a bare PostgREST serves at the root.
// This small proxy strips the prefix so the REAL client code can run against a local PostgREST.
// It also answers GET /auth/v1/user (what our Vercel functions call to check a session) by verifying the
// test JWT with the local secret — a stand-in for Supabase Auth, for local runs only.
import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'

const [, , listen = '54331', upstream = '54330'] = process.argv
const SECRET = process.env.TROPHE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

function user(auth) {
  const [h, p, sig] = (auth ?? '').replace(/^Bearer\s+/i, '').split('.')
  if (!sig) return null
  const want = createHmac('sha256', SECRET).update(`${h}.${p}`).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
  return claims.exp * 1000 > Date.now() ? { id: claims.sub, email: claims.email ?? null, aud: claims.aud, role: claims.role } : null
}

http.createServer((req, res) => {
  if (req.url?.startsWith('/auth/v1/user')) {
    const u = user(req.headers.authorization)
    res.writeHead(u ? 200 : 401, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(u ?? { msg: 'invalid token' }))
  }
  const path = (req.url ?? '/').replace(/^\/rest\/v1/, '') || '/'
  const up = http.request({ host: '127.0.0.1', port: Number(upstream), path, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)) })
  req.pipe(up)
}).listen(Number(listen), '127.0.0.1', () => console.log(`rest proxy :${listen} -> :${upstream}`))
