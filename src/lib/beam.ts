export type BeamInput = {
  lengthM: number
  sideMm: number
  elasticModulusGpa: number
  forceN: number
  nElements: number
}

export type BeamResult = {
  x: number[]
  w: number[]
  theta: number[]
  wAnalytic: number[]
  sigmaAnalyticAtX: number[]
  xElementMid: number[]
  sigmaAnalyticElement: number[]
  sigmaVmElement: number[]
  shearForceElement: number[]
  bendingMomentElement: number[]
  shearAnalyticElement: number[]
  momentAnalyticElement: number[]
  reactionForce: number
  reactionMoment: number
  equilibriumForceResidual: number
  equilibriumMomentResidual: number
  l2DeflectionErrorPercent: number
  l2SigmaErrorPercent: number
  deltaMax: number
  sigmaMax: number
  deltaAnalytic: number
  sigmaAnalytic: number
  deltaErrorPercent: number
  sigmaErrorPercent: number
}

export type ConvergenceRow = {
  elements: number
  deltaMaxM: number
  sigmaMaxPa: number
  deltaChangePercent: number | null
  sigmaChangePercent: number | null
}

function elementStiffness(ei: number, le: number): number[][] {
  const f = ei / (le ** 3)
  return [
    [12 * f, 6 * le * f, -12 * f, 6 * le * f],
    [6 * le * f, 4 * (le ** 2) * f, -6 * le * f, 2 * (le ** 2) * f],
    [-12 * f, -6 * le * f, 12 * f, -6 * le * f],
    [6 * le * f, 2 * (le ** 2) * f, -6 * le * f, 4 * (le ** 2) * f],
  ]
}

function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row) => [...row])
  const rhs = [...b]

  for (let i = 0; i < n; i += 1) {
    let pivot = i
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) {
        pivot = r
      }
    }

    if (Math.abs(m[pivot][i]) < 1e-14) {
      throw new Error('Система уравнений вырожденная или плохо обусловленная.')
    }

    if (pivot !== i) {
      ;[m[i], m[pivot]] = [m[pivot], m[i]]
      ;[rhs[i], rhs[pivot]] = [rhs[pivot], rhs[i]]
    }

    const diag = m[i][i]
    for (let j = i; j < n; j += 1) {
      m[i][j] /= diag
    }
    rhs[i] /= diag

    for (let r = 0; r < n; r += 1) {
      if (r === i) continue
      const factor = m[r][i]
      if (Math.abs(factor) < 1e-18) continue
      for (let c = i; c < n; c += 1) {
        m[r][c] -= factor * m[i][c]
      }
      rhs[r] -= factor * rhs[i]
    }
  }

  return rhs
}

export function solveCantileverBeam(input: BeamInput): BeamResult {
  const { lengthM, sideMm, elasticModulusGpa, forceN, nElements } = input
  const safeElements = Math.max(1, Math.floor(nElements))

  const a = sideMm / 1000
  const e = elasticModulusGpa * 1e9
  const i = (a ** 4) / 12
  const ei = e * i

  const nNodes = safeElements + 1
  const totalDof = nNodes * 2
  const le = lengthM / safeElements

  const kGlobal: number[][] = Array.from({ length: totalDof }, () => Array(totalDof).fill(0))
  const fGlobal: number[] = Array(totalDof).fill(0)

  const kLocal = elementStiffness(ei, le)

  for (let el = 0; el < safeElements; el += 1) {
    const n1 = el
    const n2 = el + 1
    const dof = [2 * n1, 2 * n1 + 1, 2 * n2, 2 * n2 + 1]

    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        kGlobal[dof[r]][dof[c]] += kLocal[r][c]
      }
    }
  }

  fGlobal[2 * (nNodes - 1)] = -Math.abs(forceN)

  const fixed = new Set([0, 1])
  const free: number[] = []
  for (let d = 0; d < totalDof; d += 1) {
    if (!fixed.has(d)) free.push(d)
  }

  const kff: number[][] = free.map((r) => free.map((c) => kGlobal[r][c]))
  const ff: number[] = free.map((d) => fGlobal[d])
  const uf = solveLinearSystem(kff, ff)

  const u: number[] = Array(totalDof).fill(0)
  free.forEach((d, idx) => {
    u[d] = uf[idx]
  })

  const w = Array.from({ length: nNodes }, (_, n) => u[2 * n])
  const theta = Array.from({ length: nNodes }, (_, n) => u[2 * n + 1])
  const x = Array.from({ length: nNodes }, (_, n) => (lengthM * n) / safeElements)

  const reactions = Array(totalDof).fill(0)
  for (let r = 0; r < totalDof; r += 1) {
    let sum = 0
    for (let c = 0; c < totalDof; c += 1) {
      sum += kGlobal[r][c] * u[c]
    }
    reactions[r] = sum - fGlobal[r]
  }
  const reactionForce = reactions[0]
  const reactionMoment = reactions[1]

  const sigmaVmElement: number[] = Array(safeElements).fill(0)
  const shearForceElement: number[] = Array(safeElements).fill(0)
  const bendingMomentElement: number[] = Array(safeElements).fill(0)
  const xElementMid: number[] = Array(safeElements).fill(0)
  const c = a / 2

  for (let el = 0; el < safeElements; el += 1) {
    const n1 = el
    const n2 = el + 1
    const dof = [2 * n1, 2 * n1 + 1, 2 * n2, 2 * n2 + 1]
    const ue = dof.map((id) => u[id])

    const q = Array(4).fill(0)
    for (let r = 0; r < 4; r += 1) {
      for (let k = 0; k < 4; k += 1) {
        q[r] += kLocal[r][k] * ue[k]
      }
    }

    const mMax = Math.max(Math.abs(q[1]), Math.abs(q[3]))
    sigmaVmElement[el] = (mMax * c) / i
    shearForceElement[el] = q[0]
    bendingMomentElement[el] = 0.5 * (q[1] + q[3])
    xElementMid[el] = 0.5 * (x[n1] + x[n2])
  }

  const deltaMax = Math.abs(w[w.length - 1])
  const sigmaMax = Math.max(...sigmaVmElement)

  const deltaAnalytic = (Math.abs(forceN) * (lengthM ** 3)) / (3 * e * i)
  const sigmaAnalytic = (6 * Math.abs(forceN) * lengthM) / (a ** 3)

  const deltaErrorPercent = deltaAnalytic > 0 ? (Math.abs(deltaMax - deltaAnalytic) / deltaAnalytic) * 100 : 0
  const sigmaErrorPercent = sigmaAnalytic > 0 ? (Math.abs(sigmaMax - sigmaAnalytic) / sigmaAnalytic) * 100 : 0

  const wAnalytic = x.map((xx) => -(Math.abs(forceN) * xx ** 2 * (3 * lengthM - xx)) / (6 * e * i))
  const sigmaAnalyticAtX = x.map((xx) => (6 * Math.abs(forceN) * (lengthM - xx)) / (a ** 3))
  const sigmaAnalyticElement = xElementMid.map((xx) => (6 * Math.abs(forceN) * (lengthM - xx)) / (a ** 3))
  const shearAnalyticElement = xElementMid.map(() => -Math.abs(forceN))
  const momentAnalyticElement = xElementMid.map((xx) => -Math.abs(forceN) * (lengthM - xx))

  const wAnalyticNorm = Math.sqrt(wAnalytic.reduce((acc, v) => acc + v * v, 0))
  const wErrorNorm = Math.sqrt(w.reduce((acc, v, idx) => acc + (v - wAnalytic[idx]) ** 2, 0))
  const l2DeflectionErrorPercent = wAnalyticNorm > 0 ? (wErrorNorm / wAnalyticNorm) * 100 : 0

  const sigmaAnalyticNorm = Math.sqrt(sigmaAnalyticElement.reduce((acc, v) => acc + v * v, 0))
  const sigmaErrorNorm = Math.sqrt(
    sigmaVmElement.reduce((acc, v, idx) => acc + (v - sigmaAnalyticElement[idx]) ** 2, 0),
  )
  const l2SigmaErrorPercent = sigmaAnalyticNorm > 0 ? (sigmaErrorNorm / sigmaAnalyticNorm) * 100 : 0

  const equilibriumForceResidual = reactionForce - Math.abs(forceN)
  const equilibriumMomentResidual = reactionMoment - Math.abs(forceN) * lengthM

  return {
    x,
    w,
    theta,
    wAnalytic,
    sigmaAnalyticAtX,
    xElementMid,
    sigmaAnalyticElement,
    sigmaVmElement,
    shearForceElement,
    bendingMomentElement,
    shearAnalyticElement,
    momentAnalyticElement,
    reactionForce,
    reactionMoment,
    equilibriumForceResidual,
    equilibriumMomentResidual,
    l2DeflectionErrorPercent,
    l2SigmaErrorPercent,
    deltaMax,
    sigmaMax,
    deltaAnalytic,
    sigmaAnalytic,
    deltaErrorPercent,
    sigmaErrorPercent,
  }
}

export function convergenceStudy(input: Omit<BeamInput, 'nElements'> & { nStart: number, maxSteps?: number, tolerancePercent?: number }): ConvergenceRow[] {
  const {
    lengthM,
    sideMm,
    elasticModulusGpa,
    forceN,
    nStart,
    maxSteps = 6,
    tolerancePercent = 1,
  } = input

  const rows: ConvergenceRow[] = []
  let n = Math.max(1, Math.floor(nStart))
  let prevDelta: number | null = null
  let prevSigma: number | null = null

  for (let step = 0; step < maxSteps; step += 1) {
    const r = solveCantileverBeam({
      lengthM,
      sideMm,
      elasticModulusGpa,
      forceN,
      nElements: n,
    })

    const deltaChangePercent = prevDelta && prevDelta > 0 ? (Math.abs(r.deltaMax - prevDelta) / prevDelta) * 100 : null
    const sigmaChangePercent = prevSigma && prevSigma > 0 ? (Math.abs(r.sigmaMax - prevSigma) / prevSigma) * 100 : null

    rows.push({
      elements: n,
      deltaMaxM: r.deltaMax,
      sigmaMaxPa: r.sigmaMax,
      deltaChangePercent,
      sigmaChangePercent,
    })

    if (
      deltaChangePercent !== null
      && sigmaChangePercent !== null
      && deltaChangePercent < tolerancePercent
      && sigmaChangePercent < tolerancePercent
    ) {
      break
    }

    prevDelta = r.deltaMax
    prevSigma = r.sigmaMax
    n *= 2
  }

  return rows
}
