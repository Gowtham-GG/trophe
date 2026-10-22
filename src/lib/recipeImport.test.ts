import { describe, expect, it } from 'vitest'
import page from '../../tests/fixtures/recipe-page.html?raw'
import { extractRecipe, ingredientLine, isPublicAddress, parseYield } from './recipeImport'

describe('extractRecipe', () => {
  it('finds a Recipe in a JSON-LD @graph (with a list of types), decoding entities and tags', () => {
    expect(extractRecipe(page)).toEqual({
      name: 'Dal Tadka & Jeera', portions: 4,
      ingredients: ['1 cup toor dal (rinsed)', '3 cups water', '1 tbsp ghee', '1/2 tsp turmeric', '2 tomatoes, chopped', 'salt to taste'],
    })
  })
  it('a bare Recipe object or an array works; a page without one is null', () => {
    expect(extractRecipe('<script type="application/ld+json">[{"@type":"Recipe","name":"Poha","recipeIngredient":["2 cups poha"]}]</script>'))
      .toEqual({ name: 'Poha', ingredients: ['2 cups poha'], portions: null })
    expect(extractRecipe('<html><p>no recipe here</p></html>')).toBeNull()
    expect(extractRecipe('<script type=application/ld+json>{"@type":"Person","name":"x"}</script>')).toBeNull()
  })
  it('reads the yield', () => {
    expect(parseYield('Serves 6')).toBe(6)
    expect(parseYield(8)).toBe(8)
    expect(parseYield('a big pot')).toBeNull()
    expect(parseYield(undefined)).toBeNull()
  })
})

describe('isPublicAddress', () => {
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '104.16.0.1', '2606:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true)
  })
  it('refuses private, loopback, link-local, metadata and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'localhost', '999.1.1.1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })
})

describe('ingredientLine', () => {
  it('cleans a recipe line for the parser', () => {
    expect(ingredientLine('1 cup (200 grams) toor dal ((split pigeon peas or ¾ cup toor dal))')).toBe('1 cup toor dal')
    expect(ingredientLine('1½ to 2 tablespoon oil')).toBe('1½ tablespoon oil')
    expect(ingredientLine('2-3 green chillies, slit')).toBe('2 green chillies')
    expect(ingredientLine('2 medium tomatoes (deseeded, fine chopped)')).toBe('2 tomatoes')
    expect(ingredientLine('Salt to taste')).toBe('Salt')
  })
})
