// @ts-check
/**
 * ODPT（チャレンジ用 API）から京王ライナーの便データを作る。
 *
 *   node scripts/build-liner-data.mjs            # 取得してから生成
 *   node scripts/build-liner-data.mjs --offline  # data/raw/odpt/ の取得済みデータだけで生成
 *
 * 出力: data/generated/liner.json（git 管理外。build.mjs が ZIP に埋め込む）
 *
 * チャレンジ提供データは応募作品以外に使えず、第三者提供も禁止されている。
 * 取得した生データ（data/raw/）も生成物（data/generated/）もリポジトリに入れないこと。
 *
 * 分かっているデータの癖:
 *   - TrainTimetable は 1 レスポンス 1000 件で打ち切られる。京王線は曜日区分ごとに分けて取る
 *   - 京王ライナーの停車駅以外は時刻が無い（橋本行きの調布は時刻が null で入っている）
 *     → 前後の時刻から駅間距離で按分して通過時刻を推定する（est: true）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const rawDir = join(root, 'data/raw/odpt')
const outFile = join(root, 'data/generated/liner.json')
const offline = process.argv.includes('--offline')

const API = 'https://api-challenge.odpt.org/api/v4'
const LINER = 'odpt.TrainType:Keio.KeioLiner'
/** 京王ライナーが走る路線 */
const RAILWAYS = ['Keio', 'Sagamihara', 'Takao']
const DIRECTIONS = ['Inbound', 'Outbound']
/** 京王線だけは 1000 件を超えるので曜日区分で分ける */
const CALENDARS = ['Weekday', 'SaturdayHoliday', 'Specific.Keio.SaturdayHolidayOnRaceDay']
const MAX_PER_RESPONSE = 1000

/**
 * 地下を走る駅間（車窓から外が見えない）。ODPT に地上・地下の区別が無いので、ここで持つ。
 *   whole: 駅間のほぼ全部が地下
 *   half:  片方の駅が地下で、途中で地上に出る（地下の駅の側の半分を地下とみなす。値は地下の駅）
 * 新宿〜笹塚は笹塚の手前まで地下。調布付近（国領・布田・調布）は 2012 年に地下化
 */
const TUNNELS = {
  whole: [
    ['新宿', '笹塚'],
    ['国領', '布田'],
    ['布田', '調布'],
  ],
  half: [
    ['柴崎', '国領', '国領'],
    ['調布', '西調布', '調布'],
    ['調布', '京王多摩川', '調布'],
  ],
}

function readToken() {
  if (process.env.ODPT_CHALLENGE_TOKEN) return process.env.ODPT_CHALLENGE_TOKEN.trim()
  const envFile = join(root, '.env')
  if (!existsSync(envFile)) return undefined
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('ODPT_CHALLENGE_TOKEN='))
  const v = line?.slice('ODPT_CHALLENGE_TOKEN='.length).trim()
  return v && v !== 'change-me' ? v : undefined
}

/** @param {string} name @param {Record<string,string>} query */
async function fetchOdpt(name, query) {
  const file = join(rawDir, `${name}.json`)
  if (offline) {
    if (!existsSync(file)) throw new Error(`--offline ですが ${file} がありません`)
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  const token = readToken()
  if (!token) throw new Error('ODPT_CHALLENGE_TOKEN が未設定です（.env か環境変数）')
  const [type, ...rest] = Object.entries(query)
  const qs = new URLSearchParams([...rest, ['acl:consumerKey', token]])
  const res = await fetch(`${API}/${type[1]}?${qs}`)
  // URL にトークンが入るので、エラーメッセージに URL を出さない
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text().catch(() => '')}`)
  const json = await res.json()
  writeFileSync(file, JSON.stringify(json))
  console.log(`  ${name}: ${json.length} 件`)
  return json
}

/** "HH:MM" → 0 時からの分。始発前（4 時前）は翌日扱いで 24 時を足す */
function toMin(/** @type {string|undefined|null} */ t) {
  if (!t) return undefined
  const [h, m] = t.split(':').map(Number)
  return (h < 4 ? h + 24 : h) * 60 + m
}

function haversineKm(/** @type {number} */ lat1, /** @type {number} */ lon1, /** @type {number} */ lat2, /** @type {number} */ lon2) {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

const short = (/** @type {string} */ id) => id.split(':').pop() ?? id
const stationOf = (/** @type {any} */ e) => e['odpt:departureStation'] ?? e['odpt:arrivalStation']

async function main() {
  mkdirSync(rawDir, { recursive: true })
  mkdirSync(dirname(outFile), { recursive: true })

  console.log('[liner] ODPT から取得')
  const railways = await fetchOdpt('Railway', { type: 'odpt:Railway', 'odpt:operator': 'odpt.Operator:Keio' })
  const stations = await fetchOdpt('Station', { type: 'odpt:Station', 'odpt:operator': 'odpt.Operator:Keio' })
  const trainTypes = await fetchOdpt('TrainType', { type: 'odpt:TrainType', 'odpt:operator': 'odpt.Operator:Keio' })

  /** @type {any[]} */
  const timetables = []
  for (const rw of RAILWAYS) {
    for (const dir of DIRECTIONS) {
      const cals = rw === 'Keio' ? CALENDARS : [undefined]
      for (const cal of cals) {
        /** @type {Record<string,string>} */
        const q = {
          type: 'odpt:TrainTimetable',
          'odpt:railway': `odpt.Railway:Keio.${rw}`,
          'odpt:railDirection': `odpt.RailDirection:${dir}`,
        }
        if (cal) q['odpt:calendar'] = `odpt.Calendar:${cal}`
        const list = await fetchOdpt(`TrainTimetable_${rw}_${dir}${cal ? `_${cal}` : ''}`, q)
        if (list.length >= MAX_PER_RESPONSE) throw new Error(`${rw} ${dir} ${cal ?? ''} が ${list.length} 件。打ち切られている`)
        timetables.push(...list)
      }
    }
  }

  // ---- 駅・種別の辞書 ----
  /** @type {Record<string, {name: string, nameEn: string, code: string, lat: number, lon: number}>} */
  const stationDict = {}
  for (const s of stations) {
    stationDict[s['owl:sameAs']] = {
      // ODPT の駅名には互換漢字が混ざる（笹塚の「塚」が U+FA10）。照合で食い違わないよう正規化する
      name: (s['odpt:stationTitle']?.ja ?? s['dc:title']).normalize('NFKC'),
      nameEn: s['odpt:stationTitle']?.en ?? '',
      code: s['odpt:stationCode'] ?? '',
      lat: s['geo:lat'],
      lon: s['geo:long'],
    }
  }
  /** @type {Record<string,string>} */
  const typeDict = Object.fromEntries(trainTypes.map((t) => [t['owl:sameAs'], t['odpt:trainTypeTitle']?.ja ?? short(t['owl:sameAs'])]))

  /** @type {Record<string, string[]>} 路線 → 上り（Inbound）方向の駅順 */
  const orderOf = {}
  for (const r of railways) {
    const ids = [...r['odpt:stationOrder']].sort((a, b) => a['odpt:index'] - b['odpt:index']).map((s) => s['odpt:station'])
    orderOf[r['owl:sameAs']] = ids
  }

  // ---- 便ごとにまとめる（路線をまたぐ便は路線ごとに別オブジェクトになっている） ----
  const calOf = (/** @type {any} */ t) => short(t['odpt:calendar']).replace(/^Calendar:/, '').replace(/^Specific\.Keio\./, '')
  /** @type {Map<string, any[]>} */
  const linerGroups = new Map()
  for (const t of timetables) {
    if (t['odpt:trainType'] !== LINER) continue
    const key = `${calOf(t)}-${t['odpt:trainNumber']}`
    const g = linerGroups.get(key) ?? []
    g.push(t)
    linerGroups.set(key, g)
  }

  /** 1 つの時刻表オブジェクトがたどる駅の列（路線の駅順で、停車駅の間を埋める） */
  function segmentStations(/** @type {any} */ t) {
    const order = orderOf[t['odpt:railway']]
    const listed = t['odpt:trainTimetableObject'].map(stationOf)
    const idx = listed.map((/** @type {string} */ s) => order.indexOf(s)).filter((/** @type {number} */ i) => i >= 0)
    const from = idx[0]
    const to = idx[idx.length - 1]
    const step = from <= to ? 1 : -1
    const out = []
    for (let i = from; i !== to + step; i += step) out.push(order[i])
    return out
  }

  /** @type {any[]} */
  const trips = []
  for (const [id, segs] of linerGroups) {
    // 始発駅を含む区間から順につなぐ。接続駅は駅名が同じ（ID は路線ごとに違う）
    const originName = stationDict[segs[0]['odpt:originStation'][0]]?.name
    const remaining = [...segs]
    /** @type {any[]} */
    const chain = []
    let headName = originName
    while (remaining.length > 0) {
      const i = remaining.findIndex((t) => stationDict[segmentStations(t)[0]]?.name === headName)
      if (i < 0) throw new Error(`${id}: 区間をつなげない（${headName} から始まる区間がない）`)
      const [t] = remaining.splice(i, 1)
      chain.push(t)
      const sts = segmentStations(t)
      headName = stationDict[sts[sts.length - 1]]?.name
    }

    /** @type {{station: string, name: string, lat: number, lon: number, arr?: number, dep?: number, stop: boolean, railway: string}[]} */
    const path = []
    for (const t of chain) {
      /** @type {Map<string, any>} */
      const entries = new Map(t['odpt:trainTimetableObject'].map((/** @type {any} */ e) => [stationOf(e), e]))
      for (const sid of segmentStations(t)) {
        const st = stationDict[sid]
        const e = entries.get(sid)
        const arr = toMin(e?.['odpt:arrivalTime'])
        const dep = toMin(e?.['odpt:departureTime'])
        const last = path[path.length - 1]
        if (last && last.name === st.name) {
          // 接続駅: 先の区間の到着と後の区間の発車をまとめる
          last.arr ??= arr
          last.dep ??= dep
          last.stop ||= arr !== undefined || dep !== undefined
          continue
        }
        path.push({ station: sid, name: st.name, lat: st.lat, lon: st.lon, arr, dep, stop: arr !== undefined || dep !== undefined, railway: short(t['odpt:railway']) })
      }
    }

    // ---- 時刻の無い駅を距離で按分して埋める ----
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineKm(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon))
    const known = path.map((p, i) => ({ i, t: p.dep ?? p.arr })).filter((k) => k.t !== undefined)
    const points = path.map((p, i) => {
      let t = p.dep ?? p.arr
      let est = false
      if (t === undefined) {
        const prev = [...known].reverse().find((k) => k.i < i)
        const next = known.find((k) => k.i > i)
        if (!prev || !next) throw new Error(`${id}: ${p.name} の時刻を推定できない`)
        const prevT = path[prev.i].dep ?? path[prev.i].arr ?? 0
        const nextT = path[next.i].arr ?? path[next.i].dep ?? 0
        t = prevT + ((nextT - prevT) * (cum[i] - cum[prev.i])) / (cum[next.i] - cum[prev.i])
        est = true
      }
      return {
        station: p.station,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        arr: p.arr ?? (est ? round1(t) : undefined),
        dep: p.dep ?? (est ? round1(t) : undefined),
        stop: p.stop,
        est,
        km: round1(cum[i]),
      }
    })

    // ---- 地下区間（km の範囲） ----
    /** @type {[number, number][]} */
    const tunnels = []
    const same = (/** @type {string[]} */ pair, /** @type {string} */ x, /** @type {string} */ y) =>
      (pair[0] === x && pair[1] === y) || (pair[0] === y && pair[1] === x)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (TUNNELS.whole.some((p) => same(p, a.name, b.name))) tunnels.push([a.km, b.km])
      const h = TUNNELS.half.find((p) => same(p, a.name, b.name))
      if (h) {
        const mid = round1((a.km + b.km) / 2)
        tunnels.push(h[2] === a.name ? [a.km, mid] : [mid, b.km])
      }
    }
    // 隣り合う範囲をつなげる
    /** @type {[number, number][]} */
    const merged = []
    for (const r of tunnels) {
      const last = merged[merged.length - 1]
      if (last && Math.abs(last[1] - r[0]) < 0.01) last[1] = r[1]
      else merged.push([r[0], r[1]])
    }

    // ---- 追い抜き ----
    const linerTime = new Map(points.map((p) => [p.name, p]))
    const first = chain[0]
    /** @type {any[]} */
    const overtakes = []
    for (const seg of chain) {
      const segNames = new Set(segmentStations(seg).map((s) => stationDict[s].name))
      const others = timetables.filter(
        (x) =>
          x !== seg &&
          x['odpt:trainType'] !== LINER &&
          x['odpt:railway'] === seg['odpt:railway'] &&
          x['odpt:railDirection'] === seg['odpt:railDirection'] &&
          x['odpt:calendar'] === seg['odpt:calendar'],
      )
      for (const x of others) {
        const xs = x['odpt:trainTimetableObject']
          .map((/** @type {any} */ e) => {
            const name = stationDict[stationOf(e)]?.name
            const arr = toMin(e['odpt:arrivalTime'])
            const dep = toMin(e['odpt:departureTime'])
            return { name, arr: arr ?? dep, dep: dep ?? arr }
          })
          .filter((/** @type {any} */ e) => e.name && segNames.has(e.name) && e.dep !== undefined)
        for (let k = 1; k < xs.length; k++) {
          const a = xs[k - 1]
          const b = xs[k]
          const la = linerTime.get(a.name)
          const lb = linerTime.get(b.name)
          if (!la || !lb) continue
          const laT = la.dep ?? la.arr
          const lbT = lb.arr ?? lb.dep
          // 前の駅では相手が先に出ていて、次の駅では相手がライナーより後に出る → この駅で抜く
          if (a.dep < laT && b.dep > lbT) {
            // 始発駅での抜き（相手が先に着いて後に出るだけ）は数えない
            if (b.name === points[0].name) break
            overtakes.push({
              station: b.name,
              t: round1(lbT),
              trainType: typeDict[x['odpt:trainType']] ?? short(x['odpt:trainType']),
              trainNumber: x['odpt:trainNumber'],
              destination: stationDict[x['odpt:destinationStation']?.[0]]?.name ?? '',
            })
            break
          }
        }
      }
    }
    overtakes.sort((p, q) => p.t - q.t)

    // ---- すれ違い ----
    // 反対方向の列車について、駅ごとに「相手の時刻 − ライナーの時刻」を取り、
    // 隣り合う駅で符号が変わったら、その間ですれ違っている。0 になる位置を線形に按分して km と時刻を出す
    const kmOf = new Map(points.map((p) => [p.name, p.km]))
    /** @type {any[]} */
    const passings = []
    for (const seg of chain) {
      const segNames = new Set(segmentStations(seg).map((s) => stationDict[s].name))
      const opposite = timetables.filter(
        (x) =>
          x['odpt:railway'] === seg['odpt:railway'] &&
          x['odpt:railDirection'] !== seg['odpt:railDirection'] &&
          x['odpt:calendar'] === seg['odpt:calendar'],
      )
      for (const x of opposite) {
        const xs = x['odpt:trainTimetableObject']
          .map((/** @type {any} */ e) => {
            const name = stationDict[stationOf(e)]?.name
            const t = toMin(e['odpt:departureTime'] ?? e['odpt:arrivalTime'])
            const l = linerTime.get(name)
            const lt = l ? (l.dep ?? l.arr) : undefined
            return { name, t, f: t !== undefined && lt !== undefined ? t - lt : undefined }
          })
          .filter((/** @type {any} */ e) => e.name && segNames.has(e.name) && e.f !== undefined)
        for (let k = 1; k < xs.length; k++) {
          const a = xs[k - 1]
          const b = xs[k]
          if (a.f === 0 || Math.sign(a.f) === Math.sign(b.f)) continue
          const g = a.f / (a.f - b.f)
          const kmA = kmOf.get(a.name) ?? 0
          const kmB = kmOf.get(b.name) ?? 0
          passings.push({
            km: round1(kmA + (kmB - kmA) * g),
            t: round1(a.t + (b.t - a.t) * g),
            trainType: typeDict[x['odpt:trainType']] ?? short(x['odpt:trainType']),
            trainNumber: x['odpt:trainNumber'],
            destination: stationDict[x['odpt:destinationStation']?.[0]]?.name ?? '',
          })
          break
        }
      }
    }
    passings.sort((p, q) => p.t - q.t)

    const firstDep = points.find((p) => p.dep !== undefined)?.dep
    trips.push({
      id,
      calendar: calOf(first),
      trainNumber: first['odpt:trainNumber'],
      direction: short(first['odpt:railDirection']).replace(/^RailDirection:/, ''),
      origin: points[0].name,
      destination: points[points.length - 1].name,
      departure: firstDep,
      arrival: points[points.length - 1].arr,
      path: points,
      overtakes,
      passings,
      tunnels: merged,
    })
  }
  trips.sort((a, b) => a.calendar.localeCompare(b.calendar) || a.departure - b.departure)

  // ---- 路線の線形（スポット抽出と画面の地図に使う） ----
  /** @type {Record<string, [number, number][]>} */
  const lines = {}
  for (const rw of RAILWAYS) {
    lines[rw] = orderOf[`odpt.Railway:Keio.${rw}`].map((s) => [stationDict[s].lat, stationDict[s].lon])
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: '公共交通オープンデータセンター（ODPT）京王電鉄 列車時刻表・駅情報（公共交通オープンデータチャレンジ2026 限定ライセンス）',
    trips,
    lines,
  }
  writeFileSync(outFile, JSON.stringify(out))
  const counts = trips.reduce((/** @type {Record<string,number>} */ m, t) => ((m[t.calendar] = (m[t.calendar] ?? 0) + 1), m), {})
  console.log(`[liner] ${trips.length} 便を出力: ${JSON.stringify(counts)}`)
  const ot = trips.map((t) => t.overtakes.length)
  console.log(`[liner] 追い抜き: 平均 ${(ot.reduce((a, b) => a + b, 0) / ot.length).toFixed(1)} 本 / 最大 ${Math.max(...ot)} 本`)
  const ps = trips.map((t) => t.passings.length)
  console.log(`[liner] すれ違い: 平均 ${(ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1)} 本 / 最大 ${Math.max(...ps)} 本`)
  console.log(`[liner] ${outFile}`)
}

function round1(/** @type {number} */ n) {
  return Math.round(n * 10) / 10
}

main().catch((e) => {
  console.error(`[liner] 失敗: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
