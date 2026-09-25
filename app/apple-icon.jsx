import { ImageResponse } from 'next/og';
import MarkPng from '../components/MarkPng.jsx';

/* The icon an iPhone puts on the home screen. Square: iOS rounds it. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<MarkPng size={180} radius={0} inset={10} />, size);
}
