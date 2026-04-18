import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { convergenceStudy, solveCantileverBeam } from './lib/beam'
import './App.css'

type FemType = 'Beam' | 'Solid'

type RunParams = {
  lengthM: number
  sideMm: number
  elasticModulusGpa: number
  nu: number
  sigmaYieldMpa: number
  forceN: number
  nElements: number
  femType: FemType
  solidOrder: 1 | 2
}

const initialParams: RunParams = {
  lengthM: 1,
  sideMm: 25,
  elasticModulusGpa: 210,
  nu: 0.3,
  sigmaYieldMpa: 250,
  forceN: 500,
  nElements: 16,
  femType: 'Beam',
  solidOrder: 1,
}

function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits })
}

function BeamScene({
  x,
  w,
  scale,
  lengthM,
  sideMm,
  forceN,
  damageLevel,
}: {
  x: number[]
  w: number[]
  scale: number
  lengthM: number
  sideMm: number
  forceN: number
  damageLevel: 'ok' | 'warn' | 'fail'
}) {
  const width = 980
  const height = 340
  const padX = 76
  const padY = 38

  const spanPx = width - 2 * padX
  const centerY = 148
  const wScaled = w.map((v) => v * scale)

  const amp = Math.max(1e-6, ...wScaled.map((v) => Math.abs(v)))
  const maxDraw = Math.min(130, 0.42 * (height - 2 * padY))
  // Physical-like base scale in px per meter (depends on beam length),
  // with a soft cap only when deformation would overflow the viewport.
  const basePxPerMeter = (0.22 * spanPx) / Math.max(lengthM, 1e-6)
  const clampPxPerMeter = maxDraw / amp
  const yScale = Math.min(basePxPerMeter, clampPxPerMeter)
  const isClamped = clampPxPerMeter < basePxPerMeter

  const xToPx = (xx: number) => padX + (xx / Math.max(lengthM, 1e-6)) * spanPx
  const yToPx = (yy: number) => centerY - yy * yScale

  const undeformedTop = x.map((xx) => `${xToPx(xx)},${centerY - 14}`).join(' ')
  const undeformedBottom = [...x].reverse().map((xx) => `${xToPx(xx)},${centerY + 14}`).join(' ')

  const deformedTop = x
    .map((xx, i) => `${xToPx(xx)},${yToPx(wScaled[i]) - 14}`)
    .join(' ')
  const deformedBottom = [...x]
    .reverse()
    .map((xx, iRev) => {
      const i = x.length - 1 - iRev
      return `${xToPx(xx)},${yToPx(wScaled[i]) + 14}`
    })
    .join(' ')

  const tipX = xToPx(lengthM)
  const tipY = yToPx(wScaled[wScaled.length - 1])
  const elementCount = Math.max(0, x.length - 1)
  const maxVisibleLines = 80
  const stride = elementCount > maxVisibleLines ? Math.ceil(elementCount / maxVisibleLines) : 1
  const shownElementCount = Math.ceil(elementCount / stride)

  return (
    <div className="card">
      <h3>Визуализация балки</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="beam-svg" role="img" aria-label="Схема балки">
        <defs>
          <linearGradient id="beamFill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#2a2f4f" />
            <stop offset="100%" stopColor="#4664b0" />
          </linearGradient>
          <linearGradient id="deformedFill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={damageLevel === 'ok' ? '#f97316' : '#fb7185'} />
            <stop offset="100%" stopColor={damageLevel === 'fail' ? '#991b1b' : '#dc2626'} />
          </linearGradient>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#1d4ed8" />
          </marker>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#2a2f4f" strokeWidth="2" />
          </pattern>
        </defs>

        <rect x={18} y={36} width={42} height={240} fill="url(#hatch)" opacity="0.35" />
        <line x1={62} y1={30} x2={62} y2={286} stroke="#1f2a44" strokeWidth={5} />

        <polygon points={`${undeformedTop} ${undeformedBottom}`} fill="url(#beamFill)" opacity="0.25" />
        <polygon points={`${deformedTop} ${deformedBottom}`} fill="url(#deformedFill)" opacity="0.88" />

        {damageLevel === 'fail' && (
          <polyline
            points={`${padX + 70},${centerY - 18} ${padX + 76},${centerY - 6} ${padX + 66},${centerY + 2} ${padX + 74},${centerY + 14}`}
            stroke="#111827"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <g opacity={0.65}>
          {x.map((xx, i) => {
            if (i % stride !== 0 && i !== x.length - 1) return null
            const xxPx = xToPx(xx)
            const yy = yToPx(wScaled[i])
            return (
              <line
                key={`grid-${i}`}
                x1={xxPx}
                y1={yy - 14}
                x2={xxPx}
                y2={yy + 14}
                stroke="#ffffff"
                strokeWidth={1}
              />
            )
          })}
        </g>

        <g>
          {x.map((xx, i) => {
            if (i % stride !== 0 && i !== x.length - 1) return null
            return <circle key={`node-${i}`} cx={xToPx(xx)} cy={yToPx(wScaled[i])} r={2.1} fill="#111827" />
          })}
        </g>

        <line
          x1={tipX}
          y1={tipY - 40}
          x2={tipX}
          y2={tipY - 4}
          stroke="#1d4ed8"
          strokeWidth={2.5}
          markerEnd="url(#arrow)"
        />

        <text x={tipX - 8} y={tipY - 52} fill="#1d4ed8" fontSize="13" textAnchor="end" fontWeight={700}>
          F = {formatNumber(forceN, 1)} Н
        </text>

        <line x1={padX} y1={centerY + 90} x2={padX + spanPx} y2={centerY + 90} stroke="#9aa4b2" strokeWidth={1} />
        <text x={padX} y={centerY + 110} fill="#607086" fontSize="12">
          x = 0
        </text>
        <text x={padX + spanPx - 46} y={centerY + 110} fill="#607086" fontSize="12">
          x = L
        </text>

        <text x={72} y={24} fill="#354860" fontSize="12" fontWeight={700}>
          Заделка
        </text>
        <text x={padX + 22} y={42} fill="#354860" fontSize="12">
          a = {formatNumber(sideMm, 1)} мм
        </text>
        <text x={padX + 22} y={60} fill="#354860" fontSize="12">
          Масштаб деформации: x{scale}
        </text>
        <text x={padX + 22} y={78} fill="#354860" fontSize="12">
          Элементы: {elementCount} (на схеме: {shownElementCount})
        </text>
        {isClamped && (
          <text x={padX + 22} y={96} fill="#b45309" fontSize="12" fontWeight={700}>
            Визуализация ограничена по высоте (прогиб очень большой)
          </text>
        )}
        {damageLevel === 'fail' && (
          <text x={padX + 230} y={28} fill="#991b1b" fontSize="13" fontWeight={700}>
            Опасный режим: вероятна потеря несущей способности
          </text>
        )}
      </svg>
    </div>
  )
}

function App() {
  const [params, setParams] = useState<RunParams>(initialParams)
  const [deformationScale, setDeformationScale] = useState(20)

  const beamResult = useMemo(() => {
    if (params.femType !== 'Beam') return null
    return solveCantileverBeam({
      lengthM: params.lengthM,
      sideMm: params.sideMm,
      elasticModulusGpa: params.elasticModulusGpa,
      forceN: params.forceN,
      nElements: params.nElements,
    })
  }, [params])

  const convergence = useMemo(() => {
    if (params.femType !== 'Beam') return []
    return convergenceStudy({
      lengthM: params.lengthM,
      sideMm: params.sideMm,
      elasticModulusGpa: params.elasticModulusGpa,
      forceN: params.forceN,
      nStart: Math.max(2, Math.floor(params.nElements / 4)),
      maxSteps: 6,
      tolerancePercent: 1,
    })
  }, [params])

  const stressChartData = useMemo(() => {
    if (!beamResult) return []
    return beamResult.sigmaVmElement.map((v, idx) => ({
      element: idx + 1,
      sigmaMpa: v / 1e6,
    }))
  }, [beamResult])

  const convergenceData = useMemo(() => {
    return convergence.map((row) => ({
      elements: row.elements,
      deltaMm: row.deltaMaxM * 1000,
      sigmaMpa: row.sigmaMaxPa / 1e6,
    }))
  }, [convergence])

  const reserveFactor = useMemo(() => {
    if (!beamResult || beamResult.sigmaMax <= 0) return null
    return (params.sigmaYieldMpa * 1e6) / beamResult.sigmaMax
  }, [beamResult, params.sigmaYieldMpa])

  const assessment = useMemo(() => {
    if (!beamResult || params.femType !== 'Beam') {
      return { level: 'ok' as const, messages: [] as string[] }
    }

    const messages: string[] = []
    const deltaRatio = beamResult.deltaMax / Math.max(params.lengthM, 1e-9)
    const yielded = reserveFactor !== null && reserveFactor < 1
    const severeYield = reserveFactor !== null && reserveFactor < 0.5
    const largeDeflection = deltaRatio > 0.1
    const extremeDeflection = deltaRatio > 0.25

    if (yielded) {
      messages.push(
        `Превышен предел текучести: σ_max (${formatNumber(beamResult.sigmaMax / 1e6, 1)} МПа) > σ_y (${formatNumber(params.sigmaYieldMpa, 1)} МПа).`
      )
    }
    if (largeDeflection) {
      messages.push(
        `Большой относительный прогиб: δ/L = ${formatNumber(deltaRatio * 100, 2)}%. Линейная модель может быть некорректной.`
      )
    }
    if (extremeDeflection) {
      messages.push('Крайне большой прогиб: возможна потеря работоспособности конструкции.')
    }

    let level: 'ok' | 'warn' | 'fail' = 'ok'
    if (severeYield || extremeDeflection) level = 'fail'
    else if (yielded || largeDeflection) level = 'warn'

    return { level, messages }
  }, [beamResult, params.femType, params.lengthM, params.sigmaYieldMpa, reserveFactor])

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>FEM Beam Lab</h1>

        <label>
          Длина балки L (м)
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={params.lengthM}
            onChange={(e) => setParams((v) => ({ ...v, lengthM: Number(e.target.value) }))}
          />
        </label>

        <label>
          Сторона сечения a (мм)
          <input
            type="number"
            min={5}
            step={1}
            value={params.sideMm}
            onChange={(e) => setParams((v) => ({ ...v, sideMm: Number(e.target.value) }))}
          />
        </label>

        <label>
          Модуль упругости E (ГПа)
          <input
            type="number"
            min={1}
            step={1}
            value={params.elasticModulusGpa}
            onChange={(e) => setParams((v) => ({ ...v, elasticModulusGpa: Number(e.target.value) }))}
          />
        </label>

        <label>
          Коэффициент Пуассона ν
          <input
            type="number"
            min={0}
            max={0.49}
            step={0.01}
            value={params.nu}
            onChange={(e) => setParams((v) => ({ ...v, nu: Number(e.target.value) }))}
          />
        </label>

        <label>
          Предел текучести σy (МПа)
          <input
            type="number"
            min={1}
            step={1}
            value={params.sigmaYieldMpa}
            onChange={(e) => setParams((v) => ({ ...v, sigmaYieldMpa: Number(e.target.value) }))}
          />
        </label>

        <label>
          Сила F (Н)
          <input
            type="number"
            min={1}
            step={10}
            value={params.forceN}
            onChange={(e) => setParams((v) => ({ ...v, forceN: Number(e.target.value) }))}
          />
        </label>

        <label>
          Тип FEM
          <select
            value={params.femType}
            onChange={(e) => setParams((v) => ({ ...v, femType: e.target.value as FemType }))}
          >
            <option value="Beam">Beam</option>
            <option value="Solid">Solid</option>
          </select>
        </label>

        <label>
          Порядок для Solid
          <select
            value={params.solidOrder}
            onChange={(e) => setParams((v) => ({ ...v, solidOrder: Number(e.target.value) as 1 | 2 }))}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>

        <label>
          Количество элементов
          <input
            type="range"
            min={2}
            max={256}
            step={2}
            value={params.nElements}
            onChange={(e) => setParams((v) => ({ ...v, nElements: Number(e.target.value) }))}
          />
          <span className="range-value">{params.nElements}</span>
        </label>
      </aside>

      <main className="content">
        <section className="card results">
          <h2>Результаты</h2>
          {params.femType === 'Beam' && beamResult ? (
            <div className="metrics-grid">
              <div>
                <span>δ_max FEM</span>
                <strong>{formatNumber(beamResult.deltaMax * 1000, 3)} мм</strong>
              </div>
              <div>
                <span>δ_max аналитика</span>
                <strong>{formatNumber(beamResult.deltaAnalytic * 1000, 3)} мм</strong>
              </div>
              <div>
                <span>σ_max FEM</span>
                <strong>{formatNumber(beamResult.sigmaMax / 1e6, 3)} МПа</strong>
              </div>
              <div>
                <span>σ_max аналитика</span>
                <strong>{formatNumber(beamResult.sigmaAnalytic / 1e6, 3)} МПа</strong>
              </div>
              <div>
                <span>Ошибка по прогибу</span>
                <strong>{formatNumber(beamResult.deltaErrorPercent, 3)} %</strong>
              </div>
              <div>
                <span>Ошибка по напряжению</span>
                <strong>{formatNumber(beamResult.sigmaErrorPercent, 3)} %</strong>
              </div>
              <div>
                <span>Коэфф. запаса</span>
                <strong>{reserveFactor ? formatNumber(reserveFactor, 3) : '—'}</strong>
              </div>
              <div>
                <span>ν (для будущего Solid)</span>
                <strong>{formatNumber(params.nu, 3)}</strong>
              </div>
            </div>
          ) : (
            <p>
              Solid-режим пока заглушка. В текущей версии реализован полноценный Beam FEM.
            </p>
          )}
        </section>

        {params.femType === 'Beam' && beamResult && (
          <>
            {assessment.level !== 'ok' && (
              <section className={`card status-card ${assessment.level}`}>
                <h3>{assessment.level === 'fail' ? 'Критическое состояние балки' : 'Предупреждение по расчету'}</h3>
                <ul>
                  {assessment.messages.map((m, i) => (
                    <li key={`msg-${i}`}>{m}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="toolbar">
                <h2>Деформация балки</h2>
                <label>
                  Масштаб:
                  <input
                    type="range"
                    min={1}
                    max={400}
                    step={1}
                    value={deformationScale}
                    onChange={(e) => setDeformationScale(Number(e.target.value))}
                  />
                  <span>x{deformationScale}</span>
                </label>
              </div>
              <BeamScene
                x={beamResult.x}
                w={beamResult.w}
                scale={deformationScale}
                lengthM={params.lengthM}
                sideMm={params.sideMm}
                forceN={params.forceN}
                damageLevel={assessment.level}
              />
            </section>

            <section className="charts-grid">
              <div className="card">
                <h3>Напряжения von Mises по элементам</h3>
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={stressChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="element" />
                    <YAxis />
                    <Tooltip formatter={(value) => `${formatNumber(Number(value), 3)} МПа`} />
                    <Bar dataKey="sigmaMpa" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h3>Сходимость по сетке</h3>
                <ResponsiveContainer width="100%" height={270}>
                  <LineChart data={convergenceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="elements" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line yAxisId="left" type="monotone" dataKey="deltaMm" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} name="δ_max, мм" />
                    <Line yAxisId="right" type="monotone" dataKey="sigmaMpa" stroke="#dc2626" strokeWidth={3} dot={{ r: 3 }} name="σ_max, МПа" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}

        <section className="card help">
          <h3>Справка</h3>
          <details open>
            <summary>Что делает приложение</summary>
            <p>
              Приложение рассчитывает консольную балку методом конечных элементов (FEM): один конец балки жестко
              закреплен, к свободному концу прикладывается сила. Режим <b>Beam</b> полностью рабочий, режим <b>Solid</b>{' '}
              пока оставлен как точка расширения.
            </p>
          </details>

          <details>
            <summary>Быстрый запуск для нового пользователя</summary>
            <ol>
              <li>Задайте геометрию, материал, нагрузку и число элементов в левой панели.</li>
              <li>Выберите тип FEM = Beam (пересчет выполняется автоматически при изменении полей).</li>
              <li>Проверьте таблицу результатов, визуализацию балки, напряжения и сходимость по сетке.</li>
            </ol>
          </details>

          <details>
            <summary>Расшифровка параметров</summary>
            <ul>
              <li>
                <b>L (м)</b> - длина балки от заделки до свободного конца.
              </li>
              <li>
                <b>a (мм)</b> - сторона квадратного поперечного сечения.
              </li>
              <li>
                <b>E (ГПа)</b> - модуль упругости материала.
              </li>
              <li>
                <b>v</b> - коэффициент Пуассона (в Beam-расчете хранится для совместимости с будущим Solid).
              </li>
              <li>
                <b>sy (МПа)</b> - предел текучести для оценки запаса прочности.
              </li>
              <li>
                <b>F (Н)</b> - сила на свободном конце.
              </li>
              <li>
                <b>Количество элементов</b> - насколько мелко балка разбивается по длине.
              </li>
            </ul>
          </details>

          <details>
            <summary>Как считается Beam FEM</summary>
            <ol>
              <li>Балка делится на n элементов одинаковой длины le = L / n.</li>
              <li>Для каждого элемента строится локальная матрица жесткости ke.</li>
              <li>Локальные матрицы собираются в глобальную матрицу K.</li>
              <li>Граничные условия заделки: w(0)=0 и theta(0)=0.</li>
              <li>К свободному концу прикладывается нагрузка F.</li>
              <li>Решается система линейных уравнений K*u=f.</li>
              <li>По решению вычисляются прогибы, углы поворота и эквивалентные напряжения.</li>
            </ol>
            <p>
              Для сравнения используются аналитические формулы консольной балки:
              <br />
              I = a^4/12,
              <br />
              delta_max = F*L^3/(3*E*I),
              <br />
              sigma_max = 6*F*L/a^3.
            </p>
          </details>

          <details>
            <summary>Как читать результаты</summary>
            <ul>
              <li>
                <b>delta_max FEM / аналитика</b> - прогиб свободного конца.
              </li>
              <li>
                <b>sigma_max FEM / аналитика</b> - максимальное напряжение.
              </li>
              <li>
                <b>Ошибка</b> - относительное отклонение FEM от аналитики в процентах.
              </li>
              <li>
                <b>Коэффициент запаса</b> = sy / sigma_max (если больше 1, запас по текучести есть).
              </li>
              <li>
                График <b>напряжений</b> показывает распределение sigma_vm по элементам.
              </li>
              <li>
                График <b>сходимости</b> показывает, стабилизируются ли delta и sigma при уплотнении сетки.
              </li>
            </ul>
          </details>
        </section>
      </main>
    </div>
  )
}

export default App

