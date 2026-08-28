import JSZip from 'jszip';
import saveAs from 'file-saver';
import { AnnotationItem } from '../types';

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

const captionFileName = (item: AnnotationItem, ext: string): string => {
  const base = item.relPath || item.name;
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base) + ext;
};

export const downloadCaptionsAsZip = async (
  items: AnnotationItem[],
  captionExt = '.txt',
): Promise<number> => {
  const zip = new JSZip();
  let count = 0;

  items.forEach((item) => {
    const caption = item.caption?.trim();
    if (caption && item.status === 'success') {
      zip.file(captionFileName(item, captionExt).replace(/\\/g, '/'), caption + '\n');
      count += 1;
    }
  });

  if (count === 0) return 0;

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, 'image_captions.zip');
  return count;
};

export const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const truncatePath = (path: string, max = 64): string =>
  path.length <= max ? path : `…${path.slice(-(max - 1))}`;
