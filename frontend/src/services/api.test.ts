import { afterEach, expect, it, vi } from 'vitest'
import type { LogDetails, TripForm } from '../types/trip'
import { planTrip } from './api'

const form: TripForm = { current: 'A', pickup: 'B', dropoff: 'C', cycle: '0', depart: '2026-10-05T08:00', ll: {} }
const reply = (status: number, error: object) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error }), { status })))

afterEach(() => vi.unstubAllGlobals())

it('puts an invalid_input message on the matching form field', async () => {
  reply(400, { code: 'invalid_input', message: 'Current cycle used must be between 0 and 70.', field: 'current_cycle_used' })
  await expect(planTrip(form, {} as LogDetails)).rejects.toMatchObject({ field: 'cycle', message: 'Current cycle used must be between 0 and 70.' })
})

it('keeps the generic error when invalid_input names no known field', async () => {
  reply(400, { code: 'invalid_input', message: 'Bad request.' })
  await expect(planTrip(form, {} as LogDetails)).rejects.toMatchObject({ kind: 'unexpected' })
})
