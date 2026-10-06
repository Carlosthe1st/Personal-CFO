'use client'

import { useEffect, useState } from 'react'
import { portugalDate } from '../lib/date'

type Forecast = {
  actualCents: string
  minimumProjectedCents: string
  points: { date: string; projectedCents: string }[]
  assumptions: string[]
}
function euro(cents: string) {
  const value = BigInt(cents)
  const absolute = value < BigInt(0) ? -value : value
  return `${value < BigInt(0) ? '−' : ''}${new Intl.NumberFormat('pt-PT').format(absolute / BigInt(100))},${String(absolute % BigInt(100)).padStart(2, '0')} €`
}
export function ForecastPanel({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    fetch(
      `/api/organizations/${organizationId}/forecast?today=${portugalDate(new Date())}`,
      { signal: controller.signal, cache: 'no-store' },
    )
      .then((response) => {
        if (!response.ok)
          throw new Error('Não foi possível calcular a previsão.')
        return response.json() as Promise<Forecast>
      })
      .then((data) => {
        if (!controller.signal.aborted) setForecast(data)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Erro de ligação.')
      })
    return () => controller.abort()
  }, [open, organizationId, revision])
  return (
    <section>
      <h2>Previsão de caixa — 90 dias</h2>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Fechar previsão de caixa' : 'Abrir previsão de caixa'}
      </button>
      {open && (
        <>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Atualizar previsão
          </button>
          {error && <p role="alert">{error}</p>}
          {forecast && (
            <>
              <p>Saldo real: {euro(forecast.actualCents)}</p>
              <p>
                Menor saldo projetado: {euro(forecast.minimumProjectedCents)}
              </p>
              {BigInt(forecast.minimumProjectedCents) < BigInt(0) && (
                <p role="alert">
                  A projeção indica saldo negativo em algum momento dos próximos
                  90 dias.
                </p>
              )}
              <ul>
                {forecast.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <details>
                <summary>Ver evolução diária</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Saldo projetado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.points.map((point) => (
                      <tr key={point.date}>
                        <td>{point.date}</td>
                        <td>{euro(point.projectedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </section>
  )
}
