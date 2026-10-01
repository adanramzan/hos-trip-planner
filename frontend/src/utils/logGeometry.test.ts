import { expect, test } from 'vitest'
import { hourToX } from './logGeometry'

test('Test 13: 06:00 and 12:00 land at 25% and 50% of the graph width', () => {
  const left = 150, width = 840
  expect((hourToX(6, left, width) - left) / width).toBe(0.25)
  expect((hourToX(12, left, width) - left) / width).toBe(0.5)
})
