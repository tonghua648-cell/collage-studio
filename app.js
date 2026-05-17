"use strict";

const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const photoInput = document.querySelector("#photoInput");
const dropZone = document.querySelector("#dropZone");
const canvasWrap = document.querySelector("#canvasWrap");
const statusText = document.querySelector("#statusText");
const resetBtn = document.querySelector("#resetBtn");
const removePhotoBtn = document.querySelector("#removePhotoBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const inputExportBtn = document.querySelector("#inputExportBtn");
const oilPaintToggleBtn = document.querySelector("#oilPaintToggleBtn");
const oilPaintRandomBtn = document.querySelector("#oilPaintRandomBtn");
const shadowsToggleBtn = document.querySelector("#shadowsToggleBtn");
const shadowsRandomBtn = document.querySelector("#shadowsRandomBtn");
const cutoutToggleBtn = document.querySelector("#cutoutToggleBtn");
const cutoutRandomBtn = document.querySelector("#cutoutRandomBtn");
const paramInputs = [...document.querySelectorAll("[data-param]")];
const numberInputs = [...document.querySelectorAll("[data-number-param]")];
const toggleInputs = [...document.querySelectorAll("[data-toggle]")];
const gradientStrip = document.querySelector("#gradientStrip");
const textureSlots = document.querySelector("#textureSlots");
const rawPhotoFrame = document.querySelector("#rawPhotoFrame");
const adviceLink = document.querySelector("#adviceLink");
const adviceModal = document.querySelector("#adviceModal");
const adviceCloseBtn = document.querySelector("#adviceCloseBtn");
const scoreButtons = [...document.querySelectorAll(".score-row button")];
const manualLink = document.querySelector("#manualLink");
const manualModal = document.querySelector("#manualModal");
const manualCloseBtn = document.querySelector("#manualCloseBtn");

const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
const textureSize = 640;

let hasImage = false;
let outputWidth = 1;
let outputHeight = 1;
let currentImage = null;
let currentFileName = "";
let renderQueued = false;
let textureLayers = [];
let activeToneData = null;
let editingTextureIndex = null;
let textureDrag = null;

const oilParams = {
  stylization: 10,
  cleanliness: 10,
  scale: 0.1,
  bristleDetail: 5,
  shadows: 35,
  highlights: 18,
  edgeSimplicity: 1,
  previewSize: 900,
  blackIn: 18,
  gamma: 1,
  whiteIn: 232,
  posterizeLevels: 4,
};

const enabledSections = {
  oilPaint: false,
  performance: true,
  shadowsHighlights: false,
  cutout: false,
  levels: true,
  posterize: true,
  gradientMap: true,
};

const mapColors = [
  [18, 18, 18],
  [210, 40, 38],
  [43, 150, 83],
  [43, 91, 190],
  [230, 190, 58],
  [226, 226, 218],
];

function initialize() {
  initializeTextures();
  syncTextureSlots();
  loadDefaultTexture(2, "./assets/tone-3.jpg");
  loadDefaultTexture(3, "./assets/tone-4.jpg");
  clearPreview();
  bindEvents();
}

function bindEvents() {
  photoInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) loadImageFile(file);
  });

  canvasWrap.addEventListener("click", (event) => {
    if (editingTextureIndex !== null && event.target === canvasWrap) {
      exitTextureEdit();
      return;
    }
    if (!hasImage) photoInput.click();
  });

  canvas.addEventListener("pointerdown", startTextureDrag);
  canvas.addEventListener("pointermove", moveTextureDrag);
  canvas.addEventListener("pointerup", endTextureDrag);
  canvas.addEventListener("pointercancel", endTextureDrag);
  canvas.addEventListener("wheel", transformEditingTexture, { passive: false });

  document.addEventListener("click", (event) => {
    if (editingTextureIndex === null) return;
    if (event.target.closest("[data-texture-preview]")) return;
    if (event.target === canvas || event.target.closest("#canvasWrap")) return;
    exitTextureEdit();
  });

  [document].forEach((target) => {
    ["dragenter", "dragover"].forEach((name) => {
      target.addEventListener(name, (event) => {
        event.preventDefault();
        canvasWrap.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((name) => {
      target.addEventListener(name, (event) => {
        event.preventDefault();
        canvasWrap.classList.remove("drag-over");
      });
    });

    target.addEventListener("drop", (event) => {
      event.preventDefault();
      const [file] = event.dataTransfer.files;
      if (file && file.type.startsWith("image/")) loadImageFile(file);
    });
  });

  resetBtn.addEventListener("click", clearPreview);
  removePhotoBtn.addEventListener("click", clearPreview);
  downloadBtn.addEventListener("click", downloadPng);
  inputExportBtn.addEventListener("click", downloadPng);
  oilPaintToggleBtn.addEventListener("click", toggleOilPaint);
  oilPaintRandomBtn.addEventListener("click", randomizeOilPaint);
  shadowsToggleBtn.addEventListener("click", toggleShadowsHighlights);
  shadowsRandomBtn.addEventListener("click", randomizeShadowsHighlights);
  cutoutToggleBtn.addEventListener("click", toggleCutout);
  cutoutRandomBtn.addEventListener("click", randomizeCutout);
  adviceLink.addEventListener("click", (event) => {
    event.preventDefault();
    openAdviceModal();
  });
  adviceCloseBtn.addEventListener("click", closeAdviceModal);
  adviceModal.addEventListener("click", (event) => {
    if (event.target === adviceModal) closeAdviceModal();
  });
  manualLink.addEventListener("click", (event) => {
    event.preventDefault();
    openManualModal();
  });
  manualCloseBtn.addEventListener("click", closeManualModal);
  manualModal.addEventListener("click", (event) => {
    if (event.target === manualModal) closeManualModal();
  });
  scoreButtons.forEach((button) => {
    button.addEventListener("click", () => {
      scoreButtons.forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAdviceModal();
      closeManualModal();
    }
  });

  paramInputs.forEach((input) => {
    input.addEventListener("input", () => {
      oilParams[input.dataset.param] = Number(input.value);
      syncParamOutputs();
      if (input.dataset.param === "posterizeLevels") syncTextureSlots();
      queueRender();
    });
  });

  numberInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.numberParam;
      const min = Number(input.min);
      const max = Number(input.max);
      const value = clamp(Number(input.value), min, max);
      if (Number.isNaN(value)) return;
      oilParams[key] = value;
      const slider = document.querySelector(`[data-param="${key}"]`);
      if (slider) slider.value = value;
      syncParamOutputs();
      if (key === "posterizeLevels") syncTextureSlots();
      queueRender();
    });
  });

  toggleInputs.forEach((input) => {
    input.addEventListener("change", () => {
      enabledSections[input.dataset.toggle] = input.checked;
      syncSectionStates();
      queueRender();
    });
  });

  syncParamOutputs();
  syncSectionStates();
  syncModeButtons();
}

function clearPreview() {
  exitTextureEdit();
  hasImage = false;
  currentImage = null;
  currentFileName = "";
  outputWidth = 1;
  outputHeight = 1;
  canvas.width = 1;
  canvas.height = 1;
  canvas.classList.add("empty");
  canvasWrap.classList.remove("has-image");
  ctx.clearRect(0, 0, 1, 1);
  statusText.textContent = "DRAG & DROP";
  downloadBtn.disabled = true;
  inputExportBtn.disabled = true;
  removePhotoBtn.disabled = true;
  photoInput.value = "";
  resetRawPreview();
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      currentImage = image;
      currentFileName = file.name;
      setRawPreview(reader.result);
      renderImage(image, file.name);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function setRawPreview(src) {
  rawPhotoFrame.style.backgroundImage = `url("${src}")`;
  rawPhotoFrame.classList.add("has-source");
}

function resetRawPreview() {
  rawPhotoFrame.style.backgroundImage = "";
  rawPhotoFrame.classList.remove("has-source");
}

function openAdviceModal() {
  adviceModal.classList.add("open");
  adviceModal.setAttribute("aria-hidden", "false");
}

function closeAdviceModal() {
  adviceModal.classList.remove("open");
  adviceModal.setAttribute("aria-hidden", "true");
}

function openManualModal() {
  manualModal.classList.add("open");
  manualModal.setAttribute("aria-hidden", "false");
}

function closeManualModal() {
  manualModal.classList.remove("open");
  manualModal.setAttribute("aria-hidden", "true");
}

function resizeToInputRatio(image) {
  const maxSide = enabledSections.performance ? oilParams.previewSize : 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  outputWidth = Math.max(1, Math.round(image.width * scale));
  outputHeight = Math.max(1, Math.round(image.height * scale));
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  offscreen.width = outputWidth;
  offscreen.height = outputHeight;
}

function queueRender() {
  if (!currentImage || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderImage(currentImage, currentFileName);
  });
}

function renderImage(image, fileName) {
  resizeToInputRatio(image);
  offCtx.clearRect(0, 0, outputWidth, outputHeight);
  offCtx.drawImage(image, 0, 0, outputWidth, outputHeight);

  const source = offCtx.getImageData(0, 0, outputWidth, outputHeight);
  const gray = desaturate(source.data, outputWidth, outputHeight);
  const oil = enabledSections.oilPaint ? oilPaintSmooth(gray, outputWidth, outputHeight) : gray;
  const recovered = enabledSections.shadowsHighlights ? shadowsHighlights(oil, outputWidth, outputHeight) : oil;
  const cutout = enabledSections.cutout ? cutoutFilter(recovered, outputWidth, outputHeight) : recovered;
  const leveled = enabledSections.levels ? applyLevels(cutout) : cutout;
  const toneData = enabledSections.posterize ? posterizeToToneData(leveled, oilParams.posterizeLevels) : continuousToneData(leveled);
  activeToneData = toneData;
  drawFinalResult(toneData, outputWidth, outputHeight);
  hasImage = true;
  canvas.classList.remove("empty");
  canvasWrap.classList.add("has-image");
  statusText.textContent = `${fileName} / ${outputWidth} x ${outputHeight}`;
  downloadBtn.disabled = false;
  inputExportBtn.disabled = false;
  removePhotoBtn.disabled = false;
}

function desaturate(data, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function oilPaintSmooth(gray, width, height) {
  const strokeRadius = Math.max(2, Math.round(2 + oilParams.stylization * 0.55));
  const cleanlinessPasses = Math.max(2, Math.round(2 + oilParams.cleanliness * 0.22));
  const toneThreshold = Math.max(18, 58 - oilParams.cleanliness * 2.8);
  let current = gray;

  for (let pass = 0; pass < cleanlinessPasses; pass += 1) {
    current = bilateralSmoothPass(current, width, height, 2, toneThreshold);
  }

  const strokePasses = Math.max(2, Math.round(1 + oilParams.stylization * 0.24));
  for (let pass = 0; pass < strokePasses; pass += 1) {
    current = directionalStrokePass(current, width, height, strokeRadius);
  }

  current = fineBrushPolish(current, width, height, oilParams.bristleDetail);
  current = bilateralSmoothPass(current, width, height, 2, 38);
  return fineBrushPolish(current, width, height, 1);
}

function bilateralSmoothPass(source, width, height, radius, threshold) {
  const output = new Uint8ClampedArray(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = source[y * width + x];
      let sum = center;
      let weightSum = 1;

      for (let oy = -radius; oy <= radius; oy += 1) {
        const sy = clamp(y + oy, 0, height - 1);
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const sx = clamp(x + ox, 0, width - 1);
          const value = source[sy * width + sx];
          const diff = Math.abs(value - center);
          if (diff > threshold) continue;
          const distance = Math.sqrt(ox * ox + oy * oy);
          const spatial = Math.max(0, 1 - distance / (radius + 1));
          const tonal = 1 - diff / (threshold + 1);
          const weight = spatial * tonal;
          sum += value * weight;
          weightSum += weight;
        }
      }

      output[y * width + x] = sum / weightSum;
    }
  }

  return output;
}

function directionalStrokePass(source, width, height, radius) {
  const output = new Uint8ClampedArray(source.length);
  const step = oilParams.scale <= 1 ? 1 : 1.5;
  const detailKeep = oilParams.bristleDetail / 10;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const left = source[y * width + clamp(x - 1, 0, width - 1)];
      const right = source[y * width + clamp(x + 1, 0, width - 1)];
      const up = source[clamp(y - 1, 0, height - 1) * width + x];
      const down = source[clamp(y + 1, 0, height - 1) * width + x];
      const gx = right - left;
      const gy = down - up;
      const length = Math.hypot(gx, gy) || 1;
      const tx = -gy / length;
      const ty = gx / length;
      const center = source[index];
      let sum = center;
      let weightSum = 1;

      for (let d = -radius; d <= radius; d += step) {
        if (d === 0) continue;
        const sx = clamp(Math.round(x + tx * d), 0, width - 1);
        const sy = clamp(Math.round(y + ty * d), 0, height - 1);
        const value = source[sy * width + sx];
        const diff = Math.abs(value - center);
        const tonal = Math.max(0, 1 - diff / 46);
        const distance = 1 - Math.abs(d) / (radius + 1);
        const weight = tonal * distance;
        sum += value * weight;
        weightSum += weight;
      }

      const stroked = sum / weightSum;
      output[index] = stroked * (1 - detailKeep * 0.22) + center * detailKeep * 0.22;
    }
  }

  return output;
}

function fineBrushPolish(source, width, height, bristleDetail) {
  const output = new Uint8ClampedArray(source.length);
  const detailMix = bristleDetail / 10;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = source[y * width + x];
      const left = source[y * width + clamp(x - 1, 0, width - 1)];
      const right = source[y * width + clamp(x + 1, 0, width - 1)];
      const up = source[clamp(y - 1, 0, height - 1) * width + x];
      const down = source[clamp(y + 1, 0, height - 1) * width + x];
      const polished = center * 0.5 + (left + right + up + down) * 0.125;
      output[y * width + x] = polished * (1 - detailMix * 0.35) + center * detailMix * 0.35;
    }
  }
  return output;
}

function shadowsHighlights(source, width, height) {
  const output = new Uint8ClampedArray(source.length);
  const shadowAmount = oilParams.shadows / 100;
  const highlightAmount = oilParams.highlights / 100;

  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    const shadowMask = clamp((132 - value) / 132, 0, 1);
    const highlightMask = clamp((value - 150) / 105, 0, 1);
    let adjusted = value;
    adjusted += shadowMask * shadowMask * 58 * shadowAmount;
    adjusted -= highlightMask * highlightMask * 44 * highlightAmount;
    output[i] = clamp(adjusted, 0, 255);
  }

  return fineBrushPolish(output, width, height, 3);
}

function cutoutFilter(source, width, height) {
  const levels = 8;
  const passes = Math.max(1, Math.round(1 + oilParams.edgeSimplicity * 0.85));
  const radius = Math.min(3, Math.max(1, Math.round(1 + oilParams.edgeSimplicity * 0.28)));
  const edgeThreshold = Math.max(8, 38 - oilParams.edgeSimplicity * 2.4);
  let current = source;

  for (let pass = 0; pass < passes; pass += 1) {
    current = contourSmoothPass(current, width, height, radius, edgeThreshold);
  }

  const quantized = quantizeLevels(current, levels);
  return contourSmoothPass(quantized, width, height, 1, 20);
}

function contourSmoothPass(source, width, height, radius, threshold) {
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = source[y * width + x];
      let sum = center;
      let weightSum = 1;

      for (let oy = -radius; oy <= radius; oy += 1) {
        const sy = clamp(y + oy, 0, height - 1);
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const sx = clamp(x + ox, 0, width - 1);
          const value = source[sy * width + sx];
          const diff = Math.abs(value - center);
          if (diff > threshold) continue;
          const distance = Math.sqrt(ox * ox + oy * oy);
          const weight = Math.max(0.08, 1 - distance / (radius + 1)) * (1 - diff / (threshold + 1));
          sum += value * weight;
          weightSum += weight;
        }
      }

      output[y * width + x] = sum / weightSum;
    }
  }
  return output;
}

function quantizeLevels(source, levels) {
  const output = new Uint8ClampedArray(source.length);
  const maxLevel = Math.max(1, levels - 1);
  for (let i = 0; i < source.length; i += 1) {
    const bucket = Math.round((source[i] / 255) * maxLevel);
    output[i] = (bucket / maxLevel) * 255;
  }
  return output;
}

function applyLevels(source) {
  const output = new Uint8ClampedArray(source.length);
  const blackIn = Math.min(oilParams.blackIn, oilParams.whiteIn - 1);
  const whiteIn = Math.max(oilParams.whiteIn, blackIn + 1);
  const gamma = Math.max(0.05, oilParams.gamma);

  for (let i = 0; i < source.length; i += 1) {
    let value = (source[i] - blackIn) / (whiteIn - blackIn);
    value = clamp(value, 0, 1);
    value = Math.pow(value, 1 / gamma);
    output[i] = value * 255;
  }

  return output;
}

function posterize(source, levels) {
  return quantizeLevels(source, Math.round(levels));
}

function toggleOilPaint() {
  enabledSections.oilPaint = !enabledSections.oilPaint;
  if (enabledSections.oilPaint) setDefaultOilPaint();
  syncModeButtons();
  queueRender();
}

function setDefaultOilPaint() {
  oilParams.stylization = 10;
  oilParams.cleanliness = 10;
  oilParams.scale = 0.1;
  oilParams.bristleDetail = 5;
}

function randomizeOilPaint() {
  enabledSections.oilPaint = true;
  oilParams.stylization = randomBetween(7.5, 10);
  oilParams.cleanliness = randomBetween(7.5, 10);
  oilParams.scale = randomBetween(0.1, 1.6);
  oilParams.bristleDetail = randomBetween(3.5, 6.5);
  syncModeButtons();
  queueRender();
}

function toggleShadowsHighlights() {
  enabledSections.shadowsHighlights = !enabledSections.shadowsHighlights;
  if (enabledSections.shadowsHighlights) {
    oilParams.shadows = 35;
    oilParams.highlights = 18;
  }
  syncModeButtons();
  queueRender();
}

function randomizeShadowsHighlights() {
  enabledSections.shadowsHighlights = true;
  oilParams.shadows = Math.round(randomBetween(12, 60));
  oilParams.highlights = Math.round(randomBetween(8, 45));
  syncModeButtons();
  queueRender();
}

function toggleCutout() {
  enabledSections.cutout = !enabledSections.cutout;
  if (enabledSections.cutout) oilParams.edgeSimplicity = 1;
  syncModeButtons();
  queueRender();
}

function randomizeCutout() {
  enabledSections.cutout = true;
  oilParams.edgeSimplicity = Math.round(randomBetween(1, 9));
  syncModeButtons();
  queueRender();
}

function syncModeButtons() {
  oilPaintToggleBtn.classList.toggle("active", enabledSections.oilPaint);
  oilPaintToggleBtn.textContent = enabledSections.oilPaint ? "●" : "○";
  oilPaintRandomBtn.classList.toggle("active", enabledSections.oilPaint);
  shadowsToggleBtn.classList.toggle("active", enabledSections.shadowsHighlights);
  shadowsToggleBtn.textContent = enabledSections.shadowsHighlights ? "●" : "○";
  shadowsRandomBtn.classList.toggle("active", enabledSections.shadowsHighlights);
  cutoutToggleBtn.classList.toggle("active", enabledSections.cutout);
  cutoutToggleBtn.textContent = enabledSections.cutout ? "●" : "○";
  cutoutRandomBtn.classList.toggle("active", enabledSections.cutout);
}

function randomBetween(min, max) {
  return Number((min + Math.random() * (max - min)).toFixed(1));
}

function initializeTextures() {
  textureLayers = mapColors.map((color, index) => ({
    name: `Layer ${index + 1}`,
    canvas: createPaperTexture(index, color),
    custom: null,
    transform: createDefaultTextureTransform(index),
  }));
}

function createDefaultTextureTransform(index) {
  return {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: (index - 2) * 0.08,
  };
}

function loadDefaultTexture(index, src) {
  const image = new Image();
  image.onload = () => {
    textureLayers[index].custom = imageToCanvas(image);
    textureLayers[index].transform = createDefaultTextureTransform(index);
    syncTextureSlots();
    queueRender();
  };
  image.src = src;
}

function createPaperTexture(index, color) {
  const texture = document.createElement("canvas");
  texture.width = textureSize;
  texture.height = textureSize;
  const t = texture.getContext("2d");
  const rand = seededNoise(1200 + index * 91);
  const base = color.map((value) => Math.round(value * 0.72 + 245 * 0.28));

  t.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
  t.fillRect(0, 0, texture.width, texture.height);

  for (let i = 0; i < 160; i += 1) {
    const shade = 0.7 + rand() * 0.45;
    t.fillStyle = `rgba(${Math.round(clamp(base[0] * shade, 0, 255))}, ${Math.round(clamp(base[1] * shade, 0, 255))}, ${Math.round(clamp(base[2] * shade, 0, 255))}, ${0.14 + rand() * 0.28})`;
    t.fillRect(rand() * texture.width, rand() * texture.height, 30 + rand() * 220, 8 + rand() * 90);
  }

  t.globalAlpha = 0.3;
  t.strokeStyle = index % 2 === 0 ? "#171717" : "#f4ead8";
  for (let y = 20; y < texture.height; y += 18 + index * 2) {
    t.beginPath();
    t.moveTo(0, y + rand() * 8);
    t.lineTo(texture.width, y + rand() * 8);
    t.stroke();
  }
  t.globalAlpha = 1;

  const noise = t.getImageData(0, 0, texture.width, texture.height);
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = (rand() - 0.5) * 34;
    noise.data[i] = clamp(noise.data[i] + n, 0, 255);
    noise.data[i + 1] = clamp(noise.data[i + 1] + n, 0, 255);
    noise.data[i + 2] = clamp(noise.data[i + 2] + n, 0, 255);
  }
  t.putImageData(noise, 0, 0);

  return texture;
}

function seededNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function syncTextureSlots() {
  const levels = Math.round(oilParams.posterizeLevels);
  textureSlots.innerHTML = "";
  gradientStrip.innerHTML = "";
  gradientStrip.style.gridTemplateColumns = `repeat(${levels}, 1fr)`;

  for (let index = 0; index < levels; index += 1) {
    const color = mapColors[index];
    const strip = document.createElement("span");
    strip.style.background = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    gradientStrip.appendChild(strip);

    const slot = document.createElement("div");
    slot.className = `texture-slot${editingTextureIndex === index ? " editing" : ""}`;
    slot.dataset.tone = String(index);
    slot.innerHTML = `
      <input type="file" accept="image/*" data-texture-input="${index}" />
      <label class="color-control">
        <span>Color</span>
        <input type="color" data-tone-color="${index}" value="${rgbToHex(mapColors[index])}" />
      </label>
      <canvas class="material-preview" width="28" height="28" data-texture-preview="${index}" title="Edit texture placement"></canvas>
      <div class="texture-meta">
        <strong>Tone ${index + 1}</strong>
        <span>${textureLayers[index].custom ? "Uploaded texture" : "Flat color"}</span>
      </div>
      <div class="texture-actions">
        <button type="button" data-texture-upload="${index}">Upload</button>
        <button type="button" data-texture-remove="${index}" ${textureLayers[index].custom ? "" : "disabled"}>Remove</button>
      </div>
    `;
    textureSlots.appendChild(slot);
    drawTextureThumb(slot.querySelector("canvas"), textureLayers[index], mapColors[index]);
  }

  bindTextureSlots();
}

function drawTextureThumb(targetCanvas, layer, fallbackColor) {
  const thumb = targetCanvas.getContext("2d");
  thumb.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (layer.custom) {
    const transform = {
      ...layer.transform,
      offsetX: layer.transform.offsetX * (targetCanvas.width / Math.max(1, outputWidth)),
      offsetY: layer.transform.offsetY * (targetCanvas.height / Math.max(1, outputHeight)),
    };
    thumb.drawImage(renderTextureToSize(layer.custom, targetCanvas.width, targetCanvas.height, 0, transform), 0, 0);
    return;
  }
  thumb.fillStyle = `rgb(${fallbackColor[0]}, ${fallbackColor[1]}, ${fallbackColor[2]})`;
  thumb.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
}

function bindTextureSlots() {
  textureSlots.querySelectorAll("[data-texture-preview]").forEach((preview) => {
    preview.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(preview.dataset.texturePreview);
      if (!textureLayers[index].custom || !hasImage) return;
      enterTextureEdit(index);
    });
  });

  textureSlots.querySelectorAll("[data-tone-color]").forEach((input) => {
    input.addEventListener("change", () => {
      mapColors[Number(input.dataset.toneColor)] = hexToRgb(input.value);
      syncTextureSlots();
      queueRender();
    });
  });

  textureSlots.querySelectorAll("[data-texture-upload]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = textureSlots.querySelector(`[data-texture-input="${button.dataset.textureUpload}"]`);
      if (input) input.click();
    });
  });

  textureSlots.querySelectorAll("[data-texture-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.textureRemove);
      textureLayers[index].custom = null;
      textureLayers[index].transform = createDefaultTextureTransform(index);
      if (editingTextureIndex === index) exitTextureEdit();
      syncTextureSlots();
      queueRender();
    });
  });

  textureSlots.querySelectorAll("[data-texture-input]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const [file] = event.target.files;
      const index = Number(input.dataset.textureInput);
      if (!file) return;
      loadTextureFile(file, (image) => {
        textureLayers[index].custom = imageToCanvas(image);
        textureLayers[index].transform = createDefaultTextureTransform(index);
        syncTextureSlots();
        queueRender();
      });
    });
  });
}

function enterTextureEdit(index) {
  editingTextureIndex = index;
  canvasWrap.classList.add("texture-editing");
  syncTextureSlots();
  queueRender();
}

function exitTextureEdit() {
  if (editingTextureIndex === null) return;
  editingTextureIndex = null;
  textureDrag = null;
  canvasWrap.classList.remove("texture-editing");
  syncTextureSlots();
  queueRender();
}

function startTextureDrag(event) {
  if (editingTextureIndex === null || !hasImage) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  textureDrag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
}

function moveTextureDrag(event) {
  if (!textureDrag || textureDrag.pointerId !== event.pointerId || editingTextureIndex === null) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const scaleX = outputWidth / Math.max(1, rect.width);
  const scaleY = outputHeight / Math.max(1, rect.height);
  const layer = textureLayers[editingTextureIndex];
  layer.transform.offsetX += (event.clientX - textureDrag.x) * scaleX;
  layer.transform.offsetY += (event.clientY - textureDrag.y) * scaleY;
  textureDrag.x = event.clientX;
  textureDrag.y = event.clientY;
  queueRender();
}

function endTextureDrag(event) {
  if (!textureDrag || textureDrag.pointerId !== event.pointerId) return;
  textureDrag = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  syncTextureSlots();
}

function transformEditingTexture(event) {
  if (editingTextureIndex === null || !hasImage) return;
  event.preventDefault();
  const layer = textureLayers[editingTextureIndex];
  if (event.shiftKey) {
    layer.transform.rotation += event.deltaY > 0 ? 0.08 : -0.08;
  } else {
    layer.transform.scale = clamp(layer.transform.scale * (event.deltaY > 0 ? 0.94 : 1.06), 0.25, 4);
  }
  syncTextureSlots();
  queueRender();
}

function rgbToHex(color) {
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function loadTextureFile(file, callback) {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => callback(image);
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function imageToCanvas(image) {
  const texture = document.createElement("canvas");
  texture.width = textureSize;
  texture.height = textureSize;
  const t = texture.getContext("2d");
  const ratio = image.width / image.height;
  let drawW = textureSize;
  let drawH = textureSize;
  let dx = 0;
  let dy = 0;
  if (ratio > 1) {
    drawH = textureSize;
    drawW = textureSize * ratio;
    dx = (textureSize - drawW) / 2;
  } else {
    drawW = textureSize;
    drawH = textureSize / ratio;
    dy = (textureSize - drawH) / 2;
  }
  t.drawImage(image, dx, dy, drawW, drawH);
  return texture;
}

function posterizeToToneData(source, levels) {
  const count = Math.round(levels);
  const values = new Uint8ClampedArray(source.length);
  const indexes = new Uint8Array(source.length);
  const maxLevel = Math.max(1, count - 1);

  for (let i = 0; i < source.length; i += 1) {
    const bucket = Math.round((source[i] / 255) * maxLevel);
    indexes[i] = bucket;
    values[i] = (bucket / maxLevel) * 255;
  }

  return { indexes, values, levels: count };
}

function continuousToneData(source) {
  return {
    indexes: null,
    values: source,
    levels: Math.round(oilParams.posterizeLevels),
  };
}

function collageToImageData(toneData, width, height) {
  if (!toneData.indexes) return gradientMapToImageData(toneData.values, width, height, toneData.levels);
  const imageData = indexedGradientMapToImageData(toneData.indexes, width, height);
  const textureData = textureLayers.slice(0, toneData.levels).map((layer, index) => {
    if (!layer.custom) return null;
    const textureCanvas = layer.custom;
    const rendered = renderTextureToSize(textureCanvas, width, height, index, layer.transform);
    return rendered.getContext("2d").getImageData(0, 0, width, height).data;
  });

  for (let i = 0, p = 0; p < toneData.indexes.length; i += 4, p += 1) {
    const layerIndex = Math.min(textureData.length - 1, toneData.indexes[p]);
    const source = textureData[layerIndex];
    if (source) {
      imageData.data[i] = source[i];
      imageData.data[i + 1] = source[i + 1];
      imageData.data[i + 2] = source[i + 2];
    }
    imageData.data[i + 3] = 255;
  }

  return imageData;
}

function drawFinalResult(toneData, width, height) {
  if (!enabledSections.gradientMap) {
    ctx.putImageData(grayToImageData(toneData.values, width, height), 0, 0);
    return;
  }

  const baseImage = toneData.indexes
    ? indexedGradientMapToImageData(toneData.indexes, width, height)
    : gradientMapToImageData(toneData.values, width, height, toneData.levels);
  ctx.putImageData(baseImage, 0, 0);

  if (toneData.indexes) {
    overlayTextureLayers(toneData, width, height);
  }
}

function overlayTextureLayers(toneData, width, height) {
  textureLayers.slice(0, toneData.levels).forEach((layer, layerIndex) => {
    if (!layer.custom) return;

    const textureCanvas = renderTextureToSize(layer.custom, width, height, layerIndex, layer.transform);
    const maskCanvas = createToneMask(toneData.indexes, layerIndex, width, height);
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext("2d");

    layerCtx.drawImage(textureCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.drawImage(maskCanvas, 0, 0);
    layerCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(layerCanvas, 0, 0);
  });
}

function createToneMask(indexes, targetIndex, width, height) {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  const maskData = maskCtx.createImageData(width, height);

  for (let i = 0, p = 0; p < indexes.length; i += 4, p += 1) {
    const alpha = indexes[p] === targetIndex ? 255 : 0;
    maskData.data[i] = 255;
    maskData.data[i + 1] = 255;
    maskData.data[i + 2] = 255;
    maskData.data[i + 3] = alpha;
  }

  maskCtx.putImageData(maskData, 0, 0);
  return maskCanvas;
}

function indexedGradientMapToImageData(indexes, width, height) {
  const imageData = ctx.createImageData(width, height);
  for (let i = 0, p = 0; p < indexes.length; i += 4, p += 1) {
    const color = mapColors[Math.min(mapColors.length - 1, indexes[p])];
    imageData.data[i] = color[0];
    imageData.data[i + 1] = color[1];
    imageData.data[i + 2] = color[2];
    imageData.data[i + 3] = 255;
  }
  return imageData;
}

function gradientMapToImageData(values, width, height, levels) {
  const imageData = ctx.createImageData(width, height);
  const maxLevel = Math.max(1, levels - 1);
  for (let i = 0, p = 0; p < values.length; i += 4, p += 1) {
    const colorIndex = Math.min(mapColors.length - 1, Math.round((values[p] / 255) * maxLevel));
    const color = mapColors[colorIndex];
    imageData.data[i] = color[0];
    imageData.data[i + 1] = color[1];
    imageData.data[i + 2] = color[2];
    imageData.data[i + 3] = 255;
  }
  return imageData;
}

function renderTextureToSize(textureCanvas, width, height, index, transform = createDefaultTextureTransform(index)) {
  const rendered = document.createElement("canvas");
  rendered.width = width;
  rendered.height = height;
  const target = rendered.getContext("2d");
  const scale = Math.max(width / textureCanvas.width, height / textureCanvas.height) * (1 + index * 0.04) * transform.scale;
  target.save();
  target.translate(width / 2 + transform.offsetX, height / 2 + transform.offsetY);
  target.rotate(transform.rotation);
  target.scale(scale, scale);
  target.drawImage(textureCanvas, -textureCanvas.width / 2, -textureCanvas.height / 2);
  target.restore();
  return rendered;
}

function syncParamOutputs() {
  paramInputs.forEach((input) => {
    const value = Number(input.value);
    oilParams[input.dataset.param] = value;
    const output = document.querySelector(`#${input.dataset.param}Value`);
    if (output) output.value = Number.isInteger(value) ? String(value) : value.toFixed(1);
  });
}

function syncSectionStates() {
  toggleInputs.forEach((input) => {
    enabledSections[input.dataset.toggle] = input.checked;
  });

  document.querySelectorAll("[data-section]").forEach((row) => {
    const enabled = enabledSections[row.dataset.section];
    row.classList.toggle("disabled", !enabled);
    row.querySelectorAll("input").forEach((input) => {
      input.disabled = !enabled;
    });
  });
}

function grayToImageData(gray, width, height) {
  const imageData = ctx.createImageData(width, height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    const value = gray[p];
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = 255;
  }
  return imageData;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function downloadPng() {
  if (!hasImage) return;
  const link = document.createElement("a");
  link.download = "collage-studio.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

initialize();
