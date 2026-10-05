"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadOne } from "@/app/actions";

async function toJpeg(file: File) {
  if (/heic|heif/i.test(file.type) || /\.heic$|\.heif$/i.test(file.name)) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read image");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Could not encode photo"))),
        "image/jpeg",
        0.88,
      );
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function UploadDrop({ variant = "hero" }: { variant?: "hero" | "quiet" | "tile" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    try {
      const files = [...fileList];
      for (let i = 0; i < files.length; i += 1) {
        setStatus(`Adding ${i + 1} of ${files.length}`);
        const photo = await toJpeg(files[i]);
        const formData = new FormData();
        formData.append("photo", photo);
        await uploadOne(formData);
        router.refresh();
      }
      setStatus(`Added ${files.length === 1 ? "1 piece" : `${files.length} pieces`}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*,.heic,.HEIC,.heif,.HEIF"
      multiple
      className="sr-only"
      disabled={busy}
      onChange={(event) => {
        void handleFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );

  if (variant === "quiet") {
    return (
      <div>
        {input}
        <button type="button" className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? status || "Adding…" : "Add a piece"}
        </button>
      </div>
    );
  }

  if (variant === "tile") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-snow text-mute hover:text-ink"
      >
        {input}
        <span className="text-2xl">{busy ? "…" : "+"}</span>
        <span className="mt-2 text-[12px]">{busy ? status : "Add a piece"}</span>
      </button>
    );
  }

  return (
    <div className="bg-snow px-8 py-10 sm:px-10">
      {input}
      <p className="max-w-sm text-[14px] leading-[22px] text-mute">
        One garment per photo, hanger or laid flat. HEIC from iPhone is fine.
      </p>
      <button type="button" className="btn mt-6" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? status || "Adding…" : "Add a piece"}
      </button>
      {status && !busy ? <p className="mt-3 text-[13px] text-mute">{status}</p> : null}
    </div>
  );
}
