import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LngLat } from '../core/types';
import {
  chooseTerrainZoom,
  clearElevationCache,
  decodeTerrariumRgb,
  queryElevations,
} from './elevation-api';

const TILE_SIZE = 256;

beforeEach(() => {
  clearElevationCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Terrarium elevation source', () => {
  it('decodes Terrarium RGB values', () => {
    expect(decodeTerrariumRgb(128, 100, 0)).toBe(100);
    expect(decodeTerrariumRgb(127, 255, 128)).toBe(-0.5);
  });

  it('selects a coarser zoom for a wider sample spacing', () => {
    const points: LngLat[] = [[112, 28], [113, 29]];
    expect(chooseTerrainZoom(points, 30)).toBeGreaterThan(
      chooseTerrainZoom(points, 1000),
    );
  });

  it('downloads and caches one tile for nearby points', async () => {
    const pixels = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 128;
      pixels[index + 1] = 100;
      pixels[index + 2] = 0;
      pixels[index + 3] = 255;
    }

    const fetchMock = vi.fn((_input: string | URL | Request) => Promise.resolve(
      new Response(new Blob(['png']), { status: 200 }),
    ));
    const close = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve({
      width: TILE_SIZE,
      height: TILE_SIZE,
      close,
    })));
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => ({ data: pixels }),
        }),
      }),
    });

    const points: LngLat[] = [[112.938, 28.228], [112.939, 28.229]];
    const first = await queryElevations(points, { resolutionMeters: 100 });
    const second = await queryElevations(points, { resolutionMeters: 100 });

    expect(first).toEqual([100, 100]);
    expect(second).toEqual([100, 100]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/terrarium/');
    expect(close).toHaveBeenCalledOnce();
  });
});
