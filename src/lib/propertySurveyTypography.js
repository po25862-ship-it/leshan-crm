const ORIGINAL = '"Hannotate TC","物調文楷","PingFang TC","Microsoft JhengHei",sans-serif';
const FALLBACK = '"PingFang TC","Microsoft JhengHei",sans-serif';
const FONTS = Object.freeze({
  original: { label: '原物調字型', canvas: ORIGINAL },
  sans: { label: 'Noto Sans TC（黑體）', web: '物調黑體', word: 'Noto Sans TC' },
  serif: { label: 'Noto Serif TC（宋體）', web: '物調宋體', word: 'Noto Serif TC' },
  wenkai: { label: '霞鶩文楷 TC', web: '物調文楷', word: 'LXGW WenKai TC' },
  round: { label: 'jf open 粉圓', web: '物調圓體', word: 'Huninn' }
});
const DEFAULT_TYPOGRAPHY = Object.freeze({ font: 'original', sizePercent: 100, lineSpacing: 1.2, bold: true });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function resolveTypography(value) {
  const data = isObject(value) ? value : {};
  const { font, sizePercent, lineSpacing, bold } = data;
  return {
    font: typeof font === 'string' && Object.hasOwn(FONTS, font) ? font : DEFAULT_TYPOGRAPHY.font,
    sizePercent: Number.isInteger(sizePercent) && sizePercent >= 85 && sizePercent <= 115 ? sizePercent : 100,
    lineSpacing: typeof lineSpacing === 'number' && lineSpacing >= 1.1 && lineSpacing <= 2 ? lineSpacing : 1.2,
    bold: typeof bold === 'boolean' ? bold : true
  };
}

function canvasFamily(font) {
  return font.canvas || `"${font.web}",${FALLBACK}`;
}

function normalizeEmphasis(value, points) {
  if (!Array.isArray(value)) return [];
  const choices = new Set();
  for (const item of value) {
    const term = typeof item === 'string' ? item.trim() : '';
    if (term && term.length <= 500 && !choices.has(term) && points.some(point => point.includes(term))) choices.add(term);
    if (choices.size >= 24) break;
  }
  return [...choices];
}

function sellingPointRuns(point, emphasis = []) {
  const terms = normalizeEmphasis(emphasis, [point]).sort((a, b) => b.length - a.length);
  const runs = [];
  const push = (text, highlighted) => {
    if (runs.at(-1)?.highlighted === highlighted) runs.at(-1).text += text;
    else runs.push({ text, highlighted });
  };
  for (let i = 0; i < point.length;) {
    const match = terms.find(term => point.startsWith(term, i));
    push(match || point[i], Boolean(match));
    i += match?.length || 1;
  }
  return runs;
}

module.exports = { FONTS, DEFAULT_TYPOGRAPHY, resolveTypography, canvasFamily, normalizeEmphasis, sellingPointRuns };
