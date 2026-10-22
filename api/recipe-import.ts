// Vercel function: read a recipe from a web page.
//   GET /api/recipe-import?url=https://…   → { recipe: { name, ingredients[], portions } } or { error }
// Only signed-in Trophe users. The page is fetched here (browsers can't read other sites), and only from the public
// internet: every DNS answer is checked at connect time (so a name can't be rebound to an internal address between a
// check and the request), redirects are followed by hand and checked again, and the body is capped.
import { lookup as dnsLookup } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { extractRecipe, isPublicAddress } from '../src/lib/recipeImport.js'
import { json, signedIn } from './_shared.js'

const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; Trophe/0.1 recipe import; +https://github.com/Gowtham-GG/trophe)'

class Refused extends Error {}

// dns.lookup, but an answer that isn't a public address is an error (checked for every connection)
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = addresses as { address: string; family: number }[]
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) return callback(new Refused('That link points to a private network.'), '', 4)
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

function get(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', lookup: publicLookup, timeout: TIMEOUT_MS,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' },
    }, resolve)
    req.on('timeout', () => req.destroy(new Error('The page took too long to answer.')))
    req.on('error', reject)
    req.end()
  })
}

async function fetchPage(raw: string): Promise<string> {
  let url: URL
  try { url = new URL(raw) } catch { throw new Refused('That isn’t a web address.') }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Refused('Only http and https links.')
    if (url.username || url.password) throw new Refused('Links with a password aren’t allowed.')
    if (url.port && url.port !== '80' && url.port !== '443') throw new Refused('Only standard web ports.')
    // an address typed as numbers never goes through DNS (so not through publicLookup): check it here
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && !isPublicAddress(host)) throw new Refused('That link points to a private network.')
    const res = await get(url)
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      url = new URL(res.headers.location, url)
      continue
    }
    if (status !== 200) { res.resume(); throw new Error(`The page answered ${status}.`) }
    const type = String(res.headers['content-type'] ?? '')
    if (type && !/html|xml/i.test(type)) { res.resume(); throw new Refused('That link isn’t a web page.') }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of res) {
      size += (chunk as Buffer).length
      if (size > MAX_BYTES) { res.destroy(); break }
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
  }
  throw new Refused('Too many redirects.')
}

export async function GET(request: Request): Promise<Response> {
  if (!(await signedIn(request))) return json({ error: 'Sign in to import recipes.' }, 401)
  const raw = (new URL(request.url).searchParams.get('url') ?? '').trim()
  if (!raw || raw.length > 2000) return json({ error: 'Paste the link of a recipe page.' }, 400)
  try {
    const recipe = extractRecipe(await fetchPage(raw))
    if (!recipe) return json({ error: 'No recipe found on that page. Many sites work; some don’t describe their recipes in a way that can be read.' }, 422)
    return json({ recipe }, 200, true)
  } catch (e) {
    return json({ error: e instanceof Refused ? e.message : `Couldn’t read that page: ${(e as Error).message}` }, e instanceof Refused ? 400 : 502)
  }
}
