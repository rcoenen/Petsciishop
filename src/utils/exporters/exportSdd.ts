import { FramebufWithFont } from '../../redux/types';

function toHex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

export function saveSDD(fb: FramebufWithFont): string {
  const { framebuf, width, height, backgroundColor, borderColor, name } = fb;
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="utf-8" standalone="yes"?>');
  lines.push('<!-- Application version : 3.9.0 -->');
  lines.push('<ScreenDesignerData>');
  lines.push('    <FileVersion>3</FileVersion>');
  lines.push(`    <Rows>${height}</Rows>`);
  lines.push(`    <Columns>${width}</Columns>`);
  lines.push('    <Mode>0</Mode>');
  lines.push('    <ScreenMode>0</ScreenMode>');
  lines.push('    <CharacterSet />');
  lines.push('    <Screens>');
  lines.push('        <Screen>');
  lines.push(`            <BK1Colour>0</BK1Colour>`);
  lines.push(`            <BK2Colour>0</BK2Colour>`);
  lines.push(`            <M3Colour>0</M3Colour>`);
  lines.push(`            <BackgroundColour>${backgroundColor}</BackgroundColour>`);
  lines.push(`            <BorderColour>${borderColor}</BorderColour>`);
  lines.push(`            <D021Colour>${backgroundColor}</D021Colour>`);
  lines.push(`            <D022Colour>0</D022Colour>`);
  lines.push(`            <D023Colour>0</D023Colour>`);
  lines.push(`            <D024Colour>0</D024Colour>`);

  for (let row = 0; row < height; row++) {
    const cells: string[] = [];
    for (let col = 0; col < width; col++) {
      const pixel = framebuf[row]?.[col] ?? { code: 32, color: 14 };
      const charHex = toHex2(pixel.code);
      const colorHex = pixel.color.toString(16).toUpperCase();
      // Token format: [CharHi][CharLo][0][ColorHex][7][Bank][0] = 7 chars
      cells.push(`${charHex}0${colorHex}700`);
    }
    lines.push(`            <RowData>${cells.join(',')}</RowData>`);
  }

  lines.push(`            <Description>${name ?? 'Screen'}</Description>`);
  lines.push('        </Screen>');
  lines.push('    </Screens>');
  lines.push('</ScreenDesignerData>');

  return lines.join('\n');
}
