import queryString from 'query-string';

import * as photon from '@silvia-odwyer/photon/photon_rs_bg.js';
import PHOTON_WASM from '@silvia-odwyer/photon/photon_rs_bg.wasm?module';
import { optimizeImage } from 'wasm-image-optimization';

export const config = { runtime: 'edge' };

async function initWasm() {
  const photonInstance = await WebAssembly.instantiate(PHOTON_WASM, {
    './photon_rs_bg.js': photon,
  });
  photon.setWasm(photonInstance.exports);
}

initWasm();

const OUTPUT_FORMATS = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MULTI_IMAGE_ACTIONS = new Set(['watermark', 'blend']);

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });

const inWhiteList = (env, url) => {
  try {
    const imageUrl = new URL(url);
    const whiteList = env.WHITE_LIST
      ? env.WHITE_LIST.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    return !(whiteList.length && !whiteList.find((hostname) => imageUrl.hostname.endsWith(hostname)));
  } catch {
    return false;
  }
};

const normalizeFormat = (format) => {
  const normalized = String(format || 'webp').toLowerCase();
  return OUTPUT_FORMATS[normalized] ? normalized : 'webp';
};

const normalizeQuality = (quality) => {
  const number = Number(quality);
  return Math.min(100, Math.max(1, Number.isFinite(number) ? Math.round(number) : 92));
};

const parseLegacyAction = (action) =>
  String(action || '')
    .split('|')
    .filter(Boolean)
    .map((pipeAction) => {
      const [name, options = ''] = pipeAction.split('!');
      return { action: name, params: options ? options.split(',') : [] };
    });

const parsePipeline = (value, fallbackAction = '') => {
  if (!value) return parseLegacyAction(fallbackAction);
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : parseLegacyAction(fallbackAction);
  } catch {
    return parseLegacyAction(fallbackAction);
  }
};

const fetchRemoteImage = async (request, env, url) => {
  if (!url || !inWhiteList(env, url)) {
    return { error: jsonResponse({ error: 'Image URL is missing or not allowed.' }, url ? 403 : 400) };
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('content-type');

  const response = await fetch(url, { headers });
  if (!response.ok) return { error: response };
  return { bytes: new Uint8Array(await response.arrayBuffer()) };
};

const loadSecondaryImage = async (env, request, source, localImages) => {
  if (source && localImages?.has(source)) {
    return photon.PhotonImage.new_from_byteslice(localImages.get(source));
  }
  if (!source || !inWhiteList(env, source)) return null;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('content-type');

  const response = await fetch(source, { headers });
  if (!response.ok) return null;
  return photon.PhotonImage.new_from_byteslice(new Uint8Array(await response.arrayBuffer()));
};

const processImage = async (env, request, inputImage, operation, localImages) => {
  const action = String(operation?.action || '').trim();
  const params = Array.isArray(operation?.params) ? [...operation.params] : [];

  if (!action) return inputImage;
  if (typeof photon[action] !== 'function') throw new Error(`Unsupported Photon action: ${action}`);

  if (MULTI_IMAGE_ACTIONS.has(action)) {
    const source = params.shift();
    const image2 = await loadSecondaryImage(env, request, source, localImages);
    if (!image2) throw new Error(`Unable to load secondary image for ${action}.`);
    try {
      photon[action](inputImage, image2, ...params);
      return inputImage;
    } finally {
      image2.ptr && image2.free();
    }
  }

  return photon[action](inputImage, ...params) || inputImage;
};

const readRequest = async (request) => {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const query = queryString.parse(url.search);
    return {
      sourceUrl: query.url || '',
      sourceFile: null,
      pipeline: parsePipeline(query.pipeline, query.action),
      format: normalizeFormat(query.format),
      quality: normalizeQuality(query.quality),
      localImages: new Map(),
      cacheable: true,
    };
  }

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const sourceFile = form.get('file');
    const watermarkFile = form.get('watermark');
    const localImages = new Map();

    if (watermarkFile && typeof watermarkFile.arrayBuffer === 'function' && watermarkFile.size > 0) {
      localImages.set('__watermark__', new Uint8Array(await watermarkFile.arrayBuffer()));
    }

    return {
      sourceUrl: String(form.get('url') || ''),
      sourceFile: sourceFile && typeof sourceFile.arrayBuffer === 'function' && sourceFile.size > 0 ? sourceFile : null,
      pipeline: parsePipeline(form.get('pipeline'), form.get('action')),
      format: normalizeFormat(form.get('format')),
      quality: normalizeQuality(form.get('quality')),
      localImages,
      cacheable: false,
    };
  }

  if (contentType.includes('application/json')) {
    const body = await request.json();
    return {
      sourceUrl: String(body.url || ''),
      sourceFile: null,
      pipeline: parsePipeline(body.pipeline, body.action),
      format: normalizeFormat(body.format),
      quality: normalizeQuality(body.quality),
      localImages: new Map(),
      cacheable: false,
    };
  }

  throw new Error('Unsupported request content type.');
};

export default async function handler(request) {
  const env = process.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const input = await readRequest(request);
    let imageBytes;

    if (input.sourceFile) {
      imageBytes = new Uint8Array(await input.sourceFile.arrayBuffer());
    } else if (input.sourceUrl) {
      const remote = await fetchRemoteImage(request, env, input.sourceUrl);
      if (remote.error) return remote.error;
      imageBytes = remote.bytes;
    } else {
      if (request.method === 'GET') return new Response(null, { status: 302, headers: { location: '/' } });
      return jsonResponse({ error: 'Please provide an image file or URL.' }, 400);
    }

    const inputImage = photon.PhotonImage.new_from_byteslice(imageBytes);
    let outputImage = inputImage;

    try {
      for (const operation of input.pipeline) {
        const previousImage = outputImage;
        const nextImage = await processImage(env, request, previousImage, operation, input.localImages);
        if (previousImage !== inputImage && previousImage !== nextImage && previousImage?.ptr) {
          previousImage.free();
        }
        outputImage = nextImage;
      }

      let outputImageData;
      if (input.format === 'jpeg' || input.format === 'jpg') {
        outputImageData = outputImage.get_bytes_jpeg(input.quality);
      } else if (input.format === 'png') {
        outputImageData = outputImage.get_bytes();
      } else {
        outputImageData = await optimizeImage({ image: outputImage.get_bytes(), quality: input.quality });
      }

      return new Response(outputImageData, {
        headers: {
          'content-type': OUTPUT_FORMATS[input.format],
          'cache-control': input.cacheable
            ? 'public,max-age=15552000,s-maxage=15552000'
            : 'no-store',
          'access-control-allow-origin': '*',
        },
      });
    } finally {
      if (outputImage !== inputImage && outputImage?.ptr) outputImage.free();
      if (inputImage?.ptr) inputImage.free();
    }
  } catch (error) {
    console.error('process:error', error?.name, error?.message, error);
    return jsonResponse(
      { error: error?.message || 'Image processing failed.', type: error?.name || 'Error' },
      error?.name === 'RuntimeError' ? 415 : 500,
    );
  }
}
