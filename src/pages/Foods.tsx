import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { archiveFood, deleteFood, fetchServings, restoreFood, searchFoods } from '@/api/foods'
import { deleteTemplate, listTemplates } from '@/api/templates'
import { Card } from '@/components/Card'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FoodForm } from '@/components/FoodForm'
import { IconPlus, IconSearch } from '@/components/icons'
import { NutritionLine } from '@/components/NutritionLine'
import { useToast } from '@/contexts/ToastContext'
import { useDebounced } from '@/hooks/useDebounced'
import { fmtKcal, scale } from '@/lib/nutrition'
import type { Food } from '@/types/db'

type Tab = 'foods' | 'archived' | 'meals'

/** Edit a food (with its servings), archive / restore it, or delete it for good. */
function FoodDialog({ food, onClose }: { food: Food | 'new'; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const existing = food === 'new' ? null : food
  const servings = useQuery({ queryKey: ['foods', 'servings', existing?.id], queryFn: () => fetchServings(existing!.id), enabled: !!existing })
  const [confirm, setConfirm] = useState(false)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['foods'] })

  const toggleArchive = async () => {
    if (!existing) return
    try {
      await (existing.archived_at ? restoreFood(existing.id) : archiveFood(existing.id))
      refresh(); onClose()
      toast(existing.archived_at ? `Restored ${existing.name}` : `Archived ${existing.name}. It’s kept in your diary history.`)
    } catch { toast('Couldn’t change that food.', { kind: 'error' }) }
  }
  const remove = async () => {
    if (!existing) return
    try { await deleteFood(existing.id); refresh(); void qc.invalidateQueries({ queryKey: ['templates'] }); onClose(); toast(`Deleted ${existing.name}`) } catch { toast('Couldn’t delete that food.', { kind: 'error' }) }
  }

  return (
    <Dialog open onClose={onClose} title={existing ? `Edit ${existing.name}` : 'New food'} wide closable>
      <h2 className="mb-4 pr-8 text-xl font-semibold">{existing ? 'Edit food' : 'New food'}</h2>
      {existing && !servings.isFetched ? <div className="skeleton h-40" /> : (
        <FoodForm food={existing ?? undefined} servings={servings.data ?? []} onCancel={onClose}
          onSaved={(f) => { refresh(); onClose(); toast(`${existing ? 'Saved' : 'Created'} ${f.name}`) }} />
      )}
      {existing && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <button onClick={() => void toggleArchive()} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-hover hover:text-ink">{existing.archived_at ? 'Restore' : 'Archive'}</button>
          <button onClick={() => setConfirm(true)} className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">Delete for good</button>
          <p className="w-full text-xs text-faint">Archiving hides it from search. Either way, what you already logged stays in your diary exactly as it was.</p>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger confirmLabel="Delete" title={`Delete ${existing?.name}?`}
        body="Your diary keeps every entry of it. Saved meals that include it lose this item." onConfirm={() => void remove()} />
    </Dialog>
  )
}

export function Foods() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('foods')
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 200)
  const [open, setOpen] = useState<Food | 'new' | null>(null)
  const foods = useQuery({ queryKey: ['foods', 'list', tab, q], queryFn: () => searchFoods(q, { archived: tab === 'archived', limit: 200 }), enabled: tab !== 'meals' })
  const meals = useQuery({ queryKey: ['templates'], queryFn: listTemplates, enabled: tab === 'meals' })

  const removeMeal = async (id: string, name: string) => {
    try { await deleteTemplate(id); void qc.invalidateQueries({ queryKey: ['templates'] }); toast(`Deleted ${name}`) } catch { toast('Couldn’t delete that meal.', { kind: 'error' }) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl px-4 pb-32 lg:px-6 lg:pb-8">
        <div className="rise mb-5 flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold leading-tight">Foods</h1>
          <button onClick={() => setOpen('new')} className="bg-accent flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-on-accent"><IconPlus size={16} /> New food</button>
        </div>

        <div className="mb-4 flex gap-1.5" role="tablist">
          {([['foods', 'Your foods'], ['meals', 'Saved meals'], ['archived', 'Archived']] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${tab === t ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-hover hover:text-ink'}`}>{label}</button>
          ))}
        </div>

        {tab !== 'meals' && (
          <>
            <label className="relative mb-4 block">
              <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search foods" className="field pl-10" />
            </label>
            <Card pad={false} className="rise">
              <ul className="p-2">
                {foods.isLoading && <li className="skeleton m-2 h-12" />}
                {foods.isSuccess && foods.data.length === 0 && (
                  <li className="px-3 py-4 text-sm text-faint">{q ? `Nothing matches “${q}”.` : tab === 'archived' ? 'No archived foods.' : 'No foods yet. Create one, or log something and it’ll appear here.'}</li>
                )}
                {(foods.data ?? []).map((f) => (
                  <li key={f.id}>
                    <button onClick={() => setOpen(f)} className="flex w-full items-baseline gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.name}{f.brand && <span className="font-normal text-faint"> · {f.brand}</span>}</span>
                        <span className="block truncate text-xs text-muted"><NutritionLine n={f} /> <span className="text-faint">per 100 g</span></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {tab === 'meals' && (
          <div className="space-y-3">
            {meals.isLoading && <div className="skeleton h-20" />}
            {meals.isSuccess && meals.data.length === 0 && (
              <Card><p className="text-sm text-faint">No saved meals yet. Log a meal you eat often, then choose “Save as a meal…” from its ⋯ menu.</p></Card>
            )}
            {(meals.data ?? []).map((m) => {
              const items = [...m.meal_template_items].sort((a, b) => a.position - b.position)
              const total = items.reduce((sum, i) => sum + (i.foods ? scale(i.foods, i.grams).kcal : 0), 0)
              return (
                <Card key={m.id} title={m.name} aside={<span className="tabular-nums">{fmtKcal(total)} kcal</span>} className="rise">
                  <ul className="mb-3 space-y-1 text-sm">
                    {items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span className={`truncate ${i.foods?.archived_at ? 'text-faint line-through' : ''}`}>{i.foods?.name ?? 'Deleted food'}</span>
                        <span className="shrink-0 text-muted tabular-nums">{i.serving_label && i.serving_qty ? `${i.serving_qty} × ${i.serving_label}` : `${i.grams} g`}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => void removeMeal(m.id, m.name)} className="text-sm text-danger">Delete saved meal</button>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      {open && <FoodDialog food={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
