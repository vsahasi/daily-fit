export async function bytesToJpeg(bytes: Buffer, mime = "") {
  const kind = `${mime}`.toLowerCase();
  const looksHeic = kind.includes("heic") || kind.includes("heif");
  if (!looksHeic) return bytes;

  try {
    const mod = (await import("heic-convert")) as { default?: unknown };
    const convert = (typeof mod.default === "function" ? mod.default : mod) as (opts: {
      buffer: Buffer;
      format: "JPEG";
      quality: number;
    }) => Promise<ArrayBuffer>;
    const out = await convert({ buffer: bytes, format: "JPEG", quality: 0.88 });
    return Buffer.from(out);
  } catch {
    return bytes;
  }
}
