const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const compiled = ts.transpileModule(readFileSync(join(__dirname, '../src/utils/sharedWebcam.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exportsForTest = {}
vm.runInNewContext(compiled, { exports: exportsForTest })
const { createSharedWebcamPool } = exportsForTest

function fakeStream() {
  let stops = 0
  return { getTracks: () => [{ stop: () => { stops++ } }], get stops() { return stops } }
}

test('four simultaneous cards open one device; removing one keeps the other three alive', async () => {
  let opens = 0
  let resolveOpen
  const stream = fakeStream()
  const pool = createSharedWebcamPool(() => {
    opens++
    return new Promise(resolve => { resolveOpen = resolve })
  })
  const requests = Array.from({ length: 4 }, () => pool.acquire('webcam-0'))
  await Promise.resolve()
  assert.equal(opens, 1)
  resolveOpen(stream)
  const leases = await Promise.all(requests)
  assert.ok(leases.every(lease => lease.stream === stream))
  leases[0].release()
  leases[0].release() // unmount and error cleanup may both run
  assert.equal(stream.stops, 0)
  leases.slice(1).forEach(lease => lease.release())
  assert.equal(stream.stops, 1)
})

test('a cancelled pending card cannot stop a newer card sharing its device', async () => {
  let resolveOpen
  const stream = fakeStream()
  const pool = createSharedWebcamPool(() => new Promise(resolve => { resolveOpen = resolve }))
  const cancelled = pool.acquire('webcam-0')
  const mounted = pool.acquire('webcam-0')
  await Promise.resolve()
  resolveOpen(stream)
  ;(await cancelled).release()
  const live = await mounted
  assert.equal(stream.stops, 0)
  live.release()
  assert.equal(stream.stops, 1)
})

test('failure is retryable and the last release allows a fresh connection', async () => {
  let opens = 0
  const pool = createSharedWebcamPool(async () => {
    if (++opens === 1) throw new Error('device busy')
    return fakeStream()
  })
  await assert.rejects(pool.acquire('webcam-0'), /device busy/)
  const first = await pool.acquire('webcam-0')
  first.release()
  const second = await pool.acquire('webcam-0')
  assert.notEqual(second.stream, first.stream)
  assert.equal(opens, 3)
  second.release()
})

test('different physical devices keep independent connections', async () => {
  const pool = createSharedWebcamPool(async () => fakeStream())
  const first = await pool.acquire('webcam-0')
  const second = await pool.acquire('webcam-1')
  first.release()
  assert.equal(second.stream.stops, 0)
  second.release()
})
