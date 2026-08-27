import {
  resizeImageToJpeg,
  type ResizedJpegImage,
} from 'app/shared/utils/resize-image';

/** Long-edge cap for club logos (header/sidenav display; keeps Storage downloads small). */
export const CLUB_LOGO_MAX_LONG_EDGE = 512;

/** JPEG quality for club logo re-encode. */
export const CLUB_LOGO_JPEG_QUALITY = 0.82;

/** Reject source files larger than this before attempting decode/resize. */
export const CLUB_LOGO_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export type ClubLogoJpeg = ResizedJpegImage;

/** Resize/re-encode a logo File to a display-sized JPEG. */
export async function resizeFileToClubLogoJpeg(file: File): Promise<ClubLogoJpeg> {
  return resizeImageToJpeg(file, {
    maxLongEdge: CLUB_LOGO_MAX_LONG_EDGE,
    quality: CLUB_LOGO_JPEG_QUALITY,
  });
}
