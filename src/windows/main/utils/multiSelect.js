import { getPrimaryType } from '@shared/utils/contentType';

const TEXT_TYPES = new Set(['text', 'link', 'rich_text']);
const MERGEABLE_TYPES = new Set(['text', 'link', 'rich_text', 'image', 'file']);

export function getSelectionMergeState(selectedEntries = []) {
  if (!selectedEntries.length) {
    return {
      canMerge: false,
      reasonKey: 'selectFirst',
    };
  }

  const primaryTypes = selectedEntries.map(entry => getPrimaryType(entry.contentType));
  const hasUnsupportedType = primaryTypes.some(type => !MERGEABLE_TYPES.has(type));
  if (hasUnsupportedType) {
    return {
      canMerge: false,
      reasonKey: 'unsupportedType',
    };
  }

  const hasFile = primaryTypes.includes('file');
  const hasNonFile = primaryTypes.some(type => type !== 'file');
  if (hasFile && hasNonFile) {
    return {
      canMerge: false,
      reasonKey: 'fileMixedUnsupported',
    };
  }

  return {
    canMerge: true,
    requiresRichText: primaryTypes.some(type => type === 'image' || type === 'rich_text'),
    isFileOnly: primaryTypes.every(type => type === 'file'),
    isTextOnly: primaryTypes.every(type => TEXT_TYPES.has(type)),
    reasonKey: null,
  };
}
