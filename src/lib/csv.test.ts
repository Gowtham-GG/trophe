import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes what needs quoting', () => {
    expect(toCsv(['name', 'kcal'], [['Dal, tadka', 172.5], ['Say "hi"', null], ['two\nlines', 0]]))
      .toBe('name,kcal\r\n"Dal, tadka",172.5\r\n"Say ""hi""",\r\n"two\nlines",0\r\n')
  })
  it('keeps formulas as text', () => {
    expect(toCsv(['name'], [['=HYPERLINK("x")'], ['-5 kg'], ['+1'], ['@cmd']])).toBe('name\r\n"\'=HYPERLINK(""x"")"\r\n\'-5 kg\r\n\'+1\r\n\'@cmd\r\n')
    expect(toCsv(['n'], [[-5]])).toBe('n\r\n-5\r\n') // a real negative number stays a number
  })
})
