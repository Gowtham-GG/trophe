// Reading product barcodes from the camera. Chrome on Android (and macOS / ChromeOS) has a built-in BarcodeDetector;
// elsewhere a WebAssembly port of ZXing does the same job. It is loaded only when a scan starts, and its .wasm is served
// from our own origin (never a CDN), which the CSP allows with 'wasm-unsafe-eval'.

export interface Detector { detect(source: HTMLVideoElement): Promise<string[]> }

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

interface NativeDetector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
interface NativeDetectorClass { new (opts: { formats: string[] }): NativeDetector; getSupportedFormats(): Promise<string[]> }

async function native(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (!Native) return null
  try {
    const supported = await Native.getSupportedFormats()
    const formats = FORMATS.filter((f) => supported.includes(f))
    if (!formats.includes('ean_13')) return null
    const d = new Native({ formats })
    return { detect: async (v) => (await d.detect(v)).map((b) => b.rawValue) }
  } catch { return null }
}

let fallback: Promise<Detector> | null = null

function zxing(): Promise<Detector> {
  fallback ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
    const d = new BarcodeDetector({ formats: FORMATS as ('ean_13' | 'ean_8' | 'upc_a' | 'upc_e')[] })
    return { detect: async (v: HTMLVideoElement) => (await d.detect(v)).map((b) => b.rawValue) }
  })()
  fallback.catch(() => { fallback = null })
  return fallback
}

/** The best detector this browser has. */
export async function barcodeDetector(): Promise<Detector> {
  return (await native()) ?? zxing()
}
