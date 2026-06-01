import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tempDir = path.join(root, ".omx", "run");
const assetsDir = path.join(root, "src", "assets");
const pngPath = path.join(assetsDir, "app-icon.png");
const icoPath = path.join(assetsDir, "app-icon.ico");
const shortcutIcoPath = path.join(assetsDir, "app-icon-shortcut.ico");
const icoSizes = [256, 128, 64, 48, 32, 16];

if (process.platform !== "win32") {
  console.error("render-app-icon.mjs currently supports Windows only.");
  process.exit(1);
}

fs.mkdirSync(tempDir, { recursive: true });

function createIcoBuffer(buffers) {
  const count = buffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(count * 16);
  let offset = header.length + directory.length;

  buffers.forEach(({ size, data }, index) => {
    const cursor = index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, cursor);
    directory.writeUInt8(size === 256 ? 0 : size, cursor + 1);
    directory.writeUInt8(0, cursor + 2);
    directory.writeUInt8(0, cursor + 3);
    directory.writeUInt16LE(1, cursor + 4);
    directory.writeUInt16LE(32, cursor + 6);
    directory.writeUInt32LE(data.length, cursor + 8);
    directory.writeUInt32LE(offset, cursor + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...buffers.map(({ data }) => data)]);
}

function toPowerShellPath(filePath) {
  return filePath.replace(/'/g, "''");
}

const outputs = icoSizes.map((size) => ({
  size,
  file: path.join(tempDir, `app-icon-${size}.png`)
}));

const outputList = outputs
  .map(({ size, file }) => `@{ Size = ${size}; Path = '${toPowerShellPath(file)}' }`)
  .join(",\n  ");

const powershell = `
Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Color([int]$a, [int]$r, [int]$g, [int]$b) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Draw-AppIcon([int]$size, [string]$outputPath) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $size / 256.0
  function S([double]$value) { return [float]($value * $scale) }

  $shadowBrush = New-Object System.Drawing.SolidBrush((New-Color 20 28 44 54))
  $graphics.FillEllipse($shadowBrush, (S 18), (S 30), (S 220), (S 220))
  $shadowBrush.Dispose()

  $circlePath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $circlePath.AddEllipse((S 14), (S 14), (S 228), (S 228))

  $circleBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($circlePath)
  $circleBrush.CenterPoint = New-Object System.Drawing.PointF((S 108), (S 90))
  $circleBrush.CenterColor = New-Color 204 228 239 244
  $circleBrush.SurroundColors = @((New-Color 150 165 186 194))
  $graphics.FillPath($circleBrush, $circlePath)
  $circleBrush.Dispose()

  $strokeRect = New-Object System.Drawing.RectangleF((S 15.5), (S 15.5), (S 225), (S 225))
  $strokeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF((S 42), (S 24))),
    (New-Object System.Drawing.PointF((S 214), (S 232))),
    (New-Color 194 250 253 255),
    (New-Color 118 132 153 162)
  )
  $strokePen = New-Object System.Drawing.Pen($strokeBrush, (S 2.4))
  $graphics.DrawEllipse($strokePen, $strokeRect.X, $strokeRect.Y, $strokeRect.Width, $strokeRect.Height)
  $strokePen.Dispose()
  $strokeBrush.Dispose()

  $highlightBrush = New-Object System.Drawing.SolidBrush((New-Color 74 250 253 255))
  $graphics.FillEllipse($highlightBrush, (S 42), (S 28), (S 152), (S 76))
  $highlightBrush.Dispose()

  $highlightSoftBrush = New-Object System.Drawing.SolidBrush((New-Color 28 248 252 255))
  $graphics.FillEllipse($highlightSoftBrush, (S 64), (S 50), (S 122), (S 50))
  $highlightSoftBrush.Dispose()

  $lowerGlowBrush = New-Object System.Drawing.SolidBrush((New-Color 24 236 245 249))
  $graphics.FillEllipse($lowerGlowBrush, (S 54), (S 144), (S 148), (S 82))
  $lowerGlowBrush.Dispose()

  $dotBrush = New-Object System.Drawing.SolidBrush((New-Color 238 140 255 180))
  $graphics.FillEllipse($dotBrush, (S 42), (S 42), (S 46), (S 46))
  $dotBrush.Dispose()

  $stringFormat = New-Object System.Drawing.StringFormat
  $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

  $tokenFont = New-Object System.Drawing.Font("Segoe UI", (S 70), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $tokenShadowBrush = New-Object System.Drawing.SolidBrush((New-Color 92 57 80 91))
  $tokenBrush = New-Object System.Drawing.SolidBrush((New-Color 255 255 255 255))
  $graphics.DrawString("Token", $tokenFont, $tokenShadowBrush, (New-Object System.Drawing.RectangleF((S 0), (S 80), (S 256), (S 88))), $stringFormat)
  $graphics.DrawString("Token", $tokenFont, $tokenBrush, (New-Object System.Drawing.RectangleF((S 0), (S 74), (S 256), (S 88))), $stringFormat)
  $tokenShadowBrush.Dispose()
  $tokenBrush.Dispose()
  $tokenFont.Dispose()

  $badgePath = New-RoundedRectPath (S 66) (S 176) (S 124) (S 46) (S 16)
  $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF((S 68), (S 174))),
    (New-Object System.Drawing.PointF((S 186), (S 224))),
    (New-Color 174 242 248 250),
    (New-Color 132 214 228 235)
  )
  $graphics.FillPath($badgeBrush, $badgePath)
  $badgeBrush.Dispose()

  $badgePen = New-Object System.Drawing.Pen((New-Color 140 242 248 252), (S 1.6))
  $graphics.DrawPath($badgePen, $badgePath)
  $badgePen.Dispose()
  $badgePath.Dispose()

  $hudFont = New-Object System.Drawing.Font("Segoe UI", (S 24), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $hudBrush = New-Object System.Drawing.SolidBrush((New-Color 248 49 69 81))
  $graphics.DrawString("HUD", $hudFont, $hudBrush, (New-Object System.Drawing.RectangleF((S 66), (S 176), (S 124), (S 46))), $stringFormat)
  $hudBrush.Dispose()
  $hudFont.Dispose()

  $stringFormat.Dispose()
  $circlePath.Dispose()
  $graphics.Dispose()
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$outputs = @(
  ${outputList}
)

foreach ($item in $outputs) {
  Draw-AppIcon -size $item.Size -outputPath $item.Path
}
`;

const run = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powershell], {
  cwd: root,
  stdio: "inherit"
});

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const png256 = fs.readFileSync(outputs.find((item) => item.size === 256).file);
fs.writeFileSync(pngPath, png256);

const icoBuffers = outputs.map(({ size, file }) => ({
  size,
  data: fs.readFileSync(file)
}));
const icoBuffer = createIcoBuffer(icoBuffers);
fs.writeFileSync(icoPath, icoBuffer);
fs.writeFileSync(shortcutIcoPath, icoBuffer);
