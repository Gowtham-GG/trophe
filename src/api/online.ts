import { supabase } from '@/lib/supabase'
import type { ExternalFood } from '@/lib/external'
import { toError } from './errors'

export interface OnlineResults { foods: ExternalFood[]; errors: { source: string; message: string }[] }

/** Calls one of our Vercel functions with the user's session (they only answer signed-in users). */
async function callApi<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, { headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const body = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Search failed (${res.status})`)
  return body
}

/** Open Food Facts + USDA, already in Trophe's per-100 g shape. */
export const searchOnline = (q: string) => callApi<OnlineResults>(`/api/food-search?q=${encodeURIComponent(q)}`)

/** A USDA food with its portions (search results don't carry them). */
export async function usdaFood(id: string): Promise<ExternalFood | null> {
  return (await callApi<{ food: ExternalFood | null }>(`/api/food-search?usda=${encodeURIComponent(id)}`)).food
}

/** A packaged food by barcode (Open Food Facts), or null when nobody has added it yet. */
export async function lookupBarcode(code: string): Promise<ExternalFood | null> {
  return (await callApi<{ food: ExternalFood | null }>(`/api/food-search?barcode=${encodeURIComponent(code)}`)).food
}

/** A recipe read from a web page (its JSON-LD): name, ingredient lines, portions. */
export async function importRecipe(url: string): Promise<{ name: string; ingredients: string[]; portions: number | null }> {
  return (await callApi<{ recipe: { name: string; ingredients: string[]; portions: number | null } }>(`/api/recipe-import?url=${encodeURIComponent(url)}`)).recipe
}

/** Copy an online food into your foods (only when you pick it). Picking it again returns the same food. */
export async function saveExternalFood(f: ExternalFood): Promise<string> {
  const { servings, ...food } = f
  const { data, error } = await supabase.rpc('save_external_food', { p_food: food, p_servings: servings })
  if (error) throw toError(error)
  return data as string
}

export const SOURCE_LABEL: Record<string, string> = { off: 'Open Food Facts', usda: 'USDA', ifct: 'Indian dishes', recipe: 'Recipe', custom: 'Yours' }
