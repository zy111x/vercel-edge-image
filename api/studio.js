import * as photon from '@silvia-odwyer/photon/photon_rs_bg.js';
import PHOTON_WASM from '@silvia-odwyer/photon/photon_rs_bg.wasm?module';
import { optimizeImage } from 'wasm-image-optimization';

export const config = { runtime: 'edge' };

async function initWasm() {
  const instance = await WebAssembly.instantiate(PHOTON_WASM, { './photon_rs_bg.js': photon });
  photon.setWasm(instance.exports);
}
initWasm();

const OUTPUT_FORMATS = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MULTI_IMAGE_ACTIONS = new Set(['watermark', 'blend']);

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});

function normalizeFormat(format) {
  const value = String(format || 'webp').toLowerCase();
  return OUTPUT_FORMATS[value] ? value : 'webp';
}
function normalizeQuality(quality) {
  const value = Number(quality);
  return Math.min(100, Math.max(1, Number.isFinite(value) ? Math.round(value) : 92));
}
function parsePipeline(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function isAllowedRemote(env, rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const list = env.WHITE_LIST ? env.WHITE_LIST.split(',').map(v => v.trim().toLowerCase()).filter(Boolean) : [];
    if (!list.length) return true;
    const host = url.hostname.toLowerCase();
    return list.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch { return false; }
}
async function fetchRemote(request, env, rawUrl) {
  if (!rawUrl || !isAllowedRemote(env, rawUrl)) throw new Error('Image URL is missing or not allowed.');
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('content-length'); headers.delete('content-type');
  const response = await fetch(rawUrl, { headers });
  if (!response.ok) throw new Error(`Unable to load remote image (HTTP ${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
async function secondaryImage(env, request, source, localImages) {
  if (source && localImages.has(source)) return photon.PhotonImage.new_from_byteslice(localImages.get(source));
  if (!source || !isAllowedRemote(env, source)) return null;
  return photon.PhotonImage.new_from_byteslice(await fetchRemote(request, env, source));
}
async function applyOperation(env, request, inputImage, operation, localImages) {
  const action = String(operation?.action || '').trim();
  const params = Array.isArray(operation?.params) ? [...operation.params] : [];
  if (!action) return inputImage;
  if (typeof photon[action] !== 'function') throw new Error(`Unsupported Photon action: ${action}`);
  if (MULTI_IMAGE_ACTIONS.has(action)) {
    const source = params.shift();
    const image2 = await secondaryImage(env, request, source, localImages);
    if (!image2) throw new Error(`Unable to load secondary image for ${action}.`);
    try { photon[action](inputImage, image2, ...params); return inputImage; }
    finally { if (image2?.ptr) image2.free(); }
  }
  return photon[action](inputImage, ...params) || inputImage;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) return jsonResponse({ error: 'Studio API requires multipart/form-data.' }, 415);

    const form = await request.formData();
    const sourceFile = form.get('file');
    const sourceUrl = String(form.get('url') || '');
    const watermarkFile = form.get('watermark');
    const textOverlay = form.get('textOverlay');
    const pipeline = parsePipeline(form.get('pipeline'));
    const format = normalizeFormat(form.get('format'));
    const quality = normalizeQuality(form.get('quality'));
    const localImages = new Map();

    if (watermarkFile && typeof watermarkFile.arrayBuffer === 'function' && watermarkFile.size > 0) {
      localImages.set('__watermark__', new Uint8Array(await watermarkFile.arrayBuffer()));
    }
    if (textOverlay && typeof textOverlay.arrayBuffer === 'function' && textOverlay.size > 0) {
      localImages.set('__text_overlay__', new Uint8Array(await textOverlay.arrayBuffer()));
    }

    let imageBytes;
    if (sourceFile && typeof sourceFile.arrayBuffer === 'function' && sourceFile.size > 0) imageBytes = new Uint8Array(await sourceFile.arrayBuffer());
    else if (sourceUrl) imageBytes = await fetchRemote(request, process.env, sourceUrl);
    else return jsonResponse({ error: 'Please provide an image file or URL.' }, 400);

    const inputImage = photon.PhotonImage.new_from_byteslice(imageBytes);
    let outputImage = inputImage;
    try {
      for (const operation of pipeline) {
        const previous = outputImage;
        const next = await applyOperation(process.env, request, previous, operation, localImages);
        if (previous !== inputImage && previous !== next && previous?.ptr) previous.free();
        outputImage = next;
      }

      if (localImages.has('__text_overlay__')) {
        outputImage = await applyOperation(process.env, request, outputImage, { action: 'watermark', params: ['__text_overlay__', 0, 0] }, localImages);
      }

      let bytes;
      if (format === 'jpeg' || format === 'jpg') bytes = outputImage.get_bytes_jpeg(quality);
      else if (format === 'png') bytes = outputImage.get_bytes();
      else bytes = await optimizeImage({ image: outputImage.get_bytes(), quality });

      return new Response(bytes, { headers: { 'content-type': OUTPUT_FORMATS[format], 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-edge-image-studio': 'v3' } });
    } finally {
      if (outputImage !== inputImage && outputImage?.ptr) outputImage.free();
      if (inputImage?.ptr) inputImage.free();
    }
  } catch (error) {
    console.error('studio:process:error', error?.name, error?.message, error);
    return jsonResponse({ error: error?.message || 'Image processing failed.', type: error?.name || 'Error' }, error?.name === 'RuntimeError' ? 415 : 500);
  }
}
